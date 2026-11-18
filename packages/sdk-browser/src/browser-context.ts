import { sanitizeUrl, toPagePath } from '@dt-monitor/sdk-core'
import type { MonitorBrowserContext, MonitorEventContext, MonitorPageContext } from '@dt-monitor/contracts'
import type { MonitorClient } from '@dt-monitor/sdk-core'

/**
 * 解析浏览器名称与版本。
 * @param userAgent UA 字符串
 * @returns 浏览器信息
 */
export function parseBrowser(userAgent: string): { name: string; version?: string } {
	const patterns: Array<[string, RegExp]> = [
		['Edge', /(?:Edg|EdgA|EdgiOS)\/([\d.]+)/],
		['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
		['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
		['Safari', /Version\/([\d.]+).*Safari/],
	]
	for (const [name, pattern] of patterns) {
		const match = userAgent.match(pattern)
		if (match?.[1]) return { name, version: match[1] }
	}
	return { name: 'unknown' }
}

/**
 * 解析操作系统。
 * @param userAgent UA 字符串
 * @returns 操作系统信息
 */
export function parseOs(userAgent: string): { name: string; version?: string } {
	const windows = userAgent.match(/Windows NT ([\d.]+)/)
	if (windows?.[1]) return { name: 'Windows', version: windows[1] }
	const android = userAgent.match(/Android ([\d.]+)/)
	if (android?.[1]) return { name: 'Android', version: android[1] }
	if (/iPhone|iPad|iPod/.test(userAgent)) return { name: 'iOS' }
	const mac = userAgent.match(/Mac OS X ([\d_]+)/)
	if (mac?.[1]) return { name: 'macOS', version: mac[1].replace(/_/g, '.') }
	if (/Linux/.test(userAgent)) return { name: 'Linux' }
	return { name: 'unknown' }
}

/**
 * 解析设备类型。
 * @param userAgent UA 字符串
 * @returns 设备类型
 */
export function parseDeviceType(
	userAgent: string,
): 'desktop' | 'mobile' | 'tablet' | 'unknown' {
	if (/iPad|Tablet/.test(userAgent)) return 'tablet'
	if (/Mobi|Android|iPhone|iPod/.test(userAgent)) return 'mobile'
	if (userAgent) return 'desktop'
	return 'unknown'
}

/**
 * 读取当前页面上下文。
 * @returns 页面上下文
 */
export function getPageContext(): MonitorPageContext | undefined {
	if (typeof window === 'undefined' || typeof document === 'undefined') return undefined
	const url = sanitizeUrl(window.location.href)
	const path = toPagePath(window.location.href)
	const navigation = performance.getEntriesByType('navigation')[0] as
		| PerformanceNavigationTiming
		| undefined
	return {
		id: '',
		url,
		path,
		title: document.title || undefined,
		referrer: document.referrer ? sanitizeUrl(document.referrer) : undefined,
		navigationType: navigation?.type ?? 'navigate',
		viewport: { width: window.innerWidth, height: window.innerHeight },
		screen: { width: window.screen.width, height: window.screen.height },
		language: navigator.language,
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
	}
}

/**
 * 读取浏览器、系统与设备信息。
 * @returns 浏览器上下文
 */
export function getBrowserContext(): MonitorBrowserContext {
	if (typeof navigator === 'undefined') return {}
	const userAgent = navigator.userAgent
	return {
		...parseBrowser(userAgent),
		os: parseOs(userAgent),
		device: { type: parseDeviceType(userAgent) },
	}
}

/**
 * 创建浏览器动态上下文提供器。
 * @returns 上下文提供函数
 */
export function createBrowserContextProvider(): () => Partial<MonitorEventContext> {
	let cachedPath = ''
	let pageId = ''
	return () => {
		const page = getPageContext()
		if (page) {
			if (page.path !== cachedPath) {
				cachedPath = page.path
				pageId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`
			}
			page.id = pageId
		}
		const browser = getBrowserContext()
		return {
			page,
			browser,
			os: browser.os,
			device: browser.device,
		}
	}
}

/**
 * 创建浏览器存储适配器：会话写入 sessionStorage，其余写入 localStorage。
 * @returns 存储适配器
 */
export function createBrowserStorage(): {
	getItem(key: string): string | null
	setItem(key: string, value: string): void
	removeItem(key: string): void
} {
	const memory = new Map<string, string>()
	const pick = (key: string): Storage | undefined => {
		try {
			return key.startsWith('dt_monitor.session') ? window.sessionStorage : window.localStorage
		} catch {
			return undefined
		}
	}
	return {
		getItem(key) {
			try {
				return pick(key)?.getItem(key) ?? memory.get(key) ?? null
			} catch {
				return memory.get(key) ?? null
			}
		},
		setItem(key, value) {
			try {
				const target = pick(key)
				if (target) target.setItem(key, value)
				else memory.set(key, value)
			} catch {
				memory.set(key, value)
			}
		},
		removeItem(key) {
			try {
				pick(key)?.removeItem(key)
			} catch {
				// 存储不可用时忽略。
			}
			memory.delete(key)
		},
	}
}

/**
 * 创建浏览器存储，但会话使用单一 storage 对象。
 * @returns 存储对象与会话存储对象
 */
export function createBrowserStorages(): {
	storage: ReturnType<typeof createBrowserStorage>
	sessionStorage: ReturnType<typeof createBrowserStorage>
} {
	const storage = createBrowserStorage()
	const sessionStorage = {
		getItem: (key: string) => storage.getItem(key),
		setItem: (key: string, value: string) => storage.setItem(key, value),
		removeItem: (key: string) => storage.removeItem(key),
	}
	return { storage, sessionStorage }
}

/**
 * 填充页面 ID，用于没有 pageView 时的首屏错误。
 * @param client 监控客户端
 * @param page 页面上下文
 */
export function attachPageId(client: MonitorClient, page: MonitorPageContext | undefined): void {
	if (!page || page.id) return
	page.id = client.getContext().page?.id ?? `${Date.now()}${Math.random()}`
}
