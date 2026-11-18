import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, type ComponentPublicInstance } from 'vue'
import type { MonitorClient } from '@dt-monitor/sdk-core'
import { createMonitorVuePlugin } from './index'
import type { MonitorVueNavigationHook, MonitorVueRouter } from './types'

/** 创建记录调用的监控客户端。 */
function createClientSpy() {
	const captureException = vi.fn(() => 'event-id')
	const pageView = vi.fn()
	const client = { captureException, pageView } as unknown as MonitorClient
	return { client, captureException, pageView }
}

/** 创建可手动触发导航的测试路由。 */
function createRouterSpy() {
	let hooks: MonitorVueNavigationHook[] = []
	const afterEach = vi.fn((hook: MonitorVueNavigationHook) => {
		hooks.push(hook)
		return () => {
			hooks = hooks.filter((item) => item !== hook)
		}
	})
	const router: MonitorVueRouter = { afterEach }
	return {
		router,
		afterEach,
		navigate(
			to: Parameters<MonitorVueNavigationHook>[0],
			from: Parameters<MonitorVueNavigationHook>[1],
			failure?: unknown,
		) {
			for (const hook of hooks) hook(to, from, failure)
		},
		hooks: () => hooks,
	}
}

const originalTitle = document.title

/** 空 Vue 测试宿主。 */
const TestHost = {
	name: 'TestHost',
	setup: () => () => null,
}

/**
 * 创建不挂载的空 Vue 应用。
 * @returns Vue 应用
 */
function createTestApp() {
	return createApp(TestHost)
}

afterEach(() => {
	document.title = originalTitle
	vi.restoreAllMocks()
})

describe('createMonitorVuePlugin', () => {
	it('捕获 Vue 错误、附带组件名并调用原有错误处理器', () => {
		const { client, captureException } = createClientSpy()
		const previous = vi.fn()
		const app = createTestApp()
		app.config.errorHandler = previous
		const plugin = createMonitorVuePlugin({ client })
		app.use(plugin)
		const error = new Error('render failed')
		const instance = {
			$options: { name: 'CheckoutPanel', props: { secret: true } },
		} as unknown as ComponentPublicInstance

		app.config.errorHandler?.(error, instance, 'render function')

		expect(captureException).toHaveBeenCalledWith(error, {
			mechanism: 'vue',
			handled: true,
			componentName: 'CheckoutPanel',
			info: 'render function',
		})
		expect(previous).toHaveBeenCalledWith(error, instance, 'render function')
	})

	it('重复安装不会重复注册错误处理器或路由钩子', () => {
		const { client, captureException, pageView } = createClientSpy()
		const router = createRouterSpy()
		const app = createTestApp()
		const plugin = createMonitorVuePlugin({ client, router: router.router })
		plugin.install(app)
		plugin.install(app)

		app.config.errorHandler?.(new Error('boom'), null, 'test')
		router.navigate({ path: '/orders', fullPath: '/orders' }, { path: '/home' })

		expect(captureException).toHaveBeenCalledTimes(1)
		expect(pageView).toHaveBeenCalledTimes(1)
		expect(router.afterEach).toHaveBeenCalledTimes(1)
	})

	it('按路由记录 pageview，并在导航失败时跳过', () => {
		const { client, pageView } = createClientSpy()
		const router = createRouterSpy()
		const app = createTestApp()
		app.use(createMonitorVuePlugin({ client, router: router.router }))
		document.title = '订单列表'

		router.navigate(
			{ path: '/orders', fullPath: '/orders?page=2', meta: { title: '订单' } },
			{ path: '/home', fullPath: '/home' },
		)
		router.navigate(
			{ path: '/failed', fullPath: '/failed' },
			{ path: '/orders' },
			new Error('cancelled'),
		)

		expect(pageView).toHaveBeenCalledTimes(1)
		expect(pageView).toHaveBeenCalledWith(
			expect.objectContaining({
				path: '/orders',
				title: '订单',
				url: expect.stringContaining('/orders?page=2'),
			}),
		)
	})

	it('关闭 pageview 后不注册路由钩子', () => {
		const { client } = createClientSpy()
		const router = createRouterSpy()
		const app = createTestApp()
		app.use(
			createMonitorVuePlugin({
				client,
				router: router.router,
				trackPageView: false,
			}),
		)

		expect(router.afterEach).not.toHaveBeenCalled()
	})

	it('卸载后恢复错误处理器并注销路由钩子', () => {
		const { client } = createClientSpy()
		const router = createRouterSpy()
		const previous = vi.fn()
		const app = createTestApp()
		app.config.errorHandler = previous
		const plugin = createMonitorVuePlugin({ client, router: router.router })
		app.use(plugin)

		plugin.uninstall()

		expect(app.config.errorHandler).toBe(previous)
		expect(router.hooks()).toHaveLength(0)
	})
})
