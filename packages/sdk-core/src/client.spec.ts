import { describe, expect, it } from 'vitest'
import type { IngestPayload, SendResult } from '@dt-monitor/contracts'
import { createMonitorClient } from './client'
import type { MonitorClient, MonitorOptions } from './types'
import { createMemoryStorage } from './utils'

/** 固定时钟测试工具。 */
function createTestClock(start = 1_700_000_000_000) {
	let current = start
	return {
		now: () => current,
		advance: (ms: number) => {
			current += ms
		},
	}
}

/** 递增 ID 测试工具。 */
function createTestUuid() {
	let index = 0
	return {
		generate: () => {
			index += 1
			return `id-${index}`
		},
	}
}

/** 记录批次并按回调返回结果的传输工具。 */
function createTestTransport(handler?: (payload: IngestPayload, call: number) => SendResult) {
	const payloads: IngestPayload[] = []
	return {
		payloads,
		transport: {
			async send(payload: IngestPayload): Promise<SendResult> {
				payloads.push(payload)
				return (
					handler?.(payload, payloads.length) ?? {
						success: true,
						accepted: payload.events.length,
					}
				)
			},
		},
	}
}

/** 创建测试客户端。 */
function setup(options: Partial<MonitorOptions> = {}): {
	client: MonitorClient
	payloads: IngestPayload[]
	clock: ReturnType<typeof createTestClock>
} {
	const clock = createTestClock()
	const recorder = createTestTransport()
	const client = createMonitorClient({
		dsn: 'https://pk@example.com/api/ingest/v1/1',
		app: { name: 'unit-test' },
		clock,
		uuid: createTestUuid(),
		storage: createMemoryStorage(),
		sessionStorage: createMemoryStorage(),
		transport: recorder.transport,
		flushIntervalMs: 0,
		batchSize: 50,
		retryDelay: async () => undefined,
		...options,
	})
	return { client, payloads: recorder.payloads, clock }
}

