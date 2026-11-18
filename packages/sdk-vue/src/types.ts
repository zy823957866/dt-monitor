import type { App, ComponentPublicInstance } from 'vue'
import type { MonitorClient } from '@dt-monitor/sdk-core'

/** Vue Router 中适配器需要读取的路由信息。 */
export interface MonitorVueRoute {
	/** 路由路径，不包含查询参数。 */
	path: string
	/** 包含查询参数的完整路径。 */
	fullPath?: string
	/** 路由名称。 */
	name?: unknown
	/** 路由元数据，仅读取 title。 */
	meta?: Record<PropertyKey, unknown>
}

/** Vue Router afterEach 导航钩子。 */
export type MonitorVueNavigationHook = (
	to: MonitorVueRoute,
	from: MonitorVueRoute,
	failure?: unknown,
) => void

/** Vue Router 的最小结构，避免 SDK 包强制依赖 vue-router。 */
export interface MonitorVueRouter {
	afterEach(hook: MonitorVueNavigationHook): (() => void) | void
}

/** Vue 监控插件配置。 */
export interface MonitorVuePluginOptions {
	/** 已初始化的监控客户端；不传时使用 sdk-browser 的当前实例。 */
	client?: MonitorClient
	/** 路由实例；提供且开启 pageview 时自动记录页面浏览。 */
	router?: MonitorVueRouter
	/** 是否自动记录路由 pageview，默认 true。 */
	trackPageView?: boolean
}

/** Vue 错误处理器签名。 */
export type MonitorVueErrorHandler = (
	error: unknown,
	instance: ComponentPublicInstance | null,
	info: string,
) => void

/** 可安装、可卸载的 Vue 监控插件。 */
export interface MonitorVuePlugin {
	install(app: App, ...options: any[]): unknown
	uninstall(): void
}
