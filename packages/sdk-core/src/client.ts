import {
	DEFAULT_BATCH_SIZE,
	DEFAULT_FLUSH_INTERVAL_MS,
	DEFAULT_MAX_RETRIES,
	DEFAULT_QUEUE_LIMIT,
	DEFAULT_RETRY_BASE_DELAY_MS,
	DEFAULT_SAMPLE_RATE,
	DEFAULT_SESSION_MAX_DURATION_MS,
	DEFAULT_SESSION_TIMEOUT_MS,
	MAX_ERROR_MESSAGE_LENGTH,
	SDK_VERSION,
	parseDsn,
} from '@dt-monitor/contracts'
import type {
	IngestPayload,
	MonitorBreadcrumb,
	MonitorEvent,
	MonitorEventContext,
	MonitorEventType,
	MonitorPageContext,
	MonitorReplayContext,
	MonitorSessionContext,
	MonitorTraceContext,
	MonitorUser,
	ParsedDsn,
	SendResult,
	Severity,
} from '@dt-monitor/contracts'
import type {
	CaptureOptions,
	ExceptionCaptureContext,
	FlushOptions,
	MonitorClient,
	MonitorDiagnostics,
	MonitorEventInput,
	MonitorOptions,
	MonitorPlugin,
	PageViewPayload,
} from './types'
import {
	capBreadcrumbs,
	clampSampleRate,
	cloneJson,
	composeFingerprint,
	createMemoryStorage,
	createRetryDelay,
	createSystemUuid,
	isSampled,
	isValidTrackName,
	normalizeError,
	normalizeEventName,
	normalizeProperties,
	readJsonStorage,
	sanitizeUrl,
	systemClock,
	toPagePath,
	truncateString,
	writeJsonStorage,
} from './utils'

/** 匿名用户存储键。 */
const ANONYMOUS_ID_KEY = 'dt_monitor.anonymous_id'

/** 用户信息存储键。 */
const USER_KEY = 'dt_monitor.user'

/** 会话信息存储键。 */
const SESSION_KEY = 'dt_monitor.session'

/** core 默认 SDK 标识。 */
const DEFAULT_SDK = {
	name: '@dt-monitor/sdk-core',
	version: SDK_VERSION,
}

/** 会话持久化结构。 */
interface StoredSession {
	id: string
	startedAt: number
	lastActivity: number
	sequence: number
}

/**
 * 创建默认成功传输，用于无浏览器环境或测试遗漏传输适配器时保持管线可用。
 * @returns 传输适配器
 */
function createNoopTransport(): { send(payload: IngestPayload): Promise<SendResult> } {
	return {
		send: async (payload) => ({
			success: true,
			accepted: payload.events.length,
		}),
	}
}

/**
 * 返回事件类型的默认级别。
 * @param type 事件类型
 * @returns 默认级别
 */
function defaultLevel(type: MonitorEventType): Severity {
	if (type === 'error') return 'error'
	if (type === 'span') return 'debug'
	return 'info'
}

/**
 * 创建框架无关的监控客户端。
 * @param options 初始化选项
 * @returns 监控客户端
 */
