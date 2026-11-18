import {
	DEFAULT_ERROR_SAMPLE_RATE,
	MAX_ERROR_MESSAGE_LENGTH,
	MAX_STACK_LENGTH,
} from '@dt-monitor/contracts'
import type { MonitorErrorPayload } from '@dt-monitor/contracts'
import type { MonitorClient, MonitorPlugin } from '@dt-monitor/sdk-core'
import {
	composeFingerprint,
	normalizeError,
	sanitizeUrl,
	summarizeConsoleArgs,
	truncateString,
} from '@dt-monitor/sdk-core'

/** 浏览器错误插件选项。 */
export interface ErrorsPluginOptions {
	/** 是否捕获 console.error，默认 true。 */
	captureConsole?: boolean
	/** 是否捕获资源加载错误，默认 true。 */
	captureResourceErrors?: boolean
	/** 错误事件采样率。 */
	sampleRate?: number
	/** 消息忽略规则。 */
	ignoreErrors?: Array<string | RegExp>
	/** 相同错误指纹去重窗口。 */
	dedupeWindowMs?: number
	/** 保留的最大堆栈帧数。 */
	maxStackFrames?: number
}

/** 资源元素的最小结构。 */
interface ResourceTarget {
	tagName?: string
	currentSrc?: string
	src?: string
	href?: string
	crossOrigin?: string | null
}

/**
 * 判断事件目标是否为带资源地址的元素。
 * @param target 事件目标
 * @returns 是否为资源目标
 */
function isResourceTarget(target: EventTarget | null): target is EventTarget & ResourceTarget {
	if (!target || typeof target !== 'object') return false
	const element = target as ResourceTarget
	return Boolean(element.tagName && (element.currentSrc || element.src || element.href))
}

/**
 * 截取堆栈帧。
 * @param stack 原始堆栈
 * @param maxFrames 最大帧数
 * @returns 截断后的堆栈
 */
function trimStack(stack: string | undefined, maxFrames: number): string | undefined {
	if (!stack) return undefined
	const lines = stack.split('\n')
	const kept = lines.slice(0, Math.max(1, maxFrames) + 1).join('\n')
	return truncateString(kept, MAX_STACK_LENGTH)
}

/**
 * 创建浏览器错误采集插件。
 * @param options 插件选项
 * @returns 监控插件
 */
