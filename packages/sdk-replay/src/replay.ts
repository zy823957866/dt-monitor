import {
	DEFAULT_REPLAY_BUFFER_MAX_BYTES,
	DEFAULT_REPLAY_BUFFER_MS,
	DEFAULT_REPLAY_CHUNK_INTERVAL_MS,
	DEFAULT_REPLAY_CHUNK_MAX_BYTES,
	DEFAULT_REPLAY_ERROR_SAMPLE_RATE,
	DEFAULT_REPLAY_MAX_DURATION_MS,
	DEFAULT_REPLAY_SESSION_SAMPLE_RATE,
	REPLAY_MASK_VERSION,
	createReplayChunkUrl,
	parseDsn,
} from '@dt-monitor/contracts'
import type { ParsedDsn, ReplayChunkMeta } from '@dt-monitor/contracts'
import type { MonitorClient, MonitorOptions, MonitorPlugin } from '@dt-monitor/sdk-core'
import { isSampled } from '@dt-monitor/sdk-core'
import { byteLength, encodeJson, fnv1aHex, gzipBytes } from './compression'
import { loadRrwebRecorder } from './recorder'
import { createReplayChunkUploader } from './uploader'
import type {
	ReplayChunkUploader,
	ReplayHandle,
	ReplayPluginOptions,
	ReplayRecorderEvent,
	ReplayRecorderLoader,
} from './types'

/** 客户端到 Replay 句柄的映射。 */
const replayByClient = new WeakMap<MonitorClient, ReplayHandle>()

/** 缓冲中的录制事件。 */
interface BufferedEvent {
	event: ReplayRecorderEvent
	size: number
}

/**
 * 获取客户端关联的 Replay 句柄。
 * @param client 监控客户端
 * @returns Replay 句柄或 undefined
 */
export function getReplay(client: MonitorClient): ReplayHandle | undefined {
	return replayByClient.get(client)
}

/**
 * 创建 Session Replay 插件。
 * @param options 插件选项
 * @returns 监控插件
 */
