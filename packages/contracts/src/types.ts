/** SDK 允许作为事件属性值的基础类型。 */
export type Primitive = string | number | boolean | null

/** 事件属性值，最多支持两层数组/对象。 */
export type PropertyValue = Primitive | PropertyValue[] | { [key: string]: PropertyValue }

/** 事件属性集合。 */
export type EventProperties = Record<string, PropertyValue>

/** 事件严重级别。 */
export type Severity = 'fatal' | 'error' | 'warning' | 'info' | 'debug'

/** 标准化事件类型。 */
export type MonitorEventType = 'error' | 'performance' | 'analytics' | 'page_view' | 'span'

/** 错误采集机制。 */
export type ErrorMechanism =
	| 'window'
	| 'unhandledrejection'
	| 'resource'
	| 'console'
	| 'manual'
	| 'vue'
	| 'react'
	| 'custom'

/** 应用标识。 */
export interface MonitorApp {
	name: string
	version?: string
}

/** SDK 标识。 */
export interface MonitorSdk {
	name: string
	version: string
}

/** 页面上下文。 */
export interface MonitorPageContext {
	id: string
	url: string
	path: string
	title?: string
	referrer?: string
	navigationType?: string
	viewport?: { width: number; height: number }
	screen?: { width: number; height: number }
	language?: string
	timezone?: string
}

/** 会话上下文。 */
export interface MonitorSessionContext {
	id: string
	sequence: number
	startedAt: string
}

/** Trace 上下文。 */
export interface MonitorTraceContext {
	traceId: string
	spanId?: string
	sampled: boolean
}

/** Replay 上下文。 */
export interface MonitorReplayContext {
	replayId: string
	recording: boolean
	samplingReason?: 'session' | 'error'
}

/** 用户上下文。 */
export interface MonitorUser {
	id?: string
	anonymousId: string
	traits?: Record<string, unknown>
}

/** 浏览器信息。 */
export interface MonitorBrowserContext {
	name?: string
	version?: string
	os?: { name?: string; version?: string }
	device?: { type?: 'desktop' | 'mobile' | 'tablet' | 'unknown' }
}

/** 面包屑记录。 */
export interface MonitorBreadcrumb {
	type: 'navigation' | 'click' | 'console' | 'lifecycle' | 'error'
	timestamp: string
	message: string
	data?: Record<string, unknown>
}

/** 随每个事件发送的公共上下文。 */
export interface MonitorEventContext {
	app: MonitorApp
	sdk: MonitorSdk
	environment?: string
	release?: string
	page?: MonitorPageContext
	session?: MonitorSessionContext
	trace?: MonitorTraceContext
	replay?: MonitorReplayContext
	user?: MonitorUser
	browser?: MonitorBrowserContext
	os?: { name?: string; version?: string }
	device?: { type?: 'desktop' | 'mobile' | 'tablet' | 'unknown' }
	tags?: Record<string, string>
	extra?: Record<string, unknown>
	breadcrumbs?: MonitorBreadcrumb[]
}

/** 错误事件数据。 */
export interface MonitorErrorPayload {
	message: string
	stack?: string
	type?: string
	mechanism: ErrorMechanism
	handled: boolean
	source?: string
	lineno?: number
	colno?: number
	resourceUrl?: string
	tagName?: string
	componentName?: string
	info?: string
	fingerprint?: string
}

/** Web Vitals 评分。 */
export type PerformanceRating = 'good' | 'needs-improvement' | 'poor'

/** 性能指标事件数据。 */
export interface MonitorPerformanceMetric {
	metricName: string
	value: number
	rating: PerformanceRating
	metricId?: string
	delta?: number
	navigationType?: string
	pageId?: string
	entryType?: string
}

/** Span 状态。 */
export type SpanStatus = 'ok' | 'error' | 'cancelled' | 'unknown'

/** 浏览器 Span 事件数据。 */
export interface MonitorSpanPayload {
	traceId: string
	spanId: string
	parentSpanId?: string
	service: string
	operation: string
	spanType: 'transaction' | 'navigation' | 'fetch' | 'xhr' | 'custom' | 'pageload' | string
	startTime: string
	durationMs: number
	status: SpanStatus
	isRoot: boolean
	attributes?: Record<string, string | number | boolean | null>
	truncated?: boolean
}

/** 标准化监控事件。 */
export interface MonitorEvent {
	eventId: string
	type: MonitorEventType
	name: string
	level: Severity
	timestamp: string
	occurredAt: string
	eventType?: string
	context: MonitorEventContext
	properties?: EventProperties
	error?: MonitorErrorPayload
	metric?: MonitorPerformanceMetric
	span?: MonitorSpanPayload
}

/** 批量上报信封。 */
export interface IngestPayload {
	sdk: MonitorSdk
	sentAt: string
	events: MonitorEvent[]
}

/** 批量上报结果。 */
export interface SendResult {
	success: boolean
	status?: number
	accepted?: number
	rejected?: number
	retryable?: boolean
	reason?: string
}

/** W3C Trace Context。 */
export interface W3CTraceContext {
	traceId: string
	spanId: string
	sampled: boolean
	traceparent: string
	tracestate?: string
}

/** Replay 分片清单。 */
export interface ReplayChunkMeta {
	replayId: string
	sessionId: string
	sequence: number
	startedAt: string
	endedAt: string
	rawSize: number
	compressedSize: number
	checksum: string
	maskVersion: string
	truncated?: boolean
}

/** DSN 解析结果。 */
export interface ParsedDsn {
	dsn: string
	origin: string
	host: string
	hostname: string
	projectId: string
	publicKey: string
	ingestUrl: string
	apiBase: string
	replayBaseUrl: string
}
