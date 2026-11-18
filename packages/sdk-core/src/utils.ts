import {
	MAX_BREADCRUMBS,
	MAX_ERROR_MESSAGE_LENGTH,
	MAX_EVENT_NAME_LENGTH,
	MAX_PROPERTIES,
	MAX_PROPERTY_NAME_LENGTH,
	MAX_STACK_LENGTH,
	REDACTED_VALUE,
	SENSITIVE_QUERY_KEYS,
} from '@dt-monitor/contracts'
import type { EventProperties, MonitorBreadcrumb, PropertyValue } from '@dt-monitor/contracts'
import type { Clock, StorageAdapter, Uuid } from './types'

/** 默认系统时钟。 */
export const systemClock: Clock = {
	now: () => Date.now(),
}

/**
 * 创建基于 crypto.randomUUID 的 ID 生成器。
 * @returns ID 生成器
 */
export function createSystemUuid(): Uuid {
	return {
		generate(): string {
			const cryptoApi = globalThis.crypto
			if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
				return cryptoApi.randomUUID()
			}
			const randomPart = Math.random().toString(16).slice(2, 10)
			return `${Date.now().toString(16)}${randomPart}`.padEnd(32, '0').slice(0, 32)
		},
	}
}

/**
 * 创建仅存在于内存的存储适配器。
 * @returns 存储适配器
 */
export function createMemoryStorage(): StorageAdapter {
	const data = new Map<string, string>()
	return {
		getItem: (key) => data.get(key) ?? null,
		setItem: (key, value) => {
			data.set(key, value)
		},
		removeItem: (key) => {
			data.delete(key)
		},
	}
}

/**
 * 截断字符串。
 * @param value 原字符串
 * @param max 最大长度
 * @returns 截断后的字符串
 */
export function truncateString(value: string, max: number): string {
	if (value.length <= max) return value
	return `${value.slice(0, Math.max(0, max - 1))}…`
}

/**
 * 判断给定值是否为普通对象。
 * @param value 任意值
 * @returns 是否为普通对象
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== 'object') return false
	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}

/**
 * 安全 JSON 克隆，失败时返回原值。
 * @param value 任意可序列化值
 * @returns 克隆后的值
 */
export function cloneJson<T>(value: T): T {
	try {
		return JSON.parse(JSON.stringify(value)) as T
	} catch {
		return value
	}
}

/**
 * 生成事件名，超长时截断。
 * @param name 原始事件名
 * @returns 合法事件名
 */
export function normalizeEventName(name: string): string {
	return truncateString(String(name ?? '').trim(), MAX_EVENT_NAME_LENGTH)
}

/**
 * 校验埋点事件名是否使用 snake_case。
 * @param name 事件名
 * @returns 是否合法
 */
export function isValidTrackName(name: string): boolean {
	return /^[a-z][a-z0-9_]*$/.test(name) && name.length <= MAX_EVENT_NAME_LENGTH
}

/**
 * 将单个属性值规整为最多两层的 JSON 安全值。
 * @param value 原属性值
 * @param depth 当前深度
 * @returns 规整后的值
 */
function normalizePropertyValue(value: unknown, depth: number): PropertyValue {
	if (value === null) return null
	if (typeof value === 'string') return truncateString(value, 512)
	if (typeof value === 'number') return Number.isFinite(value) ? value : 0
	if (typeof value === 'boolean') return value
	if (depth >= 2) return '[truncated]'
	if (Array.isArray(value)) {
		return value.slice(0, 50).map((item) => normalizePropertyValue(item, depth + 1))
	}
	if (isPlainObject(value)) {
		const result: Record<string, PropertyValue> = {}
		for (const [key, item] of Object.entries(value).slice(0, 50)) {
			result[truncateString(key, MAX_PROPERTY_NAME_LENGTH)] = normalizePropertyValue(
				item,
				depth + 1,
			)
		}
		return result
	}
	return String(value)
}

/**
 * 规整事件属性，限制属性数量、名称和值深度。
 * @param properties 原始属性
 * @returns 规整后的属性以及是否发生截断
 */
export function normalizeProperties(properties?: Record<string, unknown>): {
	properties?: EventProperties
	truncated: boolean
} {
	if (!properties) return { truncated: false }
	const entries = Object.entries(properties)
	const truncated = entries.length > MAX_PROPERTIES
	const normalized: EventProperties = {}
	for (const [key, value] of entries.slice(0, MAX_PROPERTIES)) {
		const safeKey = truncateString(key, MAX_PROPERTY_NAME_LENGTH)
		if (!safeKey) continue
		normalized[safeKey] = normalizePropertyValue(value, 0)
	}
	return { properties: normalized, truncated }
}

/**
 * 对 URL 查询参数中的敏感键做脱敏并截断。
 * @param input 原始 URL 或路径
 * @param options 基础地址与最大长度
 * @returns 脱敏后的 URL
 */