describe('createMonitorClient', () => {
	it('按插件 beforeSend、全局 beforeSend、采样顺序处理事件', async () => {
		const order: string[] = []
		const { client, payloads } = setup({
			plugins: [
				{
					name: 'test-plugin',
					setup: (instance) => {
						instance.setTag('plugin', 'ready')
					},
					beforeSend: (event) => {
						order.push('plugin')
						return { ...event, name: 'plugin_applied' }
					},
				},
			],
			beforeSend: async (event) => {
				order.push('global')
				return event
			},
			sampleRate: 0,
		})
		client.captureMessage('sampled-out')
		await client.flush()
		expect(order).toEqual(['plugin', 'global'])
		expect(payloads).toHaveLength(0)
		expect(client.getContext().tags?.plugin).toBe('ready')
	})

	it('丢弃被全局 beforeSend 过滤的事件', async () => {
		const { client, payloads } = setup({
			beforeSend: () => null,
		})
		client.captureMessage('filtered')
		await client.flush()
		expect(payloads).toHaveLength(0)
		expect(client.getDiagnostics().internalErrors).toBe(0)
	})

	it('503 按指数退避重试后成功', async () => {
		const clock = createTestClock()
		const recorder = createTestTransport((payload, call) =>
			call <= 2
				? { success: false, status: 503, retryable: true, reason: 'unavailable' }
				: { success: true, accepted: payload.events.length },
		)
		const client = createMonitorClient({
			dsn: 'https://pk@example.com/api/ingest/v1/1',
			app: { name: 'retry-test' },
			clock,
			uuid: createTestUuid(),
			storage: createMemoryStorage(),
			sessionStorage: createMemoryStorage(),
			transport: recorder.transport,
			flushIntervalMs: 0,
			maxRetries: 2,
			retryDelay: async () => undefined,
			random: () => 0,
		})
		client.captureMessage('retry me')
		await client.flush()
		expect(recorder.payloads).toHaveLength(3)
		expect(client.getDiagnostics().retries).toBe(2)
		expect(client.getDiagnostics().sent).toBe(1)
	})

	it('4xx 不重试并计入丢弃', async () => {
		const recorder = createTestTransport(() => ({
			success: false,
			status: 400,
			retryable: false,
			reason: 'bad request',
		}))
		const { client } = setup({ transport: recorder.transport })
		client.captureMessage('bad')
		await client.flush()
		expect(recorder.payloads).toHaveLength(1)
		expect(client.getDiagnostics().failed).toBe(1)
		expect(client.getDiagnostics().dropped).toBe(1)
	})

	it('413 将批次拆小后重试', async () => {
		const recorder = createTestTransport((payload) =>
			payload.events.length > 1
				? { success: false, status: 413, retryable: false, reason: 'too large' }
				: { success: true, accepted: 1 },
		)
		const { client } = setup({
			transport: recorder.transport,
			batchSize: 2,
			maxRetries: 0,
		})
		client.captureMessage('one')
		client.captureMessage('two')
		await client.flush()
		expect(recorder.payloads).toHaveLength(3)
		expect(client.getDiagnostics().sent).toBe(2)
	})

	it('队列超限时丢弃最旧事件', async () => {
		const recorder = createTestTransport()
		const { client } = setup({
			transport: recorder.transport,
			queueLimit: 2,
			batchSize: 10,
		})
		client.captureMessage('first')
		client.captureMessage('second')
		client.captureMessage('third')
		await client.flush()
		expect(recorder.payloads[0]?.events.map((event) => event.error?.message)).toEqual([
			'second',
			'third',
		])
		expect(client.getDiagnostics().dropped).toBe(1)
	})

	it('disable 后清空队列且不再接收事件', async () => {
		const recorder = createTestTransport()
		const { client } = setup({ transport: recorder.transport })
		client.captureMessage('before disable')
		client.disable()
		await client.flush()
		expect(recorder.payloads).toHaveLength(0)
		expect(client.captureMessage('after disable')).toBeNull()
		expect(client.isDisabled()).toBe(true)
	})

	it('会话在无活动超时后轮换', async () => {
		const { client, payloads, clock } = setup({
			sessionTimeoutMs: 5_000,
			sessionMaxDurationMs: 60_000,
		})
		client.captureMessage('one')
		await client.flush()
		const firstSession = payloads[0]?.events[0]?.context.session?.id
		clock.advance(2_000)
		client.captureMessage('two')
		await client.flush()
		const secondSession = payloads[1]?.events[0]?.context.session?.id
		clock.advance(6_000)
		client.captureMessage('three')
		await client.flush()
		const thirdSession = payloads[2]?.events[0]?.context.session?.id
		expect(firstSession).toBe(secondSession)
		expect(thirdSession).not.toBe(secondSession)
	})

	it('埋点非法名称被拒绝，属性超限带截断标记', async () => {
		const { client, payloads } = setup()
		expect(client.track('Bad Name')).toBe(false)
		const properties = Object.fromEntries(
			Array.from({ length: 60 }, (_, index) => [`key_${index}`, index]),
		)
		expect(client.track('checkout_submit', properties)).toBe(true)
		await client.flush()
		const event = payloads[0]?.events[0]
		expect(event?.properties?.__truncated).toBe(true)
		expect(Object.keys(event?.properties ?? {})).toHaveLength(51)
	})

	it('插件 setup/start/stop 生命周期并隔离异常', async () => {
		const calls: string[] = []
		const { client } = setup({
			plugins: [
				{
					name: 'healthy',
					setup: () => calls.push('setup'),
					start: () => calls.push('start'),
					stop: () => calls.push('stop'),
				},
				{
					name: 'broken',
					setup: () => {
						throw new Error('setup failed')
					},
					start: () => calls.push('broken-start'),
				},
			],
		})
		expect(calls).toEqual(['setup', 'start'])
		expect(client.getDiagnostics().internalErrors).toBe(1)
		client.disable()
		expect(calls).toEqual(['setup', 'start', 'stop'])
	})
})
