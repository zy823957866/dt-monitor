import { getMonitor } from '@dt-monitor/sdk-browser'
import type { MonitorClient } from '@dt-monitor/sdk-core'
import type { App, ComponentPublicInstance } from 'vue'
import type {
	MonitorVueErrorHandler,
	MonitorVueNavigationHook,
	MonitorVuePlugin,
	MonitorVuePluginOptions,
	MonitorVueRoute,
} from './types'

/**
 * 读取 Vue 组件名，只允许 name 字段，不访问 props 或响应式状态。
 * @param instance Vue 组件实例
 * @returns 组件名
 */
function readComponentName(instance: ComponentPublicInstance | null): string | undefined {
	if (!instance) return undefined
	try {
		const options = instance.$options as { name?: unknown; __name?: unknown }
		const name = options.name ?? options.__name
		if (typeof name !== 'string') return undefined
		const normalized = name.trim()
		return normalized ? normalized.slice(0, 128) : undefined
	} catch {
		return undefined
	}
}

/**
 * 将路由地址转换为绝对 URL。
 * @param route 路由信息
 * @returns 绝对 URL 或原始路径
 */
function buildRouteUrl(route: MonitorVueRoute): string {
	const path = route.fullPath ?? route.path
	if (typeof window === 'undefined') return path
	try {
		const url = new URL(path, window.location.origin)
		return url.toString()
	} catch {
		return path
	}
}

/**
 * 读取路由标题，优先使用 meta.title，其次读取文档标题。
 * @param route 路由信息
 * @returns 页面标题
 */
function readRouteTitle(route: MonitorVueRoute): string | undefined {
	const metaTitle = route.meta?.title
	if (typeof metaTitle === 'string' && metaTitle.trim()) return metaTitle.trim()
	if (typeof document !== 'undefined' && document.title) return document.title
	return undefined
}

/**
 * 创建 Vue 3 监控插件。
 * @param options 插件配置
 * @returns 可安装的 Vue 插件
 */
export function createMonitorVuePlugin(options: MonitorVuePluginOptions = {}): MonitorVuePlugin {
	const trackPageView = options.trackPageView ?? true
	const installedApps = new WeakSet<App>()
	let installedApp: App | undefined
	let previousErrorHandler: MonitorVueErrorHandler | undefined
	let stopRouterTracking: (() => void) | undefined

	/**
	 * 解析当前客户端，显式传入优先，其次读取浏览器 SDK 单例。
	 * @returns 监控客户端或 null
	 */
	function resolveClient(): MonitorClient | null {
		if (options.client) return options.client
		return getMonitor()
	}

	/**
	 * 记录路由页面浏览；导航失败时不记录。
	 * @param to 目标路由
	 * @param from 来源路由
	 * @param failure 导航失败信息
	 */
	const handleRoute: MonitorVueNavigationHook = (to, from, failure) => {
		if (failure) return
		try {
			const client = resolveClient()
			client?.pageView({
				path: to.path,
				url: buildRouteUrl(to),
				title: readRouteTitle(to),
				referrer: buildRouteUrl(from),
			})
		} catch {
			// 页面浏览失败不得影响路由导航。
		}
	}

	/**
	 * 捕获 Vue 错误并调用宿主原有处理器。
	 * @param error 错误
	 * @param instance 组件实例
	 * @param info Vue 错误位置
	 */
	const errorHandler: MonitorVueErrorHandler = (error, instance, info) => {
		try {
			const client = resolveClient()
			client?.captureException(error, {
				mechanism: 'vue',
				handled: true,
				componentName: readComponentName(instance),
				info,
			})
		} catch {
			// 监控 SDK 失败不得吞掉 Vue 原有错误处理流程。
		}
		previousErrorHandler?.call(installedApp, error, instance, info)
	}

	/**
	 * 安装插件。
	 * @param app Vue 应用
	 */
	function install(app: App): void {
		if (installedApps.has(app)) return
		if (installedApp) uninstall()
		installedApp = app
		installedApps.add(app)
		previousErrorHandler = app.config.errorHandler as MonitorVueErrorHandler | undefined
		app.config.errorHandler = errorHandler
		if (trackPageView && options.router) {
			const stop = options.router.afterEach(handleRoute)
			stopRouterTracking = typeof stop === 'function' ? stop : undefined
		}
	}

	/**
	 * 卸载插件并恢复宿主原有错误处理器。
	 */
	function uninstall(): void {
		if (!installedApp) return
		try {
			stopRouterTracking?.()
		} catch {
			// 第三方路由卸载失败不影响宿主。
		}
		if (installedApp.config.errorHandler === errorHandler) {
			installedApp.config.errorHandler = previousErrorHandler
		}
		installedApps.delete(installedApp)
		installedApp = undefined
		previousErrorHandler = undefined
		stopRouterTracking = undefined
	}

	return { install, uninstall }
}

export type {
	MonitorVueErrorHandler,
	MonitorVueNavigationHook,
	MonitorVuePlugin,
	MonitorVuePluginOptions,
	MonitorVueRoute,
	MonitorVueRouter,
} from './types'
