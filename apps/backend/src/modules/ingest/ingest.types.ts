/** 上报批次写入结果。 */
export interface IngestResult {
	accepted: number
	rejected: number
	duplicates: number
	errors: Array<{ index: number; code: string; message: string }>
}

/** OTLP Span 归一化后的写入模型。 */
export interface NormalizedOtlpSpan {
	traceId: string
	spanId: string
	parentSpanId?: string
	service: string
	operation: string
	spanType: string
	startTime: Date
	durationMs: number
	status: 'ok' | 'error' | 'cancelled' | 'unknown'
	isRoot: boolean
	attributes: Record<string, string | number | boolean | null>
	environment?: string
	release?: string
}

/** OTLP 批次写入结果。 */
export interface OtlpIngestResult {
	accepted: number
	rejected: number
	errors: Array<{ index: number; code: string; message: string }>
}

/** 浏览器上报批次的最小结构化类型。 */
export interface BrowserIngestPayload {
	sdk?: unknown
	sentAt?: string
	events: MonitorEvent[]
}

/** 浏览器事件上下文。 */
export interface MonitorEventContext {
	environment?: string
	release?: string
	page?: { path?: string }
	session?: { id?: string }
	trace?: { traceId?: string }
	replay?: { replayId?: string }
	user?: { id?: string; anonymousId?: string }
	browser?: { name?: string }
	os?: { name?: string }
	device?: { type?: string }
	app?: unknown
	sdk?: unknown
	tags?: Record<string, string>
}

/** 浏览器事件的后端写入模型。 */
export interface MonitorEvent {
	eventId: string
	type: 'error' | 'performance' | 'analytics' | 'page_view' | 'span'
	name: string
	level: string
	timestamp: string
	occurredAt?: string
	eventType?: string
	context?: MonitorEventContext
	properties?: Record<string, unknown>
	error?: {
		message: string
		stack?: string
		type?: string
		fingerprint?: string
		resourceUrl?: string
	}
	metric?: {
		metricName: string
		value: number
		rating: string
	}
	span?: {
		traceId: string
		spanId: string
		parentSpanId?: string
		service: string
		operation: string
		spanType: string
		startTime: string
		durationMs: number
		status: 'ok' | 'error' | 'cancelled' | 'unknown'
		isRoot: boolean
		attributes?: Record<string, string | number | boolean | null>
	}
}
