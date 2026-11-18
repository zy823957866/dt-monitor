import { describe, expect, it, vi } from 'vitest'
import type { IngestPayload } from '@dt-monitor/contracts'
import { createMonitorClient } from '@dt-monitor/sdk-core'
import type { MonitorClient, MonitorTransport } from '@dt-monitor/sdk-core'
import { getReplay, replayPlugin } from './index'
import type {
	ReplayChunkUploadRequest,
	ReplayPluginOptions,
	ReplayRecorderEvent,
	ReplayRecorderOptions,
} from './types'

/** 测试环境。 */
interface ReplayTestContext {
	client: MonitorClient
	payloads: IngestPayload[]
	uploads: ReplayChunkUploadRequest[]
	emit(event: ReplayRecorderEvent): void
	recordOptions(): ReplayRecorderOptions | undefined
	loaderCalls(): number
	recordCalls(): number
	stopCalls(): number
}

/**
 * 创建使用假录制器、假上传器的 Replay 测试环境。
 * @param options Replay 选项
 * @returns 测试上下文
 */
function setup(options: ReplayPluginOptions = {}): ReplayTestContext {
	let emitCallback: ((event: ReplayRecorderEvent) => void) | undefined
	let currentRecordOptions: ReplayRecorderOptions | undefined
	let loaderCalls = 0
	let recordCalls = 0
	let stopCalls = 0
	const uploads: ReplayChunkUploadRequest[] = []
	const payloads: IngestPayload[] = []
	const transport: MonitorTransport = {
		async send(payload) {
			payloads.push(payload)
			return { success: true, accepted: payload.events.length }
		},
	}
	const client = createMonitorClient({
		dsn: 'https://pk@example.com/api/ingest/v1/1',
		app: { name: 'replay-test' },
		plugins: [
			replayPlugin({
				random: () => 0,
				now: () => 1_700_000_000_000,
				compressor: async (data) => data,
				checksum: () => 'checksum',
				retryDelay: async () => undefined,
				recorderLoader: async () => {
					loaderCalls += 1
					return {
						record(recordOptions) {
							recordCalls += 1
							currentRecordOptions = recordOptions
							emitCallback = recordOptions.emit
							return () => {
								stopCalls += 1
							}
						},
					}
				},
				uploader: async (request) => {
					uploads.push(request)
					return { success: true }
				},
				...options,
			}),
		],
		transport,
		flushIntervalMs: 0,
		batchSize: 50,
	})
	return {
		client,
		payloads,
		uploads,
		emit: (event) => {
			if (!emitCallback) throw new Error('录制器尚未启动')
			emitCallback(event)
		},
		recordOptions: () => currentRecordOptions,
		loaderCalls: () => loaderCalls,
		recordCalls: () => recordCalls,
		stopCalls: () => stopCalls,
	}
}

