import { SDK_VERSION, parseDsn } from '@dt-monitor/contracts'
import type { MonitorEventContext } from '@dt-monitor/contracts'
import { createMonitorClient } from '@dt-monitor/sdk-core'
import type { MonitorClient, MonitorOptions, MonitorPlugin } from '@dt-monitor/sdk-core'
import {
	createBrowserContextProvider,
	createBrowserStorages,
} from './browser-context'
import { createBrowserTransport } from './transport'
import { errorsPlugin } from './plugins/errors'
import { performancePlugin } from './plugins/performance'
import { analyticsPlugin } from './plugins/analytics'

/** 浏览器初始化选项。 */
export interface BrowserInitOptions extends MonitorOptions {
	plugins?: MonitorPlugin[]
}

/** 当前浏览器客户端。 */
let current: { signature: string; client: MonitorClient } | undefined

/**
 * 创建默认插件集合。
 * @returns 默认插件
 */
function defaultPlugins(): MonitorPlugin[] {
	return [errorsPlugin(), performancePlugin(), analyticsPlugin()]
}

/**
 * 初始化浏览器监控客户端；重复调用返回同一实例。
 * @param options 初始化选项
 * @returns 监控客户端
 */
export function initMonitor(options: BrowserInitOptions): MonitorClient {
	const signature = `${options.dsn}|${options.app.name}|${options.app.version ?? ''}`
	if (current?.signature === signature && !current.client.isDisabled()) {
		return current.client
	}
	current?.client.disable()
	const parsed = parseDsn(options.dsn)
	const storages = createBrowserStorages()
	const browserProvider = createBrowserContextProvider()
	const userProvider = options.contextProvider
	const contextProvider = (): Partial<MonitorEventContext> => ({
		...browserProvider(),
		...userProvider?.(),
	})
	const transport =
		options.transport ??
		createBrowserTransport({
			dsn: parsed,
			keepalive: true,
		})
	const client = createMonitorClient({
		...options,
		sdk: { name: '@dt-monitor/sdk-browser', version: SDK_VERSION },
		plugins: options.plugins ?? defaultPlugins(),
		transport,
		storage: options.storage ?? storages.storage,
		sessionStorage: options.sessionStorage ?? storages.sessionStorage,
		contextProvider,
	})
	current = { signature, client }
	attachLifecycleFlush(client)
	return client
}

/**
 * 获取当前浏览器客户端。
 * @returns 客户端或 null
 */
export function getMonitor(): MonitorClient | null {
	return current?.client ?? null
}

/**
 * 页面隐藏或卸载时尽力发送队列。
 * @param client 客户端
 */
function attachLifecycleFlush(client: MonitorClient): void {
	if (typeof window === 'undefined' || typeof document === 'undefined') return
	let flushed = false
	const onPageHide = (): void => {
		if (flushed || client.isDisabled()) return
		flushed = true
		void client.flush({ useBeacon: true })
	}
	const onVisibilityChange = (): void => {
		if (document.visibilityState === 'hidden') onPageHide()
	}
	window.addEventListener('pagehide', onPageHide)
	document.addEventListener('visibilitychange', onVisibilityChange)
}