export function replayPlugin(options: ReplayPluginOptions = {}): MonitorPlugin {
	const sessionSampleRate =
		options.sessionSampleRate ?? DEFAULT_REPLAY_SESSION_SAMPLE_RATE
	const errorSampleRate = options.errorSampleRate ?? DEFAULT_REPLAY_ERROR_SAMPLE_RATE
	const chunkIntervalMs = Math.max(1, options.chunkIntervalMs ?? DEFAULT_REPLAY_CHUNK_INTERVAL_MS)
	const chunkMaxBytes = Math.max(1_024, options.chunkMaxBytes ?? DEFAULT_REPLAY_CHUNK_MAX_BYTES)
	const maxDurationMs = Math.max(1, options.maxDurationMs ?? DEFAULT_REPLAY_MAX_DURATION_MS)
	const bufferDurationMs = Math.max(1, options.bufferDurationMs ?? DEFAULT_REPLAY_BUFFER_MS)
	const bufferMaxBytes = Math.max(1_024, options.bufferMaxBytes ?? DEFAULT_REPLAY_BUFFER_MAX_BYTES)
	const uploadRetry = Math.max(0, options.uploadRetry ?? 3)
	const retryBaseDelayMs = Math.max(0, options.retryBaseDelayMs ?? 500)
	const random = options.random ?? Math.random
	const now = options.now ?? (() => Date.now())
	const uuid = options.uuid ?? createDefaultUuid
	const compressor = options.compressor ?? gzipBytes
	const checksum = options.checksum ?? fnv1aHex
	const retryDelay = options.retryDelay ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
	const recorderLoader: ReplayRecorderLoader = options.recorderLoader ?? loadRrwebRecorder
	const maskAllInputs = options.maskAllInputs ?? true
	const blockSelector = options.blockSelector ?? '[data-dt-monitor-block]'
	let client: MonitorClient | undefined
	let dsn: ParsedDsn | undefined
	let uploader: ReplayChunkUploader | undefined
	let mode: 'off' | 'buffer' | 'session' = 'off'
	let recording = false
	let recorderActive = false
	let paused = false
	let stopped = false
	let consented = options.consent ?? true
	let replayId: string | undefined
	let sessionId = ''
	let samplingReason: 'session' | 'error' | undefined
	let truncated = false
	let stopReason: string | undefined
	let sequence = 0
	let recordingStartedAt = 0
	let recorderStop: (() => void) | undefined
	let readyPromise: Promise<void> = Promise.resolve()
	let uploadChain: Promise<void> = Promise.resolve()
	let chunkTimer: ReturnType<typeof setInterval> | null = null
	let pageHideListener: (() => void) | undefined
	let currentChunk: ReplayRecorderEvent[] = []
	let currentBytes = 0
	let chunkStartedAt = 0
	let buffered: BufferedEvent[] = []
	let bufferBytes = 0

	/**
	 * 生成默认 Replay ID。
	 * @returns UUID
	 */
	function createDefaultUuid(): string {
		return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`
	}

	/**
	 * 估算单条录制事件大小。
	 * @param event 录制事件
	 * @returns 字节数
	 */
	function eventSize(event: ReplayRecorderEvent): number {
		return byteLength(event)
	}

	/**
	 * 同步 Replay 上下文。
	 * @param active 当前是否录制
	 */
	function syncReplayContext(active: boolean): void {
		if (!client) return
		if (!replayId) {
			client.setReplayContext(null)
			return
		}
		client.setReplayContext({
			replayId,
			recording: active,
			samplingReason,
		})
	}

	/**
	 * 清理分片定时器。
	 */
	function clearChunkTimer(): void {
		if (chunkTimer !== null) {
			clearInterval(chunkTimer)
			chunkTimer = null
		}
	}

	/**
	 * 启动分片定时器。
	 */
	function scheduleChunkTimer(): void {
		clearChunkTimer()
		if (mode !== 'session' || stopped) return
		chunkTimer = setInterval(() => {
			finalizeCurrentChunk()
		}, chunkIntervalMs)
	}

	/**
	 * 将缓冲事件裁剪到时间与容量限制。
	 */
	function trimBuffer(): void {
		const oldestAllowed = now() - bufferDurationMs
		while (buffered.length > 0) {
			const first = buffered[0]
			if (!first) break
			if (bufferBytes <= bufferMaxBytes && first.event.timestamp >= oldestAllowed) break
			buffered.shift()
			bufferBytes -= first.size
		}
	}

	/**
	 * 新增滚动缓冲事件。
	 * @param event 录制事件
	 */
	function appendBuffer(event: ReplayRecorderEvent): void {
		const size = eventSize(event)
		buffered.push({ event, size })
		bufferBytes += size
		trimBuffer()
	}

	/**
	 * 处理录制器事件。
	 * @param event 录制事件
	 */
	function handleRecorderEvent(event: ReplayRecorderEvent): void {
		if (stopped || paused || !consented || !recorderActive) return
		if (mode === 'buffer' && !recording) {
			appendBuffer(event)
			return
		}
		if (!recording) return
		if (now() - recordingStartedAt >= maxDurationMs) {
			truncated = true
			finalizeCurrentChunk()
			stopRecording('duration-limit')
			return
		}
		const size = eventSize(event)
		if (currentChunk.length === 0) chunkStartedAt = now()
		currentChunk.push(event)
		currentBytes += size
		if (currentBytes >= chunkMaxBytes) finalizeCurrentChunk()
	}

	/**
	 * 将事件组排入上传队列。
	 * @param events 录制事件
	 * @param startedAt 分片开始时间戳
	 * @param endedAt 分片结束时间戳
	 * @param isTruncated 是否截断
	 */
	function enqueueUpload(
		events: ReplayRecorderEvent[],
		startedAt: number,
		endedAt: number,
		isTruncated = false,
	): void {
		if (!dsn || !replayId || events.length === 0) return
		const targetReplayId = replayId
		const raw = encodeJson(events)
		const metaBase = {
			replayId: targetReplayId,
			sessionId,
			sequence: sequence++,
			startedAt: new Date(startedAt).toISOString(),
			endedAt: new Date(endedAt).toISOString(),
			rawSize: raw.byteLength,
			maskVersion: REPLAY_MASK_VERSION,
			truncated: isTruncated || truncated || undefined,
		}
		const task = (async () => {
			const compressed = await compressor(raw)
			if (!compressed) {
				stopRecording('compression-unavailable')
				return
			}
			const meta: ReplayChunkMeta = {
				...metaBase,
				compressedSize: compressed.byteLength,
				checksum: checksum(compressed),
			}
			await uploadWithRetry(compressed, meta)
		})()
		uploadChain = uploadChain.then(() => task).catch(() => undefined)
	}

	/**
	 * 上传分片并按有限次数重试。
	 * @param data gzip 字节
	 * @param meta 分片元数据
	 */
	async function uploadWithRetry(data: Uint8Array, meta: ReplayChunkMeta): Promise<void> {
		if (!dsn || !uploader) return
		const url = createReplayChunkUrl(
			optionsDsn(),
			meta.replayId,
			meta.sequence,
			meta.sessionId,
			meta.checksum,
		)
		let attempt = 0
		while (attempt <= uploadRetry && !stopped) {
			const result = await uploader({ url, data, meta })
			if (result.success) return
			if (!result.retryable || attempt >= uploadRetry) {
				stopRecording('upload-failed')
				return
			}
			attempt += 1
			await retryDelay(retryBaseDelayMs * 2 ** (attempt - 1))
		}
	}

	/**
	 * 返回已解析 DSN。
	 * @returns DSN
	 */
	function optionsDsn(): ParsedDsn {
		if (!dsn) throw new Error('Replay DSN 未初始化')
		return dsn
	}

	/**
	 * 结束当前分片并上传。
	 * @param isTruncated 是否截断
	 */
	function finalizeCurrentChunk(isTruncated = false): void {
		if (currentChunk.length === 0) return
		const events = currentChunk
		const startedAt = chunkStartedAt || now()
		const endedAt = now()
		currentChunk = []
		currentBytes = 0
		chunkStartedAt = 0
		enqueueUpload(events, startedAt, endedAt, isTruncated)
	}

	/**
	 * 停止录制。
	 * @param reason 停止原因
	 */
	function stopRecording(reason?: string): void {
		recording = false
		recorderActive = false
		stopReason = reason
		stopRecorder()
		clearChunkTimer()
		currentChunk = []
		currentBytes = 0
		chunkStartedAt = 0
		buffered = []
		bufferBytes = 0
		syncReplayContext(false)
	}

	/**
	 * 停止底层录制器。
	 */
	function stopRecorder(): void {
		try {
			recorderStop?.()
		} catch {
			// 录制器清理失败不能影响宿主。
		}
		recorderStop = undefined
	}

	/**
	 * 加载并启动 rrweb 录制器。
	 */
	function startRecorder(): void {
		if (recorderActive || stopped || paused || !consented || mode === 'off') return
		recorderActive = true
		const loadPromise = recorderLoader()
		readyPromise = loadPromise
			.then((module) => {
				if (stopped || paused || !recorderActive) return
				recorderStop = module.record({
					emit: handleRecorderEvent,
					maskAllInputs,
					maskInputOptions: options.maskInputOptions,
					maskTextSelector: options.maskTextSelector,
					blockSelector,
					recordCanvas: options.recordCanvas ?? false,
					collectFonts: options.collectFonts ?? false,
					inlineStylesheet: options.inlineStylesheet ?? false,
				})
			})
			.catch(() => {
				recorderActive = false
				recording = false
				stopReason = 'recorder-load-failed'
				syncReplayContext(false)
			})
	}

	/**
	 * 将缓冲区间切成合法分片后上传。
	 */
	function drainBuffer(): void {
		if (!recording || !replayId) return
		let group: ReplayRecorderEvent[] = []
		let groupBytes = 0
		let groupStart = buffered[0]?.event.timestamp ?? now()
		let lastTimestamp = groupStart
		for (const item of buffered) {
			const size = item.size
			if (group.length > 0 && groupBytes + size > chunkMaxBytes) {
				enqueueUpload(group, groupStart, lastTimestamp)
				group = []
				groupBytes = 0
				groupStart = item.event.timestamp
			}
			group.push(item.event)
			groupBytes += size
			lastTimestamp = item.event.timestamp
		}
		if (group.length > 0) enqueueUpload(group, groupStart, lastTimestamp)
		buffered = []
		bufferBytes = 0
	}

	/**
	 * 由错误触发从缓冲模式升级为录制会话。
	 * @returns 是否完成升级
	 */
	function promoteOnError(): boolean {
		if (mode !== 'buffer' || recording || !consented || stopped) return false
		if (!isSampled(errorSampleRate, random)) return false
		mode = 'session'
		replayId = uuid()
		samplingReason = 'error'
		recordingStartedAt = now()
		sequence = 0
		truncated = false
		recording = true
		syncReplayContext(true)
		drainBuffer()
		return true
	}

	/**
	 * 暂停录制并丢弃未上传片段。
	 */
	function pause(): void {
		if (paused) return
		paused = true
		recording = false
		recorderActive = false
		stopRecorder()
		clearChunkTimer()
		currentChunk = []
		currentBytes = 0
		chunkStartedAt = 0
		buffered = []
		bufferBytes = 0
		syncReplayContext(false)
	}

	/**
	 * 恢复录制并开启新片段。
	 */
	function resume(): void {
		if (stopped || !consented || mode === 'off') return
		paused = false
		if (mode === 'session') {
			recording = true
			recordingStartedAt = now()
			syncReplayContext(true)
		}
		startRecorder()
		scheduleChunkTimer()
	}

	/**
	 * 设置用户同意状态。
	 * @param value 是否同意
	 */
	function setConsent(value: boolean): void {
		consented = value
		if (value) resume()
		else pause()
	}

	/**
	 * 等待录制器加载并发送当前分片。
	 */
	async function flush(): Promise<void> {
		if (stopped) return
		await readyPromise
		finalizeCurrentChunk()
		await uploadChain
	}

	const handle: ReplayHandle = {
		pause,
		resume,
		setConsent,
		flush,
		whenReady: () => readyPromise,
		isRecording: () => recording,
		getReplayId: () => replayId,
		getState: () => ({
			mode,
			recording,
			paused,
			replayId,
			samplingReason,
			truncated,
			stopReason,
		}),
	}

	return {
		name: 'replay',
		setup(instance, initOptions) {
			client = instance
			dsn = parseDsn(initOptions.dsn)
			uploader =
				options.uploader ??
				createReplayChunkUploader({
					dsn,
					keepalive: true,
				})
			replayByClient.set(instance, handle)
		},
		start() {
			if (!client || stopped) return
			sessionId = client.getContext().session?.id ?? uuid()
			if (isSampled(sessionSampleRate, random)) {
				mode = 'session'
				replayId = uuid()
				samplingReason = 'session'
				recording = true
				recordingStartedAt = now()
				syncReplayContext(true)
			} else if (errorSampleRate > 0) {
				mode = 'buffer'
				recording = false
			} else {
				mode = 'off'
				return
			}
			startRecorder()
			scheduleChunkTimer()
			if (typeof window !== 'undefined') {
				pageHideListener = () => {
					finalizeCurrentChunk()
				}
				window.addEventListener('pagehide', pageHideListener)
			}
		},
		beforeSend(event) {
			if (event.type === 'error' && promoteOnError()) {
				// 升级后核心会补充最新的 replay 上下文。
			}
			return event
		},
		stop() {
			stopped = true
			paused = true
			recording = false
			recorderActive = false
			consented = false
			stopRecorder()
			clearChunkTimer()
			if (pageHideListener && typeof window !== 'undefined') {
				window.removeEventListener('pagehide', pageHideListener)
			}
			pageHideListener = undefined
			currentChunk = []
			currentBytes = 0
			chunkStartedAt = 0
			buffered = []
			bufferBytes = 0
			client?.setReplayContext(null)
			if (client) replayByClient.delete(client)
		},
	}
}
