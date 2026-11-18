import { initMonitor } from '@dt-monitor/sdk-browser'
import { getReplay, replayPlugin } from '@dt-monitor/sdk-replay'
import { getTracing, tracingPlugin } from '@dt-monitor/sdk-tracing'
import type { MonitorClient } from '@dt-monitor/sdk-core'

const dsn = import.meta.env.VITE_MONITOR_DSN

/** 当前 Demo 的监控客户端；未配置 DSN 时为空。 */
export const monitor: MonitorClient | null = dsn
	? initMonitor({
			dsn,
			app: { name: 'demo-vue', version: '0.1.0' },
			environment: 'demo',
			release: 'demo-0.1.0',
			plugins: [
				tracingPlugin({ tracesSampleRate: 1, service: 'demo-vue' }),
				replayPlugin({
					sessionSampleRate: 1,
					errorSampleRate: 1,
					chunkIntervalMs: 1_000,
					chunkMaxBytes: 128 * 1_024,
				}),
			],
		})
	: null

/** 立即发送普通事件与 Replay 分片。 */
export async function flushAll(): Promise<void> {
	const replay = monitor ? getReplay(monitor) : undefined
	await Promise.all([monitor?.flush(), replay?.flush()])
}

/** @returns 当前 Trace 句柄 */
export function tracing() {
	return monitor ? getTracing(monitor) : null
}
