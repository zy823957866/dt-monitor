import type {
	ErrorMechanism,
	EventProperties,
	IngestPayload,
	MonitorApp,
	MonitorBreadcrumb,
	MonitorErrorPayload,
	MonitorEvent,
	MonitorEventContext,
	MonitorEventType,
	MonitorPerformanceMetric,
	MonitorReplayContext,
	MonitorSdk,
	MonitorSpanPayload,
	MonitorTraceContext,
	MonitorUser,
	ParsedDsn,
	SendResult,
	Severity,
} from '@dt-monitor/contracts'

/** 可注入的时钟适配器。 */
export interface Clock {
	/** 返回当前 Unix 毫秒时间戳。 */
	now(): number
}

/** 可注入的 ID 生成适配器。 */
export interface Uuid {
	/** 生成事件、页面或关联 ID。 */
	generate(): string
}

/** 可注入的存储适配器。 */
export interface StorageAdapter {
	getItem(key: string): string | null
	setItem(key: string, value: string): void
	removeItem(key: string): void
}

/** 传输层附加选项。 */
export interface TransportSendOptions {
	/** 页面卸载时使用 sendBeacon 等尽力传输机制。 */
	useBeacon?: boolean
}

/** 可替换的批量传输适配器。 */
export interface MonitorTransport {
	send(payload: IngestPayload, options?: TransportSendOptions): Promise<SendResult>
}

/** 初始化选项。 */
export interface MonitorOptions {
	dsn: string
	app: MonitorApp
	/** SDK 标识，浏览器包会覆盖为自身包名。 */
	sdk?: MonitorSdk
	environment?: string
	release?: string
	debug?: boolean
	plugins?: MonitorPlugin[]
	/** 全局采样率，默认 1。 */
	sampleRate?: number
	beforeSend?: (event: MonitorEvent) => MonitorEvent | null | Promise<MonitorEvent | null>
	transport?: MonitorTransport
	clock?: Clock
	uuid?: Uuid
	random?: () => number
	storage?: StorageAdapter
	sessionStorage?: StorageAdapter
	/** 合并到所有事件的动态上下文；用于浏览器页面信息。 */
	contextProvider?: () => Partial<MonitorEventContext> | undefined
	user?: MonitorUser
	tags?: Record<string, string>
	context?: Record<string, unknown>
	batchSize?: number
	flushIntervalMs?: number
	queueLimit?: number
	maxRetries?: number
	retryBaseDelayMs?: number
	/** 测试或特殊宿主可替换重试等待实现。 */
	retryDelay?: (ms: number) => Promise<void>
	sessionTimeoutMs?: number
	sessionMaxDurationMs?: number
	dedupeWindowMs?: number
	/** SDK 内部异常回调，不得影响宿主业务。 */
	onInternalError?: (error: unknown, source: string) => void
}

/** 插件捕获事件的输入。 */
export interface MonitorEventInput {
	type: MonitorEventType
	name: string
	level?: Severity
	eventType?: string
	properties?: EventProperties
	error?: MonitorErrorPayload
	metric?: MonitorPerformanceMetric
	span?: MonitorSpanPayload
	extra?: Record<string, unknown>
	trace?: MonitorTraceContext
	replay?: MonitorReplayContext
	/** 插件级采样率，在 beforeSend 之后执行。 */
	sampleRate?: number
	/** 同一窗口内的去重键。 */
	dedupeKey?: string
}

/** 事件捕获选项。 */
export interface CaptureOptions {
	/** 覆盖事件自带采样率。 */
	sampleRate?: number
	/** 同一窗口内的去重键。 */
	dedupeKey?: string
}

/** 手动错误捕获上下文。 */
export interface ExceptionCaptureContext {
	mechanism?: ErrorMechanism
	handled?: boolean
	componentName?: string
	info?: string
	fingerprint?: string
	[key: string]: unknown
}

/** 页面浏览输入。 */
export interface PageViewPayload {
	path?: string
	title?: string
	referrer?: string
	url?: string
}

/** 插件生命周期。 */
export interface MonitorPlugin {
	name: string
	setup?(client: MonitorClient, options: MonitorOptions): void
	start?(): void
	stop?(): void
	beforeSend?(event: MonitorEvent): MonitorEvent | null | Promise<MonitorEvent | null>
	afterSend?(result: SendResult): void
}

/** flush 选项。 */
export interface FlushOptions {
	/** 页面隐藏或卸载时尽力发送。 */
	useBeacon?: boolean
}

/** SDK 内部诊断计数。 */
export interface MonitorDiagnostics {
	queued: number
	queueLength: number
	sent: number
	failed: number
	dropped: number
	rejected: number
	retries: number
	internalErrors: number
	lastError?: string
	lastSendAt?: string
}

/** 对外暴露的监控客户端。 */
export interface MonitorClient {
	captureException(error: unknown, context?: ExceptionCaptureContext): string | null
	captureMessage(
		message: string,
		level?: Severity,
		context?: ExceptionCaptureContext,
	): string | null
	track(
		eventName: string,
		properties?: EventProperties,
		options?: CaptureOptions,
	): boolean
	pageView(payload?: PageViewPayload): void
	identify(distinctId: string, traits?: Record<string, unknown>): void
	setUser(user: MonitorUser | null): void
	resetUser(): void
	setTag(key: string, value: string): void
	setContext(key: string, value: Record<string, unknown>): void
	setTraceContext(trace: MonitorTraceContext | null): void
	setReplayContext(replay: MonitorReplayContext | null): void
	addBreadcrumb(breadcrumb: MonitorBreadcrumb): void
	getBreadcrumbs(): MonitorBreadcrumb[]
	/** 插件捕获标准化事件的扩展入口。 */
	captureEvent(input: MonitorEventInput, options?: CaptureOptions): string | null
	getContext(): MonitorEventContext
	getDsn(): ParsedDsn
	getDiagnostics(): MonitorDiagnostics
	flush(options?: FlushOptions): Promise<void>
	disable(): void
	isDisabled(): boolean
}
