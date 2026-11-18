import {
	DEFAULT_TRACES_SAMPLE_RATE,
	MAX_SPANS_PER_TRACE,
	MAX_TRACE_DURATION_MS,
} from '@dt-monitor/contracts'
import type { MonitorSpanPayload, SpanStatus } from '@dt-monitor/contracts'
import type { MonitorClient, MonitorPlugin } from '@dt-monitor/sdk-core'
import { clampSampleRate, sanitizeUrl } from '@dt-monitor/sdk-core'
import { formatTraceparent, generateSpanId, generateTraceId } from './ids'

/** 手动 Span 选项。 */
export interface SpanOptions {
	attributes?: Record<string, string | number | boolean | null>
}

/** 对外暴露的 Span 句柄。 */
export interface TracingSpanHandle {
	readonly traceId: string
	readonly spanId: string
	readonly sampled: boolean
	setAttribute(key: string, value: string | number | boolean | null): void
	end(status?: SpanStatus, attributes?: Record<string, string | number | boolean | null>): void
}

/** 对外暴露的 Tracing 句柄。 */
export interface TracingHandle {
	startSpan(name: string, options?: SpanOptions): TracingSpanHandle | null
	startTransaction(name?: string, options?: SpanOptions): TracingSpanHandle | null
	endTransaction(status?: SpanStatus): void
	withSpan<T>(name: string, callback: (span: TracingSpanHandle) => T | Promise<T>): Promise<T>
	withSpan<T>(
		name: string,
		options: SpanOptions,
		callback: (span: TracingSpanHandle) => T | Promise<T>,
	): Promise<T>
	getActiveSpan(): TracingSpanHandle | null
}

/** Tracing 插件选项。 */
export interface TracingPluginOptions {
	/** 根事务采样率，默认 10%。 */
	tracesSampleRate?: number
	/** 自定义根事务采样器。 */
	tracesSampler?: (context: { name: string; type: string }) => number
	/** 允许注入 traceparent 的跨域 origin。 */
	allowedTraceOrigins?: string[]
	maxSpans?: number
	maxTraceDurationMs?: number
	instrumentFetch?: boolean
	instrumentXhr?: boolean
	trackNavigation?: boolean
	/** 服务名，写入 Span。 */
	service?: string
	random?: () => number
	now?: () => number
}

/** Span 内部状态。 */
interface SpanState {
	traceId: string
	spanId: string
	parentSpanId?: string
	name: string
	spanType: string
	startTime: number
	status: SpanStatus
	attributes: Record<string, string | number | boolean | null>
	isRoot: boolean
	ended: boolean
}

/** 单个事务内部状态。 */
interface TransactionState {
	traceId: string
	sampled: boolean
	root: SpanState
	activeStack: SpanState[]
	spanCount: number
	truncated: boolean
	hasError: boolean
}

/** 客户端到 Tracing 句柄的映射。 */
const tracingByClient = new WeakMap<MonitorClient, TracingHandle>()

/**
 * 获取客户端关联的 Tracing 句柄。
 * @param client 监控客户端
 * @returns Tracing 句柄或 undefined
 */
export function getTracing(client: MonitorClient): TracingHandle | undefined {
	return tracingByClient.get(client)
}

/**
 * 创建浏览器 Tracing 插件。
 * @param options 插件选项
 * @returns 监控插件
 */
