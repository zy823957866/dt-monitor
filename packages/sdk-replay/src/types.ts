import type { ReplayChunkMeta } from '@dt-monitor/contracts'

/** rrweb 兼容录制事件的最小结构。 */
export interface ReplayRecorderEvent {
	timestamp: number
	[key: string]: unknown
}

/** 录制器启动选项。 */
export interface ReplayRecorderOptions {
	emit(event: ReplayRecorderEvent): void
	maskAllInputs: boolean
	maskInputOptions?: Record<string, boolean>
	maskTextSelector?: string
	blockSelector?: string
	recordCanvas: boolean
	collectFonts: boolean
	inlineStylesheet: boolean
}

/** rrweb 兼容录制模块。 */
export interface ReplayRecorderModule {
	record(options: ReplayRecorderOptions): (() => void) | undefined
}

/** 录制器动态加载函数。 */
export type ReplayRecorderLoader = () => Promise<ReplayRecorderModule>

/** Replay 分片上传请求。 */
export interface ReplayChunkUploadRequest {
	url: string
	data: Uint8Array
	meta: ReplayChunkMeta
}

/** Replay 分片上传结果。 */
export interface ReplayChunkUploadResult {
	success: boolean
	status?: number
	retryable?: boolean
	reason?: string
}

/** Replay 分片上传器。 */
export type ReplayChunkUploader = (
	request: ReplayChunkUploadRequest,
) => Promise<ReplayChunkUploadResult>

/** Replay 插件选项。 */
export interface ReplayPluginOptions {
	sessionSampleRate?: number
	errorSampleRate?: number
	maskAllInputs?: boolean
	maskInputOptions?: Record<string, boolean>
	maskTextSelector?: string
	blockSelector?: string
	recordCanvas?: boolean
	collectFonts?: boolean
	inlineStylesheet?: boolean
	chunkIntervalMs?: number
	chunkMaxBytes?: number
	maxDurationMs?: number
	bufferDurationMs?: number
	bufferMaxBytes?: number
	uploadRetry?: number
	retryBaseDelayMs?: number
	recorderLoader?: ReplayRecorderLoader
	uploader?: ReplayChunkUploader
	compressor?: (data: Uint8Array) => Promise<Uint8Array | null>
	checksum?: (data: Uint8Array) => string
	retryDelay?: (ms: number) => Promise<void>
	random?: () => number
	now?: () => number
	uuid?: () => string
	/** 用户同意状态，默认 true。 */
	consent?: boolean
}

/** Replay 对外句柄。 */
export interface ReplayHandle {
	pause(): void
	resume(): void
	setConsent(consented: boolean): void
	flush(): Promise<void>
	whenReady(): Promise<void>
	isRecording(): boolean
	getReplayId(): string | undefined
	getState(): {
		mode: 'off' | 'buffer' | 'session'
		recording: boolean
		paused: boolean
		replayId?: string
		samplingReason?: 'session' | 'error'
		truncated: boolean
		stopReason?: string
	}
}
