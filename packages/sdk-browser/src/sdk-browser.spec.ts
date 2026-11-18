import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IngestPayload } from '@dt-monitor/contracts'
import type { Metric } from 'web-vitals'
import { createMonitorClient } from '@dt-monitor/sdk-core'
import type { MonitorClient, MonitorTransport } from '@dt-monitor/sdk-core'
import {
	createBrowserContextProvider,
	createBrowserTransport,
	getMonitor,
	initMonitor,
	parseBrowser,
	parseDeviceType,
	parseOs,
} from './index'
import { errorsPlugin } from './plugins/errors'
import { performancePlugin } from './plugins/performance'
import { analyticsPlugin } from './plugins/analytics'
import type { WebVitalsAdapter } from './plugins/performance'

/** 记录批次与发送选项的传输工具。 */
function createRecorder(handler?: (payload: IngestPayload, call: number) => unknown) {
	const payloads: IngestPayload[] = []
	const calls: Array<{ useBeacon?: boolean }> = []
	const transport: MonitorTransport = {
		async send(payload, options) {
			payloads.push(payload)
			calls.push({ useBeacon: options?.useBeacon })
			return (
				(handler?.(payload, payloads.length) as Awaited<ReturnType<MonitorTransport['send']>>) ?? {
					success: true,
					accepted: payload.events.length,
				}
			)
		},
	}
	return { payloads, calls, transport }
}

/** 创建带浏览器上下文的测试客户端。 */
function createClient(plugins: Parameters<typeof createMonitorClient>[0]['plugins'] = []) {
	const recorder = createRecorder()
	const client = createMonitorClient({
		dsn: 'https://pk@example.com/api/ingest/v1/1',
		app: { name: 'browser-test' },
		plugins,
		transport: recorder.transport,
		contextProvider: createBrowserContextProvider(),
		flushIntervalMs: 0,
		batchSize: 50,
		retryDelay: async () => undefined,
		random: () => 0,
	})
	return { client, recorder }
}

const originalPerformanceObserver = globalThis.PerformanceObserver

afterEach(() => {
	vi.restoreAllMocks()
	if (originalPerformanceObserver) globalThis.PerformanceObserver = originalPerformanceObserver
})