describe('replayPlugin', () => {
	it('会话命中采样后加载 rrweb 并上传分片', async () => {
		const context = setup({ sessionSampleRate: 1, errorSampleRate: 0 })
		const replay = getReplay(context.client)
		expect(replay).toBeDefined()
		await replay?.whenReady()
		const recorderOptions = context.recordOptions()
		expect(recorderOptions).toMatchObject({
			maskAllInputs: true,
			recordCanvas: false,
			collectFonts: false,
			inlineStylesheet: false,
		})
		expect(recorderOptions?.blockSelector).toBe('[data-dt-monitor-block]')
		context.emit({
			type: 4,
			timestamp: 1_700_000_000_000,
			data: { source: 0, positions: [{ x: 1, y: 2 }] },
		})
		await replay?.flush()
		expect(context.uploads).toHaveLength(1)
		expect(context.uploads[0]?.meta).toMatchObject({
			sequence: 0,
			sessionId: context.client.getContext().session?.id,
			rawSize: expect.any(Number),
			compressedSize: expect.any(Number),
			checksum: 'checksum',
		})
		expect(context.client.getContext().replay).toMatchObject({
			replayId: replay?.getReplayId(),
			recording: true,
			samplingReason: 'session',
		})
		context.client.disable()
	})

	it('普通会话与错误采样均关闭时不加载录制器', async () => {
		const context = setup({ sessionSampleRate: 0, errorSampleRate: 0 })
		await getReplay(context.client)?.whenReady()
		expect(context.loaderCalls()).toBe(0)
		expect(getReplay(context.client)?.getState().mode).toBe('off')
		context.client.disable()
	})

	it('未命中普通采样时滚动缓冲，错误触发后升格并上传', async () => {
		const context = setup({ sessionSampleRate: 0, errorSampleRate: 1 })
		const replay = getReplay(context.client)
		await replay?.whenReady()
		expect(replay?.getState()).toMatchObject({ mode: 'buffer', recording: false })
		context.emit({ type: 2, timestamp: 1_700_000_000_000, data: { node: 'root' } })
		context.emit({ type: 3, timestamp: 1_700_000_000_001, data: { text: 'before error' } })
		context.client.captureException(new Error('trigger replay'))
		await context.client.flush()
		const errorEvent = context.payloads
			.flatMap((payload) => payload.events)
			.find((event) => event.type === 'error')
		expect(errorEvent?.context.replay).toMatchObject({
			samplingReason: 'error',
			recording: true,
		})
		await replay?.flush()
		expect(context.uploads.length).toBeGreaterThanOrEqual(1)
		expect(context.uploads[0]?.meta.replayId).toBe(errorEvent?.context.replay?.replayId)
		expect(replay?.getState()).toMatchObject({ mode: 'session', recording: true })
		context.client.disable()
	})

	it('暂停后丢弃未上传片段，恢复后开启新录制会话', async () => {
		const context = setup({ sessionSampleRate: 1, errorSampleRate: 0 })
		const replay = getReplay(context.client)
		await replay?.whenReady()
		context.emit({ type: 2, timestamp: 1_700_000_000_000, data: { marker: 'paused-away' } })
		replay?.pause()
		context.emit({ type: 2, timestamp: 1_700_000_000_001, data: { marker: 'ignored' } })
		expect(context.uploads).toHaveLength(0)
		expect(replay?.getState()).toMatchObject({ paused: true, recording: false })
		replay?.resume()
		await replay?.whenReady()
		expect(context.recordCalls()).toBe(2)
		context.emit({ type: 2, timestamp: 1_700_000_000_002, data: { marker: 'resumed' } })
		await replay?.flush()
		expect(context.uploads).toHaveLength(1)
		expect(new TextDecoder().decode(context.uploads[0]?.data)).toContain('resumed')
		expect(new TextDecoder().decode(context.uploads[0]?.data)).not.toContain('paused-away')
		context.client.disable()
	})

	it('上传连续失败后停止录制并记录原因', async () => {
		let attempts = 0
		const context = setup({
			sessionSampleRate: 1,
			errorSampleRate: 0,
			uploadRetry: 2,
			uploader: async () => {
				attempts += 1
				return { success: false, status: 503, retryable: true, reason: 'unavailable' }
			},
		})
		const replay = getReplay(context.client)
		await replay?.whenReady()
		context.emit({ type: 4, timestamp: 1_700_000_000_000, data: { source: 0 } })
		await replay?.flush()
		expect(attempts).toBe(3)
		expect(replay?.getState()).toMatchObject({
			recording: false,
			stopReason: 'upload-failed',
		})
		context.client.disable()
	})

	it('disable 停止录制、丢弃未上传分片并移除句柄', async () => {
		const context = setup({ sessionSampleRate: 1, errorSampleRate: 0 })
		await getReplay(context.client)?.whenReady()
		context.emit({ type: 4, timestamp: 1_700_000_000_000, data: { source: 0 } })
		context.client.disable()
		expect(context.uploads).toHaveLength(0)
		expect(context.stopCalls()).toBe(1)
		expect(getReplay(context.client)).toBeUndefined()
	})
})
