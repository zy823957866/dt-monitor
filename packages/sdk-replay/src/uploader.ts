import { createReplayChunkUrl } from '@dt-monitor/contracts'
import type { ParsedDsn } from '@dt-monitor/contracts'
import type { ReplayChunkUploader, ReplayChunkUploadResult } from './types'

/** 默认 Replay 上传器选项。 */
export interface ReplayUploaderOptions {
	dsn: ParsedDsn
	fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
	keepalive?: boolean
}

/**
 * 创建 gzip 分片上传器。
 * @param options 上传器选项
 * @returns 分片上传器
 */
export function createReplayChunkUploader(options: ReplayUploaderOptions): ReplayChunkUploader {
	const fetchImpl = options.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined)
	return async (request): Promise<ReplayChunkUploadResult> => {
		if (!fetchImpl) return { success: false, retryable: true, reason: 'fetch unavailable' }
		const url = createReplayChunkUrl(
			options.dsn,
			request.meta.replayId,
			request.meta.sequence,
			request.meta.sessionId,
			request.meta.checksum,
		)
		let response: Response
		try {
			response = await fetchImpl(url, {
				method: 'POST',
				headers: {
					'content-type': 'application/octet-stream',
					'content-encoding': 'gzip',
				},
				body: new Blob([request.data as unknown as BlobPart], {
					type: 'application/octet-stream',
				}),
				credentials: 'omit',
				keepalive: options.keepalive ?? false,
			})
		} catch (error) {
			return {
				success: false,
				retryable: true,
				reason: error instanceof Error ? error.message : 'network error',
			}
		}
		if (response.status >= 200 && response.status < 300) return { success: true }
		return {
			success: false,
			status: response.status,
			retryable: response.status === 429 || response.status >= 500,
			reason: `http ${response.status}`,
		}
	}
}