describe('browser context', () => {
	it('解析 Chrome/Edge/Firefox/Safari、系统与设备', () => {
		expect(parseBrowser('Mozilla/5.0 Edg/120.0')).toMatchObject({ name: 'Edge', version: '120.0' })
		expect(parseBrowser('Mozilla/5.0 Chrome/121.0 Safari/537.36')).toMatchObject({
			name: 'Chrome',
			version: '121.0',
		})
		expect(parseOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toMatchObject({
			name: 'Windows',
		})
		expect(parseDeviceType('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('mobile')
		expect(parseDeviceType('Mozilla/5.0 (iPad; CPU OS 17_0)')).toBe('tablet')
		expect(parseDeviceType('Mozilla/5.0 (X11; Linux x86_64)')).toBe('desktop')
	})
})

describe('browser transport', () => {
	it('使用 text/plain 简单请求并在 202 时成功', async () => {
		const fetchImpl = vi.fn(async () => ({ status: 202 }) as Response)
		const transport = createBrowserTransport({
			dsn: {
				dsn: '',
				origin: 'https://example.com',
				host: 'example.com',
				hostname: 'example.com',
				projectId: '1',
				publicKey: 'pk',
				ingestUrl: 'https://example.com/api/ingest/v1/1?key=pk',
				apiBase: '/api',
				replayBaseUrl: 'https://example.com/api/replay/v1/1',
			},
			fetchImpl,
		})
		const result = await transport.send({
			sdk: { name: 'test', version: '1' },
			sentAt: new Date(0).toISOString(),
			events: [],
		})
		expect(result.success).toBe(true)
		expect(fetchImpl).toHaveBeenCalledWith(
			'https://example.com/api/ingest/v1/1?key=pk',
			expect.objectContaining({
				method: 'POST',
				headers: { 'content-type': 'text/plain;charset=UTF-8' },
				credentials: 'omit',
			}),
		)
	})

	it('将 429/5xx 标记为可重试，413 标记为不可重试', async () => {
		const transport = createBrowserTransport({
			dsn: {
				dsn: '',
				origin: 'https://example.com',
				host: 'example.com',
				hostname: 'example.com',
				projectId: '1',
				publicKey: 'pk',
				ingestUrl: 'https://example.com/ingest',
				apiBase: '',
				replayBaseUrl: 'https://example.com/replay/v1/1',
			},
			fetchImpl: async () => ({ status: 503 }) as Response,
		})
		expect(await transport.send({ sdk: { name: 't', version: '1' }, sentAt: '', events: [] })).toMatchObject(
			{ success: false, status: 503, retryable: true },
		)
		const rejected = createBrowserTransport({
			dsn: {
				dsn: '',
				origin: 'https://example.com',
				host: 'example.com',
				hostname: 'example.com',
				projectId: '1',
				publicKey: 'pk',
				ingestUrl: 'https://example.com/ingest',
				apiBase: '',
				replayBaseUrl: 'https://example.com/replay/v1/1',
				},
			fetchImpl: async () => ({ status: 413 }) as Response,
		})
		expect(await rejected.send({ sdk: { name: 't', version: '1' }, sentAt: '', events: [] })).toMatchObject(
			{ success: false, status: 413, retryable: false },
		)
	})

	it('使用 sendBeacon 并在拒绝时降级 fetch keepalive', async () => {
		const beaconImpl = vi.fn(() => false)
		const fetchImpl = vi.fn(async () => ({ status: 202 }) as Response)
		const transport = createBrowserTransport({
			dsn: {
				dsn: '',
				origin: 'https://example.com',
				host: 'example.com',
				hostname: 'example.com',
				projectId: '1',
				publicKey: 'pk',
				ingestUrl: 'https://example.com/ingest',
				apiBase: '',
				replayBaseUrl: 'https://example.com/replay/v1/1',
			},
			beaconImpl,
			fetchImpl,
		})
		const result = await transport.send(
			{ sdk: { name: 't', version: '1' }, sentAt: '', events: [] },
			{ useBeacon: true },
		)
		expect(beaconImpl).toHaveBeenCalled()
		expect(result.success).toBe(true)
		expect(fetchImpl).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ keepalive: true }),
		)
	})
})

describe('errorsPlugin', () => {
	it('捕获 window error，并与同一 Error 对象的 console.error 去重', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined)
		const { client, recorder } = createClient([errorsPlugin({ dedupeWindowMs: 1_000 })])
		const error = new Error('boom')
		window.dispatchEvent(new ErrorEvent('error', { message: 'boom', error }))
		await client.flush()
		expect(recorder.payloads[0]?.events[0]?.error).toMatchObject({
			mechanism: 'window',
			handled: false,
		})
		console.error(error)
		await client.flush()
		expect(recorder.payloads).toHaveLength(1)
		const breadcrumbs = client.getBreadcrumbs()
		expect(breadcrumbs.some((item) => item.type === 'console')).toBe(true)
		client.disable()
	})

	it('捕获 unhandledrejection 并支持 ignoreErrors', async () => {
		const { client, recorder } = createClient([
			errorsPlugin({ captureConsole: false, ignoreErrors: [/ignore-me/] }),
		])
		const rejection = new Event('unhandledrejection') as PromiseRejectionEvent
		Object.defineProperty(rejection, 'reason', { value: new Error('ignore-me') })
		window.dispatchEvent(rejection)
		window.dispatchEvent(new ErrorEvent('error', { message: 'keep-me' }))
		await client.flush()
		expect(recorder.payloads[0]?.events).toHaveLength(1)
		expect(recorder.payloads[0]?.events[0]?.error?.message).toBe('keep-me')
		client.disable()
	})

	it('stop 后移除监听并恢复 console.error', () => {
		const original = console.error
		const { client } = createClient([errorsPlugin()])
		expect(console.error).not.toBe(original)
		client.disable()
		expect(console.error).toBe(original)
	})
})