export function errorsPlugin(options: ErrorsPluginOptions = {}): MonitorPlugin {
	const captureConsole = options.captureConsole ?? true
	const captureResourceErrors = options.captureResourceErrors ?? true
	const sampleRate = options.sampleRate ?? DEFAULT_ERROR_SAMPLE_RATE
	const dedupeWindowMs = options.dedupeWindowMs ?? 1_000
	const maxStackFrames = options.maxStackFrames ?? 20
	let client: MonitorClient | undefined
	let started = false
	let originalConsoleError: typeof console.error | undefined
	let wrappedConsoleError: typeof console.error | undefined
	let windowErrorListener: ((event: ErrorEvent) => void) | undefined
	let rejectionListener: ((event: PromiseRejectionEvent) => void) | undefined
	const seenErrors = new WeakSet<object>()
	const fingerprints = new Map<string, number>()

	/**
	 * 判断消息是否命中忽略规则。
	 * @param message 消息
	 * @returns 是否忽略
	 */
	function isIgnored(message: string): boolean {
		return (options.ignoreErrors ?? []).some((rule) => {
			if (typeof rule === 'string') return message.includes(rule)
			rule.lastIndex = 0
			return rule.test(message)
		})
	}

	/**
	 * 判断同一错误是否在去重窗口内重复。
	 * @param fingerprint 错误指纹
	 * @param errorObject 原始错误对象
	 * @returns 是否重复
	 */
	function isDuplicate(fingerprint: string, errorObject?: object): boolean {
		const now = Date.now()
		if (errorObject) {
			if (seenErrors.has(errorObject)) return true
			seenErrors.add(errorObject)
		}
		const previous = fingerprints.get(fingerprint)
		if (previous !== undefined && now - previous < dedupeWindowMs) return true
		fingerprints.set(fingerprint, now)
		if (fingerprints.size > 500) {
			for (const [key, timestamp] of fingerprints) {
				if (now - timestamp >= dedupeWindowMs) fingerprints.delete(key)
			}
		}
		return false
	}

	/**
	 * 上报标准化错误。
	 * @param error 错误载荷
	 * @param errorObject 原始错误对象
	 */
	function report(error: MonitorErrorPayload, errorObject?: object): void {
		if (!client || !started) return
		const message = truncateString(error.message, MAX_ERROR_MESSAGE_LENGTH)
		if (!message || isIgnored(message)) return
		const fingerprint = composeFingerprint([
			error.fingerprint ?? message,
			error.stack?.split('\n')[1],
			error.resourceUrl,
		])
		if (isDuplicate(fingerprint, errorObject)) return
		client.captureEvent({
			type: 'error',
			name: message,
			level: 'error',
			error: {
				...error,
				message,
				stack: trimStack(error.stack, maxStackFrames),
				fingerprint,
			},
			sampleRate,
		})
	}

	/**
	 * 捕获 console.error。
	 * @param args 控制台参数
	 */
	function handleConsole(args: unknown[]): void {
		if (!client) return
		const message = summarizeConsoleArgs(args)
		if (!message || isIgnored(message)) return
		const errorObject = args.find(
			(arg): arg is Error => typeof arg === 'object' && arg instanceof Error,
		)
		const stack = errorObject?.stack ?? new Error().stack
		client.addBreadcrumb({
			type: 'console',
			message,
			timestamp: new Date().toISOString(),
		})
		report(
			{
				message,
				stack: trimStack(stack, maxStackFrames),
				type: errorObject?.name,
				mechanism: 'console',
				handled: false,
			},
			errorObject,
		)
	}

	/**
	 * 捕获 window error。
	 * @param event 错误事件
	 */
	function handleWindowError(event: ErrorEvent): void {
		if (!captureResourceErrors && isResourceTarget(event.target)) return
		if (isResourceTarget(event.target)) {
			const element = event.target
			const resourceUrl = sanitizeUrl(element.currentSrc || element.src || element.href || '')
			report({
				message: `资源加载失败: ${resourceUrl}`,
				resourceUrl,
				tagName: element.tagName,
				mechanism: 'resource',
				handled: false,
			})
			return
		}
		const normalized = normalizeError(event.error ?? event.message)
		const stack = event.error?.stack
		report(
			{
				message: normalized.message,
				stack: trimStack(stack, maxStackFrames),
				type: normalized.type,
				source: event.filename ? sanitizeUrl(event.filename) : undefined,
				lineno: event.lineno || undefined,
				colno: event.colno || undefined,
				mechanism: 'window',
				handled: false,
			},
			event.error ?? undefined,
		)
	}

	/**
	 * 捕获未处理 Promise 拒绝。
	 * @param event Promise 拒绝事件
	 */
	function handleRejection(event: PromiseRejectionEvent): void {
		const normalized = normalizeError(event.reason)
		report(
			{
				message: normalized.message,
				stack: trimStack(normalized.stack, maxStackFrames),
				type: normalized.type,
				mechanism: 'unhandledrejection',
				handled: false,
			},
			typeof event.reason === 'object' && event.reason !== null ? event.reason : undefined,
		)
	}

	return {
		name: 'errors',
		setup(instance) {
			client = instance
		},
		start() {
			if (started || !client || typeof window === 'undefined') return
			started = true
			windowErrorListener = handleWindowError
			rejectionListener = handleRejection
			window.addEventListener('error', windowErrorListener, true)
			window.addEventListener('unhandledrejection', rejectionListener)
			if (captureConsole && typeof console !== 'undefined') {
				originalConsoleError = console.error
				wrappedConsoleError = ((...args: unknown[]) => {
					try {
						handleConsole(args)
					} catch {
						// 控制台捕获失败不能影响宿主日志。
					}
					originalConsoleError?.(...args)
				}) as typeof console.error
				console.error = wrappedConsoleError
			}
		},
		stop() {
			if (!started) return
			started = false
			if (windowErrorListener) window.removeEventListener('error', windowErrorListener, true)
			if (rejectionListener) window.removeEventListener('unhandledrejection', rejectionListener)
			if (originalConsoleError && console.error === wrappedConsoleError) {
				console.error = originalConsoleError
			}
			windowErrorListener = undefined
			rejectionListener = undefined
			originalConsoleError = undefined
			wrappedConsoleError = undefined
		},
	}
}