export function createMonitorClient(options: MonitorOptions): MonitorClient {
	if (!options.app?.name) throw new Error('initMonitor 需要 app.name')
	const dsn: ParsedDsn = parseDsn(options.dsn)
	const clock = options.clock ?? systemClock
	const uuid = options.uuid ?? createSystemUuid()
	const random = options.random ?? Math.random
	const storage = options.storage ?? createMemoryStorage()
	const sessionStorage = options.sessionStorage ?? storage
	const transport = options.transport ?? createNoopTransport()
	const retryDelay = options.retryDelay ?? createRetryDelay()
	const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE)
	const flushIntervalMs = Math.max(0, options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS)
	const queueLimit = Math.max(1, options.queueLimit ?? DEFAULT_QUEUE_LIMIT)
	const maxRetries = Math.max(0, options.maxRetries ?? DEFAULT_MAX_RETRIES)
	const retryBaseDelayMs = Math.max(
		0,
		options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS,
	)
	const dedupeWindowMs = Math.max(0, options.dedupeWindowMs ?? 5_000)
	const sessionTimeoutMs = Math.max(1, options.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS)
	const sessionMaxDurationMs = Math.max(
		sessionTimeoutMs,
		options.sessionMaxDurationMs ?? DEFAULT_SESSION_MAX_DURATION_MS,
	)
	const sdk = options.sdk ?? DEFAULT_SDK
	let disabled = false
	let timer: ReturnType<typeof setTimeout> | null = null
	let flushPromise: Promise<void> | null = null
	let flushing = false
	let currentPage: MonitorPageContext | undefined
	let traceContext: MonitorTraceContext | null = null
	let replayContext: MonitorReplayContext | null = null
	let session: StoredSession | undefined
	const queue: MonitorEvent[] = []
	const pendingProcesses = new Set<Promise<void>>()
	const dedupeMap = new Map<string, number>()
	const tags = new Map<string, string>(Object.entries(options.tags ?? {}))
	const extraContext: Record<string, unknown> = cloneJson(options.context ?? {})
	const breadcrumbs: MonitorBreadcrumb[] = []
	const diagnostics: MonitorDiagnostics = {
		queued: 0,
		queueLength: 0,
		sent: 0,
		failed: 0,
		dropped: 0,
		rejected: 0,
		retries: 0,
		internalErrors: 0,
	}
	const plugins: MonitorPlugin[] = [...(options.plugins ?? [])]
	const startedPlugins: MonitorPlugin[] = []
	const failedPlugins = new Set<string>()

	/**
	 * 记录 SDK 内部异常，不向宿主抛出。
	 * @param source 出错来源
	 * @param error 异常
	 */
	function reportInternalError(source: string, error: unknown): void {
		diagnostics.internalErrors += 1
		diagnostics.lastError = normalizeError(error).message
		if (options.debug) console.debug('[dt-monitor]', source, error)
		try {
			options.onInternalError?.(error, source)
		} catch {
			// 内部错误回调失败同样不能影响宿主。
		}
	}

	/**
	 * 读取或生成匿名 ID。
	 * @returns 匿名用户 ID
	 */
	function getAnonymousId(): string {
		try {
			const stored = storage.getItem(ANONYMOUS_ID_KEY)
			if (stored) return stored
			const generated = uuid.generate()
			storage.setItem(ANONYMOUS_ID_KEY, generated)
			return generated
		} catch (error) {
			reportInternalError('storage.anonymous', error)
			return uuid.generate()
		}
	}

	const storedUser = readJsonStorage<MonitorUser>(storage, USER_KEY)
	let user: MonitorUser = cloneJson(options.user ?? storedUser ?? { anonymousId: getAnonymousId() })
	if (!user.anonymousId) user.anonymousId = getAnonymousId()
	if (options.user) writeJsonStorage(storage, USER_KEY, user)

	/**
	 * 读取当前会话，必要时创建新会话。
	 * @param now 当前毫秒时间戳
	 * @returns 会话
	 */
	function getSession(now: number): StoredSession {
		if (
			session &&
			now - session.lastActivity <= sessionTimeoutMs &&
			now - session.startedAt <= sessionMaxDurationMs
		) {
			return session
		}
		const stored = readJsonStorage<StoredSession>(sessionStorage, SESSION_KEY)
		if (
			stored &&
			stored.id &&
			now - stored.lastActivity <= sessionTimeoutMs &&
			now - stored.startedAt <= sessionMaxDurationMs
		) {
			session = stored
			return stored
		}
		session = {
			id: uuid.generate(),
			startedAt: now,
			lastActivity: now,
			sequence: 0,
		}
		writeJsonStorage(sessionStorage, SESSION_KEY, session)
		return session
	}

	/**
	 * 更新会话活动时间并递增序号。
	 * @returns 会话上下文
	 */
	function touchSession(): MonitorSessionContext {
		const now = clock.now()
		const current = getSession(now)
		current.lastActivity = now
		current.sequence += 1
		writeJsonStorage(sessionStorage, SESSION_KEY, current)
		return {
			id: current.id,
			sequence: current.sequence,
			startedAt: new Date(current.startedAt).toISOString(),
		}
	}

	/**
	 * 读取会话上下文而不递增序号。
	 * @returns 会话上下文
	 */
	function readSession(): MonitorSessionContext {
		const current = getSession(clock.now())
		return {
			id: current.id,
			sequence: current.sequence,
			startedAt: new Date(current.startedAt).toISOString(),
		}
	}

	/**
	 * 重置会话与匿名身份。
	 */
	function resetIdentity(): void {
		try {
			storage.setItem(ANONYMOUS_ID_KEY, uuid.generate())
			storage.removeItem(USER_KEY)
			sessionStorage.removeItem(SESSION_KEY)
		} catch (error) {
			reportInternalError('storage.reset', error)
		}
		user = { anonymousId: getAnonymousId() }
		session = undefined
	}

	/**
	 * 读取动态上下文，异常时返回空对象。
	 * @returns 动态上下文
	 */
	function readProviderContext(): Partial<MonitorEventContext> {
		try {
			return options.contextProvider?.() ?? {}
		} catch (error) {
			reportInternalError('contextProvider', error)
			return {}
		}
	}

	/**
	 * 组装最终事件上下文。
	 * @param touch 是否更新会话活动
	 * @returns 事件上下文
	 */
	function buildContext(touch: boolean): MonitorEventContext {
		const provided = readProviderContext()
		const page = currentPage ?? provided.page
		const context: MonitorEventContext = {
			app: options.app,
			sdk,
			environment: options.environment ?? provided.environment,
			release: options.release ?? provided.release,
			page: page ? cloneJson(page) : undefined,
			session: touch ? touchSession() : readSession(),
			trace: traceContext ?? provided.trace ?? undefined,
			replay: replayContext ?? provided.replay ?? undefined,
			user: cloneJson(user),
			browser: provided.browser,
			os: provided.os ?? provided.browser?.os,
			device: provided.device ?? provided.browser?.device,
			tags: tags.size > 0 ? Object.fromEntries(tags) : undefined,
			extra:
				Object.keys(extraContext).length > 0 ? cloneJson(extraContext) : undefined,
			breadcrumbs: breadcrumbs.length > 0 ? cloneJson(breadcrumbs) : undefined,
		}
		if (provided.tags) context.tags = { ...(context.tags ?? {}), ...provided.tags }
		if (provided.extra) context.extra = { ...(context.extra ?? {}), ...provided.extra }
		return context
	}

	/**
	 * 判断是否命中去重窗口。
	 * @param key 去重键
	 * @returns 是否重复
	 */
	function isDuplicate(key: string): boolean {
		if (!key || dedupeWindowMs <= 0) return false
		const now = clock.now()
		const previous = dedupeMap.get(key)
		if (previous !== undefined && now - previous < dedupeWindowMs) return true
		dedupeMap.set(key, now)
		if (dedupeMap.size > 1_000) {
			for (const [itemKey, timestamp] of dedupeMap) {
				if (now - timestamp >= dedupeWindowMs) dedupeMap.delete(itemKey)
			}
		}
		return false
	}

	/**
	 * 更新诊断队列长度。
	 */
	function refreshQueueLength(): void {
		diagnostics.queueLength = queue.length
	}

	/**
	 * 清理定时批量发送任务。
	 */
	function clearFlushTimer(): void {
		if (timer !== null) {
			clearTimeout(timer)
			timer = null
		}
	}

	/**
	 * 安排下一次定时批量发送。
	 */
	function scheduleFlush(): void {
		if (disabled || timer !== null || flushIntervalMs <= 0) return
		timer = setTimeout(() => {
			timer = null
			void flushInternal(false)
		}, flushIntervalMs)
	}

	/**
	 * 将事件放入内存队列。
	 * @param event 标准化事件
	 */
	function enqueue(event: MonitorEvent): void {
		if (disabled) return
		queue.push(event)
		diagnostics.queued += 1
		if (queue.length > queueLimit) {
			const removed = queue.length - queueLimit
			queue.splice(0, removed)
			diagnostics.dropped += removed
		}
		refreshQueueLength()
		if (queue.length >= batchSize) {
			clearFlushTimer()
			void flushInternal(false)
			return
		}
		scheduleFlush()
	}

	/**
	 * 通知插件传输结果。
	 * @param result 传输结果
	 */
	function notifyAfterSend(result: SendResult): void {
		for (const plugin of startedPlugins) {
			if (!plugin.afterSend) continue
			try {
				plugin.afterSend(result)
			} catch (error) {
				reportInternalError(`plugin.afterSend:${plugin.name}`, error)
			}
		}
	}

	/**
	 * 发送单个批次，遵守重试与 413 拆批规则。
	 * @param events 事件批次
	 * @param useBeacon 是否尽力传输
	 * @param allowSplit 是否允许 413 拆批
	 */
	async function sendBatch(
		events: MonitorEvent[],
		useBeacon: boolean,
		allowSplit: boolean,
	): Promise<void> {
		if (events.length === 0 || disabled) return
		let attempt = 0
		while (attempt <= maxRetries && !disabled) {
			const payload: IngestPayload = {
				sdk,
				sentAt: new Date(clock.now()).toISOString(),
				events,
			}
			let result: SendResult
			try {
				result = await transport.send(payload, { useBeacon })
			} catch (error) {
				result = {
					success: false,
					retryable: true,
					reason: normalizeError(error).message,
				}
			}
			if (result.success) {
				const rejected = Math.max(0, result.rejected ?? 0)
				const accepted = Math.max(0, result.accepted ?? events.length - rejected)
				diagnostics.sent += accepted
				diagnostics.rejected += rejected
				diagnostics.lastSendAt = payload.sentAt
				notifyAfterSend(result)
				return
			}
			if (result.status === 413 && allowSplit && events.length > 1 && !useBeacon) {
				const middle = Math.ceil(events.length / 2)
				await sendBatch(events.slice(0, middle), false, false)
				await sendBatch(events.slice(middle), false, false)
				return
			}
			if (useBeacon || !result.retryable || attempt >= maxRetries) {
				diagnostics.failed += events.length
				diagnostics.dropped += events.length
				if (result.reason) diagnostics.lastError = result.reason
				notifyAfterSend(result)
				return
			}
			attempt += 1
			diagnostics.retries += 1
			await retryDelay(retryBaseDelayMs * 2 ** (attempt - 1))
		}
	}

	/**
	 * 执行队列发送，不等待尚未完成的事件预处理。
	 * @param useBeacon 是否使用页面卸载传输
	 */
	async function flushInternal(useBeacon: boolean): Promise<void> {
		if (disabled || queue.length === 0) return
		if (flushing) {
			await flushPromise
			return
		}
		clearFlushTimer()
		flushing = true
		flushPromise = (async () => {
			if (useBeacon) {
				const events = queue.splice(0, queue.length)
				refreshQueueLength()
				for (let index = 0; index < events.length; index += batchSize) {
					await sendBatch(events.slice(index, index + batchSize), true, false)
				}
				return
			}
			while (!disabled && queue.length > 0) {
				const events = queue.splice(0, batchSize)
				refreshQueueLength()
				await sendBatch(events, false, true)
			}
		})().finally(() => {
			flushing = false
			flushPromise = null
			if (!disabled && queue.length > 0) scheduleFlush()
		})
		try {
			await flushPromise
		} catch (error) {
			reportInternalError('flush', error)
		}
	}

	/**
	 * 等待所有事件预处理完成。
	 */
	async function waitForPending(): Promise<void> {
		while (pendingProcesses.size > 0) {
			await Promise.allSettled([...pendingProcesses])
		}
	}

	/**
	 * 执行插件与全局 beforeSend、采样和上下文补充。
	 * @param event 初始事件
	 * @param input 插件输入
	 * @param captureOptions 捕获选项
	 */
	async function processEvent(
		event: MonitorEvent,
		input: MonitorEventInput,
		captureOptions: CaptureOptions,
	): Promise<void> {
		if (disabled) return
		let current: MonitorEvent | null = event
		for (const plugin of startedPlugins) {
			if (!plugin.beforeSend || current === null) continue
			try {
				current = await plugin.beforeSend(current)
			} catch (error) {
				reportInternalError(`plugin.beforeSend:${plugin.name}`, error)
			}
		}
		if (current && options.beforeSend) {
			try {
				current = await options.beforeSend(current)
			} catch (error) {
				reportInternalError('beforeSend', error)
			}
		}
		if (!current || disabled) return
		current.eventId = current.eventId || event.eventId
		const dedupeKey = captureOptions.dedupeKey ?? input.dedupeKey
		if (dedupeKey && isDuplicate(dedupeKey)) return
		const eventRate = clampSampleRate(captureOptions.sampleRate ?? input.sampleRate ?? 1)
		const globalRate = clampSampleRate(options.sampleRate ?? DEFAULT_SAMPLE_RATE)
		if (!isSampled(eventRate * globalRate, random)) return
		const finalContext = buildContext(true)
		const eventExtra = current.context?.extra
		if (eventExtra) finalContext.extra = { ...(finalContext.extra ?? {}), ...eventExtra }
		if (input.extra) {
			finalContext.extra = { ...(finalContext.extra ?? {}), ...cloneJson(input.extra) }
		}
		if (input.trace) finalContext.trace = input.trace
		if (input.replay) finalContext.replay = input.replay
		current.context = finalContext
		enqueue(current)
		if (options.debug) console.debug('[dt-monitor]', current.type, current.name)
	}

	/**
	 * 创建并调度一个标准事件。
	 * @param input 插件输入
	 * @param captureOptions 捕获选项
	 * @returns 事件 ID 或 null
	 */
	function captureEvent(input: MonitorEventInput, captureOptions: CaptureOptions = {}): string | null {
		if (disabled) return null
		const name = normalizeEventName(input.name)
		if (!name) return null
		const now = new Date(clock.now()).toISOString()
		const event: MonitorEvent = {
			eventId: uuid.generate(),
			type: input.type,
			name:
				input.type === 'error'
					? truncateString(name, MAX_ERROR_MESSAGE_LENGTH)
					: name,
			level: input.level ?? defaultLevel(input.type),
			timestamp: now,
			occurredAt: now,
			eventType: input.eventType,
			context: buildContext(false),
			properties: input.properties,
			error: input.error,
			metric: input.metric,
			span: input.span,
		}
		const task = processEvent(event, input, captureOptions).catch((error) => {
			reportInternalError('processEvent', error)
		})
		pendingProcesses.add(task)
		void task.finally(() => pendingProcesses.delete(task))
		return event.eventId
	}

	/**
	 * 捕获异常并返回事件 ID。
	 * @param error 异常
	 * @param context 捕获上下文
	 * @returns 事件 ID
	 */
	function captureException(error: unknown, context: ExceptionCaptureContext = {}): string | null {
		const normalized = normalizeError(error)
		const {
			mechanism = 'manual',
			handled = true,
			componentName,
			info,
			fingerprint,
			...extra
		} = context
		return captureEvent({
			type: 'error',
			name: normalized.message,
			level: 'error',
			error: {
				message: normalized.message,
				stack: normalized.stack,
				type: normalized.type,
				mechanism,
				handled,
				componentName,
				info,
				fingerprint:
					fingerprint ??
					composeFingerprint([normalized.message, normalized.stack?.split('\n')[1]]),
			},
			extra: extra as Record<string, unknown>,
		})
	}

	/**
	 * 捕获文本消息。
	 * @param message 消息
	 * @param level 级别
	 * @param context 捕获上下文
	 * @returns 事件 ID
	 */
	function captureMessage(
		message: string,
		level: Severity = 'info',
		context: ExceptionCaptureContext = {},
	): string | null {
		const { mechanism = 'manual', handled = true, ...extra } = context
		return captureEvent({
			type: 'error',
			name: nameOfMessage(message),
			level,
			error: {
				message: truncateString(String(message), MAX_ERROR_MESSAGE_LENGTH),
				mechanism,
				handled,
			},
			extra: extra as Record<string, unknown>,
		})
	}

	/**
	 * 生成捕获消息名。
	 * @param message 消息
	 * @returns 截断后的消息
	 */
	function nameOfMessage(message: string): string {
		return truncateString(String(message), MAX_ERROR_MESSAGE_LENGTH)
	}

	/**
	 * 记录业务埋点。
	 * @param eventName 事件名
	 * @param properties 属性
	 * @param captureOptions 捕获选项
	 * @returns 是否进入处理管线
	 */
	function track(
		eventName: string,
		properties?: Record<string, unknown>,
		captureOptions: CaptureOptions = {},
	): boolean {
		if (disabled) return false
		const name = normalizeEventName(eventName)
		if (!isValidTrackName(name)) {
			if (options.debug) console.debug('[dt-monitor] invalid track name', eventName)
			return false
		}
		const normalized = normalizeProperties(properties)
		const nextProperties = normalized.properties ?? {}
		if (normalized.truncated) nextProperties.__truncated = true
		captureEvent(
			{
				type: 'analytics',
				name,
				eventType: 'custom',
				properties: nextProperties,
			},
			captureOptions,
		)
		return true
	}

	/**
	 * 记录页面浏览并更新页面上下文。
	 * @param payload 页面信息
	 */
	function pageView(payload: PageViewPayload = {}): void {
		if (disabled) return
		const provided = readProviderContext()
		const baseUrl = resolvePageBase(provided, payload)
		const rawUrl = payload.url ?? provided.page?.url ?? currentPage?.url ?? ''
		const safeUrl = rawUrl ? sanitizeUrl(rawUrl, { base: baseUrl }) : ''
		const path = payload.path ?? (safeUrl ? toPagePath(safeUrl) : provided.page?.path ?? '')
		const pathChanged = currentPage?.path !== path || !currentPage?.id
		currentPage = {
			id: pathChanged ? uuid.generate() : currentPage?.id ?? uuid.generate(),
			url: safeUrl || payload.path || '',
			path: truncateString(path, 255),
			title: payload.title ?? provided.page?.title ?? currentPage?.title,
			referrer: payload.referrer ?? provided.page?.referrer ?? currentPage?.referrer,
			navigationType: provided.page?.navigationType,
			viewport: provided.page?.viewport,
			screen: provided.page?.screen,
			language: provided.page?.language,
			timezone: provided.page?.timezone,
		}
		captureEvent({ type: 'page_view', name: 'page_view', eventType: 'page_view' })
	}

	/**
	 * 选择页面 URL 解析基准。
	 * @param provided 动态上下文
	 * @param payload 页面浏览参数
	 * @returns 基准地址
	 */
	function resolvePageBase(
		provided: Partial<MonitorEventContext>,
		payload: PageViewPayload,
	): string | undefined {
		return payload.url ?? provided.page?.url ?? currentPage?.url
	}

	/**
	 * 更新登录用户。
	 * @param distinctId 用户 ID
	 * @param traits 用户属性
	 */
	function identify(distinctId: string, traits?: Record<string, unknown>): void {
		if (!distinctId) return
		user = {
			id: distinctId,
			anonymousId: user.anonymousId,
			traits: traits ? cloneJson(traits) : undefined,
		}
		writeJsonStorage(storage, USER_KEY, user)
	}

	/**
	 * 设置或清理用户。
	 * @param next 用户或 null
	 */
	function setUser(next: MonitorUser | null): void {
		if (!next) {
			resetIdentity()
			return
		}
		user = {
			id: next.id,
			anonymousId: next.anonymousId || user.anonymousId,
			traits: next.traits ? cloneJson(next.traits) : undefined,
		}
		writeJsonStorage(storage, USER_KEY, user)
	}

	/**
	 * 重置用户、匿名 ID 与会话。
	 */
	function resetUser(): void {
		resetIdentity()
	}

	/**
	 * 设置公共标签。
	 * @param key 标签键
	 * @param value 标签值
	 */
	function setTag(key: string, value: string): void {
		if (!key) return
		tags.set(truncateString(key, 64), truncateString(String(value), 256))
	}

	/**
	 * 设置公共上下文。
	 * @param key 上下文键
	 * @param value 上下文值
	 */
	function setContext(key: string, value: Record<string, unknown>): void {
		if (!key) return
		extraContext[truncateString(key, 64)] = cloneJson(value)
	}

	/**
	 * 添加面包屑。
	 * @param breadcrumb 面包屑
	 */
	function addBreadcrumb(breadcrumb: MonitorBreadcrumb): void {
		breadcrumbs.push(cloneJson(breadcrumb))
		if (breadcrumbs.length > 50) breadcrumbs.splice(0, breadcrumbs.length - 50)
	}

	/**
	 * 返回面包屑副本。
	 * @returns 面包屑列表
	 */
	function getBreadcrumbs(): MonitorBreadcrumb[] {
		return capBreadcrumbs(cloneJson(breadcrumbs))
	}

	/**
	 * 返回诊断快照。
	 * @returns 诊断计数
	 */
	function getDiagnostics(): MonitorDiagnostics {
		refreshQueueLength()
		return cloneJson(diagnostics)
	}

	/**
	 * 停止客户端并清理插件。
	 */
	function disable(): void {
		if (disabled) return
		disabled = true
		clearFlushTimer()
		queue.splice(0, queue.length)
		refreshQueueLength()
		for (const plugin of [...startedPlugins].reverse()) {
			if (!plugin.stop) continue
			try {
				plugin.stop()
			} catch (error) {
				reportInternalError(`plugin.stop:${plugin.name}`, error)
			}
		}
		startedPlugins.splice(0, startedPlugins.length)
	}

	/**
	 * 等待预处理并发送全部队列。
	 * @param flushOptions 发送选项
	 */
	async function flush(flushOptions: FlushOptions = {}): Promise<void> {
		if (disabled) return
		await waitForPending()
		await flushInternal(Boolean(flushOptions.useBeacon))
	}

	const api = createApi()
	for (const plugin of plugins) {
		if (!plugin.setup) continue
		try {
			plugin.setup(api, options)
		} catch (error) {
			failedPlugins.add(plugin.name)
			reportInternalError(`plugin.setup:${plugin.name}`, error)
		}
	}
	for (const plugin of plugins) {
		if (failedPlugins.has(plugin.name) || !plugin.start) {
			if (!failedPlugins.has(plugin.name)) startedPlugins.push(plugin)
			continue
		}
		try {
			plugin.start()
			startedPlugins.push(plugin)
		} catch (error) {
			failedPlugins.add(plugin.name)
			reportInternalError(`plugin.start:${plugin.name}`, error)
		}
	}

	/**
	 * 组装公开客户端 API；插件 setup 期间即可使用。
	 * @returns 客户端
	 */
	function createApi(): MonitorClient {
		return {
			captureException,
			captureMessage,
			track,
			pageView,
			identify,
			setUser,
			resetUser,
			setTag,
			setContext,
			setTraceContext(next) {
				traceContext = next ? cloneJson(next) : null
			},
			setReplayContext(next) {
				replayContext = next ? cloneJson(next) : null
			},
			addBreadcrumb,
			getBreadcrumbs,
			captureEvent,
			getContext: () => buildContext(false),
			getDsn: () => ({ ...dsn }),
			getDiagnostics,
			flush,
			disable,
			isDisabled: () => disabled,
		}
	}

	return api
}
