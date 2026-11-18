import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IngestPayload, MonitorSpanPayload } from '@dt-monitor/contracts'
import { createMonitorClient } from '@dt-monitor/sdk-core'
import type { MonitorClient, MonitorTransport } from '@dt-monitor/sdk-core'
import { tracingPlugin, getTracing } from './index'
import { formatTraceparent, generateSpanId, generateTraceId } from './ids'

/** 记录批次的传输工具。 */
function createRecorder() {
	const payloads: IngestPayload[] = []
	const transport: MonitorTransport = {
		async send(payload) {
			payloads.push(payload)
			return { success: true, accepted: payload.events.length }
		},
	}
	return { payloads, transport }
}

/** 创建带 tracing 插件的客户端。 */
function createClient(
	options: Parameters<typeof tracingPlugin>[0] = {},
): { client: MonitorClient; payloads: IngestPayload[]; tracing: NonNullable<ReturnType<typeof getTracing>> } {
	const recorder = createRecorder()
	const client = createMonitorClient({
		dsn: 'https://pk@example.com/api/ingest/v1/1',
		app: { name: 'trace-test' },
		plugins: [tracingPlugin({ tracesSampleRate: 1, now: () => 1_700_000_000_000, ...options })],
		transport: recorder.transport,
		flushIntervalMs: 0,
		batchSize: 50,
		random: () => 0.5,
	})
	const tracing = getTracing(client)
	if (!tracing) throw new Error('tracing handle missing')
	return { client, payloads: recorder.payloads, tracing }
}

/** 读取 Span 事件。 */
function spanEvents(payloads: IngestPayload[]): MonitorSpanPayload[] {
	return payloads.flatMap((payload) =>
		payload.events.filter((event) => event.type === 'span').map((event) => event.span!),
	)
}

const originalFetch = globalThis.fetch
const originalXhr = globalThis.XMLHttpRequest

afterEach(() => {
	globalThis.fetch = originalFetch
	globalThis.XMLHttpRequest = originalXhr
	vi.restoreAllMocks()
})

describe('W3C helpers', () => {
	it('生成 32/16 位小写十六进制 ID 与 traceparent', () => {
		const traceId = generateTraceId(() => 0.5)
		const spanId = generateSpanId(() => 0.25)
		expect(traceId).toMatch(/^[0-9a-f]{32}$/)
		expect(spanId).toMatch(/^[0-9a-f]{16}$/)
		expect(formatTraceparent(traceId, spanId, true)).toBe(`00-${traceId}-${spanId}-01`)
		expect(formatTraceparent(traceId, spanId, false)).toBe(`00-${traceId}-${spanId}-00`)
	})
})

describe('tracingPlugin fetch instrumentation', () => {
	it('为同源 fetch 创建父子 Span 并注入 traceparent', async () => {
		const requests: RequestInit[] = []
		const mockFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			requests.push(init ?? {})
			return { status: 200 } as Response
		}) as unknown as typeof fetch
		globalThis.fetch = mockFetch
		const { client, payloads, tracing } = createClient()
		const root = tracing.getActiveSpan()
		await fetch('/api/orders?token=secret')
		await client.flush()
		const child = spanEvents(payloads)[0]
		expect(child).toMatchObject({
			spanType: 'fetch',
			status: 'ok',
			parentSpanId: root?.spanId,
		})
		expect(child?.operation).toContain('GET /api/orders')
		expect(child?.attributes?.['http.url']).not.toContain('secret')
		const headers = new Headers(requests[0]?.headers)
		expect(headers.get('traceparent')).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/)
		tracing.endTransaction()
		await client.flush()
		const emitted = spanEvents(payloads)
		expect(emitted).toHaveLength(2)
		expect(emitted[1]).toMatchObject({ isRoot: true, spanType: 'pageload' })
		client.disable()
		expect(globalThis.fetch).toBe(mockFetch)
	})

	it('跨域默认不注入，白名单允许注入', async () => {
		const headersSeen: Array<Headers | undefined> = []
		globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			headersSeen.push(init?.headers ? new Headers(init.headers) : undefined)
			return { status: 204 } as Response
		}) as typeof fetch
		const blocked = createClient()
		await fetch('https://other.example.com/collect')
		expect(headersSeen[0]?.get('traceparent') ?? null).toBeNull()
		blocked.client.disable()

		const allowed = createClient({ allowedTraceOrigins: ['https://api.example.com'] })
		await fetch('https://api.example.com/orders')
		expect(headersSeen[1]?.get('traceparent')).toMatch(/^00-/)
		allowed.client.disable()
	})

	it('withSpan 创建手动 Span 并保持嵌套关系', async () => {
		globalThis.fetch = vi.fn(async () => ({ status: 200 }) as Response) as typeof fetch
		const { client, payloads, tracing } = createClient()
		let manualSpanId = ''
		await tracing.withSpan(
			'checkout.submit',
			{ attributes: { step: 3 } },
			async (span) => {
				manualSpanId = span.spanId
				await fetch('/pay')
			},
		)
		tracing.endTransaction()
		await client.flush()
		const events = spanEvents(payloads)
		const manual = events.find((span) => span.operation === 'checkout.submit')
		const http = events.find((span) => span.spanType === 'fetch')
		expect(manual?.attributes?.step).toBe(3)
		expect(http?.parentSpanId).toBe(manualSpanId)
		client.disable()
	})

	it('超过 maxSpans 后截断并标记根事务', async () => {
		globalThis.fetch = vi.fn(async () => ({ status: 200 }) as Response) as typeof fetch
		const { client, payloads, tracing } = createClient({ maxSpans: 2 })
		await fetch('/one')
		await fetch('/two')
		await fetch('/three')
		tracing.endTransaction()
		await client.flush()
		const events = spanEvents(payloads)
		expect(events).toHaveLength(2)
		expect(events[1]?.isRoot).toBe(true)
		expect(events[1]?.truncated).toBe(true)
		client.disable()
	})
})

describe('tracingPlugin XHR instrumentation', () => {
	it('为 XHR 创建 Span 并注入 traceparent', async () => {
		const headers: Record<string, string> = {}
		class FakeXhr {
			status = 200
			private listeners: Record<string, Array<() => void>> = {}
			open(_method: string, _url: string | URL, _async?: boolean, _user?: string | null, _password?: string | null): void {}
			setRequestHeader(key: string, value: string): void {
				headers[key] = value
			}
			addEventListener(type: string, listener: () => void): void {
				this.listeners[type] = [...(this.listeners[type] ?? []), listener]
			}
			send(_body?: Document | XMLHttpRequestBodyInit | null): void {
				for (const listener of this.listeners.loadend ?? []) listener()
			}
		}
		globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest
		const { client, payloads, tracing } = createClient()
		const xhr = new FakeXhr()
		xhr.open('POST', '/orders')
		xhr.send()
		await client.flush()
		const span = spanEvents(payloads)[0]
		expect(span).toMatchObject({ spanType: 'xhr', status: 'ok' })
		expect(headers.traceparent).toMatch(/^00-/)
		tracing.endTransaction()
		client.disable()
	})
})