export function tracingPlugin(options: TracingPluginOptions = {}): MonitorPlugin {
	const random = options.random ?? Math.random
	const now = options.now ?? (() => Date.now())
	const maxSpans = Math.max(1, options.maxSpans ?? MAX_SPANS_PER_TRACE)
	const maxDurationMs = Math.max(1, options.maxTraceDurationMs ?? MAX_TRACE_DURATION_MS)
	const allowedOrigins = new Set(options.allowedTraceOrigins ?? [])
	const service = options.service ?? 'browser'
	let client: MonitorClient | undefined
	let started = false
	let stopped = false
	let transaction: TransactionState | undefined
	let originalFetch: typeof window.fetch | undefined
	let originalOpen: typeof XMLHttpRequest.prototype.open | undefined
	let originalSend: typeof XMLHttpRequest.prototype.send | undefined
	let originalPushState: typeof history.pushState | undefined
	let originalReplaceState: typeof history.replaceState | undefined
	let wrappedPushState: typeof history.pushState | undefined
	let wrappedReplaceState: typeof history.replaceState | undefined
	let popStateListener: (() => void) | undefined
	let pageHideListener: (() => void) | undefined
	const xhrSpans = new WeakMap<
		XMLHttpRequest,
		{ method: string; url: string; span: SpanState | null }
	>()

	/**
	 * 判断根事务是否命中采样。
	 * @param name 事务名
	 * @param type 事务类型
	 * @returns 是否采样
	 */
	function shouldSample(name: string, type: string): boolean {
		const rate = options.tracesSampler
			? options.tracesSampler({ name, type })
			: (options.tracesSampleRate ?? DEFAULT_TRACES_SAMPLE_RATE)
		return clampSampleRate(rate) > 0 && random() < clampSampleRate(rate)
	}

	/**
	 * 同步当前 Span 到事件上下文。
	 */
	function syncTraceContext(): void {
		if (!client) return
		const active = transaction?.activeStack.at(-1)
		if (!transaction?.sampled || !active) {
			client.setTraceContext(null)
			return
		}
		client.setTraceContext({
			traceId: transaction.traceId,
			spanId: active.spanId,
			sampled: transaction.sampled,
		})
	}

	/**
	 * 创建 Span 状态。
	 * @param name 操作名
	 * @param spanType Span 类型
	 * @param isRoot 是否根事务
	 * @param traceId traceId
	 * @param parentSpanId 父 Span ID
	 * @param attributes 初始属性
	 * @returns Span 状态
	 */
	function createSpanState(
		name: string,
		spanType: string,
		isRoot: boolean,
		traceId: string,
		parentSpanId: string | undefined,
		attributes: Record<string, string | number | boolean | null> = {},
	): SpanState {
		return {
			traceId,
			spanId: generateSpanId(random),
			parentSpanId,
			name,
			spanType,
			startTime: now(),
			status: 'ok',
			attributes,
			isRoot,
			ended: false,
		}
	}

	/**
	 * 开始新的根事务。
	 * @param name 事务名
	 * @param type 事务类型
	 * @param spanType Span 类型
	 * @param attributes 初始属性
	 * @returns 根 Span
	 */
	function beginTransaction(
		name: string,
		type: string,
		spanType: string,
		attributes: Record<string, string | number | boolean | null> = {},
	): SpanState | null {
		if (!started || stopped) return null
		if (transaction) endTransaction('ok')
		const traceId = generateTraceId(random)
		const sampled = shouldSample(name, type)
		const root = createSpanState(name, spanType, true, traceId, undefined, attributes)
		transaction = {
			traceId,
			sampled,
			root,
			activeStack: [root],
			spanCount: sampled ? 1 : 0,
			truncated: false,
			hasError: false,
		}
		syncTraceContext()
		return root
	}

	/**
	 * 结束当前根事务。
	 * @param status 根状态
	 */
	function endTransaction(status: SpanStatus = 'ok'): void {
		if (!transaction) return
		const current = transaction
		finishSpan(current.root, status === 'ok' && current.hasError ? 'error' : status)
		if (transaction === current) transaction = undefined
		syncTraceContext()
	}

	/**
	 * 结束 Span 并上报。
	 * @param span Span 状态
	 * @param status 状态
	 * @param attributes 追加属性
	 */
	function finishSpan(
		span: SpanState | null,
		status: SpanStatus = 'ok',
		attributes: Record<string, string | number | boolean | null> = {},
	): void {
		if (!span) return
		if (span.ended) return
		span.ended = true
		span.status = status
		Object.assign(span.attributes, attributes)
		const current = transaction
		if (current) {
			const index = current.activeStack.indexOf(span)
			if (index >= 0) current.activeStack.splice(index, 1)
			if (status === 'error') current.hasError = true
			if (span.isRoot && current) {
				transaction = undefined
			}
		}
		if (!client || !current?.sampled) {
			syncTraceContext()
			return
		}
		const durationMs = Math.max(0, now() - span.startTime)
		const payload: MonitorSpanPayload = {
			traceId: span.traceId,
			spanId: span.spanId,
			parentSpanId: span.parentSpanId,
			service,
			operation: span.name,
			spanType: span.spanType,
			startTime: new Date(span.startTime).toISOString(),
			durationMs,
			status: span.status,
			isRoot: span.isRoot,
			attributes: { ...span.attributes },
			truncated: current.truncated || undefined,
		}
		client.captureEvent({
			type: 'span',
			name: span.name,
			level: 'debug',
			span: payload,
			sampleRate: 1,
		})
		syncTraceContext()
	}

	/**
	 * 在事务内创建子 Span。
	 * @param name 操作名
	 * @param spanType Span 类型
	 * @param attributes 属性
	 * @returns Span 状态
	 */
	function beginChildSpan(
		name: string,
		spanType: string,
		attributes: Record<string, string | number | boolean | null> = {},
	): SpanState | null {
		const current = transaction
		if (!current || stopped) return null
		if (now() - current.root.startTime > maxDurationMs) {
			current.truncated = true
			return null
		}
		if (current.sampled && current.spanCount >= maxSpans) {
			current.truncated = true
			return null
		}
		const parent = current.activeStack.at(-1)
		const span = createSpanState(name, spanType, false, current.traceId, parent?.spanId, attributes)
		if (current.sampled) current.spanCount += 1
		current.activeStack.push(span)
		syncTraceContext()
		return span
	}

	/**
	 * 将 Span 状态包装为公开句柄。
	 * @param span Span 状态
	 * @returns Span 句柄或 null
	 */
	function toHandle(span: SpanState | null): TracingSpanHandle | null {
		if (!span) return null
		return {
			traceId: span.traceId,
			spanId: span.spanId,
			sampled: Boolean(transaction?.sampled),
			setAttribute(key, value) {
				span.attributes[key] = value
			},
			end(status = 'ok', attributes = {}) {
				finishSpan(span, status, attributes)
			},
		}
	}

	/**
	 * 手动开始 Span；无事务时创建 custom 根事务。
	 * @param name 操作名
	 * @param spanOptions 选项
	 * @returns Span 句柄
	 */
	function startSpan(name: string, spanOptions: SpanOptions = {}): TracingSpanHandle | null {
		if (!started || stopped) return null
		if (!transaction) {
			const root = beginTransaction(name, 'custom', 'custom', spanOptions.attributes)
			return toHandle(root)
		}
		return toHandle(beginChildSpan(name, 'custom', spanOptions.attributes))
	}

	/**
	 * 启动并结束一次事务。
	 * @param name 事务名
	 * @param spanOptions 选项
	 * @returns 根 Span 句柄
	 */
	function startTransaction(
		name = 'custom',
		spanOptions: SpanOptions = {},
	): TracingSpanHandle | null {
		if (!started || stopped) return null
		const path = currentPath()
		const root = beginTransaction(name, 'custom', 'custom', {
			path,
			...(spanOptions.attributes ?? {}),
		})
		return toHandle(root)
	}

	/**
	 * 执行回调并自动结束 Span。
	 * @param name 操作名
	 * @param optionsOrCallback 选项或回调
	 * @param maybeCallback 回调
	 * @returns 回调结果
	 */
	async function withSpan<T>(
		name: string,
		optionsOrCallback: SpanOptions | ((span: TracingSpanHandle) => T | Promise<T>),
		maybeCallback?: (span: TracingSpanHandle) => T | Promise<T>,
	): Promise<T> {
		const spanOptions = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback
		const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback
		if (!callback) throw new Error('withSpan 缺少回调')
		const span = startSpan(name, spanOptions)
		try {
			const result = await callback(span ?? noopSpan())
			span?.end('ok')
			return result
		} catch (error) {
			span?.end('error')
			throw error
		}
	}

	/**
	 * 回调需要 Span 但未命中采样时的占位句柄。
	 * @returns 空 Span 句柄
	 */
	function noopSpan(): TracingSpanHandle {
		return {
			traceId: '',
			spanId: '',
			sampled: false,
			setAttribute: () => undefined,
			end: () => undefined,
		}
	}

	/**
	 * 读取当前页面路径。
	 * @returns 脱敏路径
	 */
	function currentPath(): string {
		if (typeof window === 'undefined') return ''
		try {
			const url = new URL(window.location.href)
			return `${url.pathname}${url.search ? sanitizeUrl(`${url.pathname}${url.search}`, { base: url.origin }).replace(url.origin, '') : ''}`.slice(
				0,
				255,
			)
		} catch {
			return ''
		}
	}

	/**
	 * 判断目标 URL 是否允许注入 traceparent。
	 * @param rawUrl 目标 URL
	 * @returns 是否允许
	 */
	function isTraceOriginAllowed(rawUrl: string): boolean {
		if (typeof window === 'undefined') return false
		try {
			const url = new URL(rawUrl, window.location.href)
			if (url.origin === window.location.origin) return true
			return allowedOrigins.has(url.origin) || allowedOrigins.has('*')
		} catch {
			return false
		}
	}

	/**
	 * 读取请求 URL。
	 * @param input fetch 输入
	 * @returns URL 字符串
	 */
	function resolveFetchUrl(input: RequestInfo | URL): string {
		if (typeof input === 'string') return input
		if (input instanceof URL) return input.href
		return input.url
	}

	/**
	 * 读取请求方法。
	 * @param input fetch 输入
	 * @param method 显式方法
	 * @returns 大写方法名
	 */
	function resolveFetchMethod(input: RequestInfo | URL, method?: string): string {
		if (method) return method.toUpperCase()
		if (typeof Request !== 'undefined' && input instanceof Request)
			return input.method.toUpperCase()
		return 'GET'
	}

	/**
	 * 为 fetch 创建 Span 并在允许时注入 traceparent。
	 * @param input fetch 输入
	 * @param init fetch 初始化
	 * @returns 修改后的初始化与 Span
	 */
	function prepareFetch(
		input: RequestInfo | URL,
		init?: RequestInit,
	): {
		input: RequestInfo | URL
		init?: RequestInit
		span: SpanState | null
	} {
		const url = resolveFetchUrl(input)
		const method = resolveFetchMethod(input, init?.method)
		const safeUrl = sanitizeUrl(url, {
			base: typeof window !== 'undefined' ? window.location.href : undefined,
		})
		const path = (() => {
			try {
				const parsed = new URL(url, window.location.href)
				return sanitizeUrl(parsed.pathname, { base: parsed.origin }).replace(parsed.origin, '')
			} catch {
				return safeUrl
			}
		})()
		const operation = `${method} ${path}`.slice(0, 255)
		const span = beginChildSpan(operation, 'fetch', {
			'http.method': method,
			'http.url': safeUrl,
			'http.cross_origin': !isTraceOriginAllowed(url),
		})
		if (!span || !transaction || !isTraceOriginAllowed(url)) return { input, init, span }
		const traceparent = formatTraceparent(span.traceId, span.spanId, transaction.sampled)
		try {
			if (typeof Request !== 'undefined' && input instanceof Request && !init) {
				const request = input.clone()
				request.headers.set('traceparent', traceparent)
				return { input: request, span }
			}
			const headers = new Headers(init?.headers)
			headers.set('traceparent', traceparent)
			return { input, init: { ...init, headers, method }, span }
		} catch {
			return { input, init, span }
		}
	}

	/**
	 * 包装 fetch。
	 */
	function patchFetch(): void {
		if (typeof window === 'undefined' || typeof window.fetch !== 'function') return
		originalFetch = window.fetch
		window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
			const prepared = prepareFetch(input, init)
			try {
				const response = await originalFetch?.call(window, prepared.input, prepared.init)
				if (!response) throw new Error('fetch unavailable')
				const status = response.status >= 400 ? 'error' : 'ok'
				finishSpan(prepared.span, status, { 'http.status_code': response.status })
				return response
			} catch (error) {
				const name = error instanceof Error ? error.name : 'Error'
				finishSpan(prepared.span, name === 'AbortError' ? 'cancelled' : 'error', {
					'error.type': name,
				})
				throw error
			}
		}
	}

	/**
	 * 包装 XHR。
	 */
	function patchXhr(): void {
		if (typeof XMLHttpRequest === 'undefined') return
		originalOpen = XMLHttpRequest.prototype.open
		originalSend = XMLHttpRequest.prototype.send
		const patchedOpen = function (
			this: XMLHttpRequest,
			method: string,
			url: string | URL,
			async?: boolean,
			username?: string | null,
			password?: string | null,
		) {
			xhrSpans.set(this, { method: method.toUpperCase(), url: String(url), span: null })
			return originalOpen?.call(this, method, url, async ?? true, username, password)
		}
		XMLHttpRequest.prototype.open = patchedOpen as typeof XMLHttpRequest.prototype.open
		const patchedSend = function (
			this: XMLHttpRequest,
			body?: Document | XMLHttpRequestBodyInit | null,
		) {
			const info = xhrSpans.get(this) ?? { method: 'GET', url: '', span: null }
			const safeUrl = sanitizeUrl(info.url, {
				base: typeof window !== 'undefined' ? window.location.href : undefined,
			})
			const operation = `${info.method} ${safeUrl}`.slice(0, 255)
			const span = beginChildSpan(operation, 'xhr', {
				'http.method': info.method,
				'http.url': safeUrl,
				'http.cross_origin': !isTraceOriginAllowed(info.url),
			})
			info.span = span
			xhrSpans.set(this, info)
			if (span && transaction && isTraceOriginAllowed(info.url)) {
				try {
					this.setRequestHeader(
						'traceparent',
						formatTraceparent(span.traceId, span.spanId, transaction.sampled),
					)
				} catch {
					// 某些环境禁止设置该 header，保持请求可发送。
				}
			}
			let ended = false
			const finish = (status: SpanStatus): void => {
				if (ended) return
				ended = true
				finishSpan(span, status, { 'http.status_code': this.status })
			}
			this.addEventListener('loadend', () => {
				finish(this.status >= 400 ? 'error' : 'ok')
			})
			this.addEventListener('error', () => finish('error'))
			this.addEventListener('abort', () => finish('cancelled'))
			return originalSend?.call(this, body)
		}
		XMLHttpRequest.prototype.send = patchedSend as typeof XMLHttpRequest.prototype.send
	}

	/**
	 * 开始一次页面导航事务。
	 * @param type 导航类型
	 */
	function startNavigation(type: string): void {
		const path = currentPath()
		beginTransaction(type, 'navigation', 'navigation', {
			path,
			navigation_type: type,
		})
	}

	/**
	 * 包装 history 导航。
	 */
	function patchNavigation(): void {
		if (typeof window === 'undefined') return
		originalPushState = window.history.pushState
		originalReplaceState = window.history.replaceState
		wrappedPushState = function (...args) {
			originalPushState?.apply(window.history, args)
			startNavigation('pushState')
		} as typeof window.history.pushState
		wrappedReplaceState = function (...args) {
			originalReplaceState?.apply(window.history, args)
			startNavigation('replaceState')
		} as typeof window.history.replaceState
		window.history.pushState = wrappedPushState
		window.history.replaceState = wrappedReplaceState
		popStateListener = () => startNavigation('popstate')
		window.addEventListener('popstate', popStateListener)
	}

	/**
	 * 还原所有插桩。
	 */
	function restore(): void {
		if (typeof window !== 'undefined') {
			if (originalFetch) window.fetch = originalFetch
			originalFetch = undefined
			if (wrappedPushState && window.history.pushState === wrappedPushState) {
				window.history.pushState = originalPushState ?? window.history.pushState
			}
			if (wrappedReplaceState && window.history.replaceState === wrappedReplaceState) {
				window.history.replaceState = originalReplaceState ?? window.history.replaceState
			}
			if (popStateListener) window.removeEventListener('popstate', popStateListener)
			if (pageHideListener) window.removeEventListener('pagehide', pageHideListener)
		}
		if (typeof XMLHttpRequest !== 'undefined') {
			if (originalOpen) XMLHttpRequest.prototype.open = originalOpen
			if (originalSend) XMLHttpRequest.prototype.send = originalSend
		}
		originalPushState = undefined
		originalReplaceState = undefined
		wrappedPushState = undefined
		wrappedReplaceState = undefined
		popStateListener = undefined
		pageHideListener = undefined
		originalOpen = undefined
		originalSend = undefined
	}

	const handle: TracingHandle = {
		startSpan,
		startTransaction,
		endTransaction,
		withSpan,
		getActiveSpan: () => toHandle(transaction?.activeStack.at(-1) ?? null),
	}

	return {
		name: 'tracing',
		setup(instance) {
			client = instance
			tracingByClient.set(instance, handle as TracingHandle)
		},
		start() {
			if (started || stopped || !client) return
			started = true
			beginTransaction('pageload', 'pageload', 'pageload', {
				path: currentPath(),
				navigation_type: 'navigate',
			})
			if (options.instrumentFetch ?? true) patchFetch()
			if (options.instrumentXhr ?? true) patchXhr()
			if (options.trackNavigation ?? true) patchNavigation()
			if (typeof window !== 'undefined') {
				pageHideListener = () => {
					endTransaction('ok')
					void client?.flush({ useBeacon: true })
				}
				window.addEventListener('pagehide', pageHideListener)
			}
		},
		stop() {
			if (!started) return
			started = false
			stopped = true
			endTransaction('ok')
			restore()
			client?.setTraceContext(null)
			tracingByClient.delete(client as MonitorClient)
		},
	}
}