describe('performancePlugin', () => {
	it('将 web-vitals 指标写入性能事件', async () => {
		let lcpCallback: ((metric: Metric) => void) | undefined
		const vitals: WebVitalsAdapter = {
			onCLS: () => undefined,
			onFCP: () => undefined,
			onINP: () => undefined,
			onLCP: (callback) => {
				lcpCallback = callback
			},
			onTTFB: () => undefined,
		}
		const { client, recorder } = createClient([performancePlugin({ vitals, sampleRate: 1 })]
		)
		lcpCallback?.({
			name: 'LCP',
			value: 2_500,
			delta: 2_500,
			rating: 'needs-improvement',
			id: 'v1',
			navigationType: 'navigate',
			navigationId: 1,
			entries: [],
		} as Metric)
		await client.flush()
		expect(recorder.payloads[0]?.events[0]?.metric).toMatchObject({
			metricName: 'LCP',
			value: 2_500,
			rating: 'needs-improvement',
			metricId: 'v1',
		})
		client.disable()
	})

	it('通过 PerformanceObserver 采集 FP 与长任务', async () => {
		const instances: Array<{
			init?: PerformanceObserverInit
			callback: PerformanceObserverCallback
		}> = []
		class FakeObserver {
			private readonly item: (typeof instances)[number]
			constructor(callback: PerformanceObserverCallback) {
				this.item = { callback }
				instances.push(this.item)
			}
			observe(init?: PerformanceObserverInit): void {
				this.item.init = init
			}
			disconnect(): void {}
		}
		globalThis.PerformanceObserver = FakeObserver as unknown as typeof PerformanceObserver
		const { client, recorder } = createClient([
			performancePlugin({ webVitals: false, sampleRate: 1 }),
		])
		const paint = instances.find((item) => item.init?.type === 'paint')
		paint?.callback(
			{ getEntries: () => [{ name: 'first-paint', startTime: 800 }] } as PerformanceObserverEntryList,
			FakeObserver as unknown as PerformanceObserver,
		)
		const longTask = instances.find((item) => item.init?.entryTypes?.includes('longtask'))
		longTask?.callback(
			{ getEntries: () => [{ name: 'longtask', duration: 150 }] } as PerformanceObserverEntryList,
			FakeObserver as unknown as PerformanceObserver,
		)
		await client.flush()
		expect(recorder.payloads[0]?.events.map((event) => event.name)).toEqual(['FP', 'longtask'])
		client.disable()
	})
})

describe('analyticsPlugin', () => {
	it('记录初始 pageView，并在 pushState 时更新脱敏路径', async () => {
		const { client, recorder } = createClient([
			analyticsPlugin({ autoPageView: true, initialPageView: true }),
		])
		await client.flush()
		expect(recorder.payloads[0]?.events[0]?.type).toBe('page_view')
		recorder.payloads.length = 0
		window.history.pushState({}, '', '/next?token=secret&tab=1')
		await client.flush()
		const event = recorder.payloads[0]?.events[0]
		expect(event?.type).toBe('page_view')
		expect(event?.context.page?.path).toContain('token=')
		expect(decodeURIComponent(event?.context.page?.path ?? '')).not.toContain('secret')
		client.disable()
	})
})

describe('initMonitor', () => {
	it('相同 DSN 重复初始化返回同一实例，不同 DSN 禁用旧实例', () => {
		const recorder = createRecorder()
		const dsn = 'https://pk@example.com/api/ingest/v1/2'
		const first = initMonitor({ dsn, app: { name: 'init-test' }, plugins: [], transport: recorder.transport })
		const second = initMonitor({ dsn, app: { name: 'init-test' }, plugins: [], transport: recorder.transport })
		expect(second).toBe(first)
		expect(getMonitor()).toBe(first)
		const third = initMonitor({
			dsn: 'https://pk@example.com/api/ingest/v1/3',
			app: { name: 'init-test' },
			plugins: [],
			transport: recorder.transport,
		})
		expect(first.isDisabled()).toBe(true)
		expect(third).not.toBe(first)
		third.disable()
	})

	it('pagehide 时使用 beacon 尽力发送剩余事件', async () => {
		const recorder = createRecorder()
		const client = initMonitor({
			dsn: 'https://pk@example.com/api/ingest/v1/4',
			app: { name: 'pagehide-test' },
			plugins: [],
			transport: recorder.transport,
			flushIntervalMs: 0,
		})
		client.captureMessage('pending')
		window.dispatchEvent(new PageTransitionEvent('pagehide'))
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(recorder.calls[0]?.useBeacon).toBe(true)
		client.disable()
	})
})