export function sanitizeUrl(
	input: string,
	options: { base?: string; maxLength?: number } = {},
): string {
	const maxLength = options.maxLength ?? 2_000
	let url: URL | undefined
	try {
		url = new URL(input, options.base)
	} catch {
		url = undefined
	}
	if (url) {
		for (const key of SENSITIVE_QUERY_KEYS) {
			if (url.searchParams.has(key)) url.searchParams.set(key, REDACTED_VALUE)
		}
		url.hash = ''
		return truncateString(url.toString(), maxLength)
	}
	const redacted = input.replace(
		new RegExp(`(${SENSITIVE_QUERY_KEYS.join('|')})=[^&\\s]+`, 'gi'),
		`$1=${REDACTED_VALUE}`,
	)
	return truncateString(redacted, maxLength)
}

/**
 * 将 URL 转为不含源站的页面路径。
 * @param input URL 或路径
 * @param base 可选基础地址
 * @returns 路径与查询串
 */
export function toPagePath(input: string, base?: string): string {
	try {
		const url = new URL(input, base)
		const path = `${url.pathname}${url.search}`
		return sanitizeUrl(path, { base: url.origin })
			.replace(url.origin, '')
			.slice(0, 255)
	} catch {
		return truncateString(input, 255)
	}
}

/**
 * 将未知错误转换为消息与堆栈。
 * @param error 未知错误
 * @returns 标准化错误描述
 */
export function normalizeError(error: unknown): {
	message: string
	stack?: string
	type?: string
} {
	if (error instanceof Error) {
		return {
			message: truncateString(error.message || error.name, MAX_ERROR_MESSAGE_LENGTH),
			stack: error.stack ? truncateString(error.stack, MAX_STACK_LENGTH) : undefined,
			type: error.name,
		}
	}
	if (typeof error === 'string') {
		return { message: truncateString(error, MAX_ERROR_MESSAGE_LENGTH) }
	}
	try {
		return {
			message: truncateString(JSON.stringify(error), MAX_ERROR_MESSAGE_LENGTH),
		}
	} catch {
		return { message: truncateString(String(error), MAX_ERROR_MESSAGE_LENGTH) }
	}
}

/**
 * 将控制台参数转换为可上报的摘要。
 * @param args 控制台参数
 * @returns 一行摘要
 */
export function summarizeConsoleArgs(args: unknown[]): string {
	return truncateString(
		args
			.map((arg) => {
				if (arg instanceof Error) return `${arg.name}: ${arg.message}`
				if (typeof arg === 'string') return arg
				try {
					return JSON.stringify(arg)
				} catch {
					return String(arg)
				}
			})
			.join(' '),
		MAX_ERROR_MESSAGE_LENGTH,
	)
}

/**
 * 组合稳定指纹。
 * @param parts 指纹组成部分
 * @returns 指纹字符串
 */
export function composeFingerprint(parts: Array<string | undefined>): string {
	return parts.filter(Boolean).join('|').slice(0, 512)
}

/**
 * 限制采样率到 0 到 1 之间。
 * @param rate 原始采样率
 * @returns 合法采样率
 */
export function clampSampleRate(rate: number): number {
	if (!Number.isFinite(rate)) return 1
	return Math.min(1, Math.max(0, rate))
}

/**
 * 根据采样率与随机函数判断是否命中。
 * @param rate 采样率
 * @param random 随机函数
 * @returns 是否采样
 */
export function isSampled(rate: number, random: () => number): boolean {
	const safeRate = clampSampleRate(rate)
	if (safeRate <= 0) return false
	if (safeRate >= 1) return true
	return random() < safeRate
}

/**
 * 将面包屑数组限制在最大长度，保留最新记录。
 * @param breadcrumbs 面包屑数组
 * @returns 截断后的数组
 */
export function capBreadcrumbs(breadcrumbs: MonitorBreadcrumb[]): MonitorBreadcrumb[] {
	return breadcrumbs.slice(-MAX_BREADCRUMBS)
}

/**
 * 创建默认重试等待函数。
 * @returns 等待函数
 */
export function createRetryDelay(): (ms: number) => Promise<void> {
	return (ms) => new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 读取并解析存储中的 JSON，失败时返回空值。
 * @param storage 存储适配器
 * @param key 存储键
 * @returns 解析结果
 */
export function readJsonStorage<T>(storage: StorageAdapter, key: string): T | undefined {
	try {
		const raw = storage.getItem(key)
		if (!raw) return undefined
		return JSON.parse(raw) as T
	} catch {
		return undefined
	}
}

/**
 * 将 JSON 写入存储，失败时静默降级。
 * @param storage 存储适配器
 * @param key 存储键
 * @param value 写入值
 */
export function writeJsonStorage(storage: StorageAdapter, key: string, value: unknown): void {
	try {
		storage.setItem(key, JSON.stringify(value))
	} catch {
		// 存储不可用时仅在内存中维护状态。
	}
}
