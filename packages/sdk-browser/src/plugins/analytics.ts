import { DEFAULT_ANALYTICS_SAMPLE_RATE } from '@dt-monitor/contracts'
import type { MonitorClient, MonitorPlugin } from '@dt-monitor/sdk-core'

/** 埋点插件选项。 */
export interface AnalyticsPluginOptions {
	/** 自动监听 SPA 路由变化并记录 pageView。 */
	autoPageView?: boolean
	/** 是否在启动时记录一次 pageView。 */
	initialPageView?: boolean
	sampleRate?: number
	/** 是否记录点击面包屑，默认 true。 */
	captureClicks?: boolean
}

/**
 * 创建埋点与 SPA 页面浏览插件。
 * @param options 插件选项
 * @returns 监控插件
 */
export function analyticsPlugin(options: AnalyticsPluginOptions = {}): MonitorPlugin {
	const autoPageView = options.autoPageView ?? true
	const initialPageView = options.initialPageView ?? true
	const captureClicks = options.captureClicks ?? true
	const sampleRate = options.sampleRate ?? DEFAULT_ANALYTICS_SAMPLE_RATE
	let client: MonitorClient | undefined
	let started = false
	let originalPushState: typeof history.pushState | undefined
	let originalReplaceState: typeof history.replaceState | undefined
	let wrappedPushState: typeof history.pushState | undefined
	let wrappedReplaceState: typeof history.replaceState | undefined
	let popStateListener: (() => void) | undefined
	let clickListener: ((event: MouseEvent) => void) | undefined

	/**
	 * 记录一次页面浏览。
	 */
	function recordPageView(): void {
		if (!client || client.isDisabled()) return
		client.pageView()
	}

	/**
	 * 点击面包屑处理。
	 * @param event 点击事件
	 */
	function handleClick(event: MouseEvent): void {
		if (!client) return
		const target = event.target as HTMLElement | null
		if (!target) return
		const tag = target.tagName?.toLowerCase() ?? 'unknown'
		const id = target.id ? `#${target.id}` : ''
		const text = (target.textContent ?? '').trim().slice(0, 80)
		client.addBreadcrumb({
			type: 'click',
			message: `${tag}${id}${text ? ` ${text}` : ''}`,
			timestamp: new Date().toISOString(),
		})
	}

	return {
		name: 'analytics',
		setup(instance) {
			client = instance
		},
		start() {
			if (started || !client || typeof window === 'undefined') return
			started = true
			if (autoPageView) {
				originalPushState = window.history.pushState
				originalReplaceState = window.history.replaceState
				wrappedPushState = function (...args) {
					originalPushState?.apply(window.history, args)
					recordPageView()
				} as typeof window.history.pushState
				wrappedReplaceState = function (...args) {
					originalReplaceState?.apply(window.history, args)
					recordPageView()
				} as typeof window.history.replaceState
				window.history.pushState = wrappedPushState
				window.history.replaceState = wrappedReplaceState
				popStateListener = recordPageView
				window.addEventListener('popstate', popStateListener)
				if (initialPageView) recordPageView()
			}
			if (captureClicks) {
				clickListener = handleClick
				window.addEventListener('click', clickListener, true)
			}
		},
		beforeSend(event) {
			if (event.type === 'analytics' || event.type === 'page_view') {
				return event
			}
			return event
		},
		stop() {
			if (!started) return
			started = false
			if (wrappedPushState && window.history.pushState === wrappedPushState) {
				window.history.pushState = originalPushState ?? window.history.pushState
			}
			if (wrappedReplaceState && window.history.replaceState === wrappedReplaceState) {
				window.history.replaceState = originalReplaceState ?? window.history.replaceState
			}
			if (popStateListener) window.removeEventListener('popstate', popStateListener)
			if (clickListener) window.removeEventListener('click', clickListener, true)
			originalPushState = undefined
			originalReplaceState = undefined
			wrappedPushState = undefined
			wrappedReplaceState = undefined
			popStateListener = undefined
			clickListener = undefined
		},
	}
}
