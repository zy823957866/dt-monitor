import type { IngestPayload, ParsedDsn, SendResult } from '@dt-monitor/contracts'
import type { MonitorTransport, TransportSendOptions } from '@dt-monitor/sdk-core'

/** 浏览器传输适配器选项。 */
export interface BrowserTransportOptions {
	dsn: ParsedDsn
	fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
	beaconImpl?: (url: string, data: BodyInit) => boolean
	keepalive?: boolean
}

/**
 * 创建浏览器批量传输器，优先使用 CORS 简单请求。
 * @param options 传输器选项
 * @returns 传输适配器
 */
export function createBrowserTransport(options: BrowserTransportOptions): MonitorTransport {
	const fetchImpl = options.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined)
	const beaconImpl =
		options.beaconImpl ??
		(typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function'
			? (url: string, data: BodyInit) => navigator.sendBeacon(url, data)
			: undefined)

	/**
	 * 尽力通过 sendBeacon 发送。
	 * @param body 请求体
	 * @param count 事件数
	 * @returns 发送结果
	 */
	function sendBeacon(body: string, count: number): SendResult {
		if (!beaconImpl) {
			return { success: false, retryable: true, reason: 'sendBeacon unavailable' }
		}
		try {
			const data =
				typeof Blob === 'function'
					? new Blob([body], { type: 'text/plain;charset=UTF-8' })
					: body
			attachBodyLength(data, body.length)
			const queued = beaconImpl(options.dsn.ingestUrl, data)
			return queued
				? { success: true, accepted: count }
				: { success: false, retryable: false, reason: 'beacon rejected' }
		} catch (error) {
			return {
				success: false,
				retryable: true,
				reason: error instanceof Error ? error.message : 'beacon failed',
			}
		}
	}

	/**
	 * 通过 fetch 发送。
	 * @param body 请求体
	 * @param count 事件数
	 * @param keepalive 是否允许页面卸载后继续
	 * @returns 发送结果
	 */
	async function sendFetch(body: string, count: number, keepalive: boolean): Promise<SendResult> {
		if (!fetchImpl) return { success: false, retryable: true, reason: 'fetch unavailable' }
		let response: Response
		try {
			response = await fetchImpl(options.dsn.ingestUrl, {
				method: 'POST',
				headers: { 'content-type': 'text/plain;charset=UTF-8' },
				body,
				credentials: 'omit',
				keepalive,
			})
		} catch (error) {
			return {
				success: false,
				retryable: true,
				reason: error instanceof Error ? error.message : 'network error',
			}
		}
		const status = response.status
		if (status >= 200 && status < 300) {
			return { success: true, accepted: count, status }
		}
		if (status === 413) {
			return { success: false, status, retryable: false, reason: 'payload too large' }
		}
		return {
			success: false,
			status,
			retryable: status === 429 || status >= 500,
			reason: `http ${status}`,
		}
	}

	return {
		async send(payload: IngestPayload, sendOptions?: TransportSendOptions): Promise<SendResult> {
			const body = JSON.stringify(payload)
			if (sendOptions?.useBeacon) {
				const beaconResult = sendBeacon(body, payload.events.length)
				if (beaconResult.success || (!beaconResult.retryable && fetchImpl === undefined)) {
					return beaconResult
				}
				return sendFetch(body, payload.events.length, true)
			}
			return sendFetch(body, payload.events.length, options.keepalive ?? false)
		},
	}
}

/**
 * 为 Blob 附加原文字节数，便于测试和诊断读取。
 * @param data 请求体
 * @param length 原文字节数
 */
function attachBodyLength(data: BodyInit, length: number): void {
	if (typeof data === 'object' && data !== null) {
		Object.defineProperty(data, '__dtMonitorBytes', { value: length, enumerable: false })
	}
}
