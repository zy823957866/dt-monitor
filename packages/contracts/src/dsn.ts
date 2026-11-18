import { INGEST_PATH_SEGMENT, REPLAY_PATH_SEGMENT } from './constants'
import type { ParsedDsn } from './types'

/** DSN 解析错误码。 */
export type DsnErrorCode = 'invalid-url' | 'invalid-protocol' | 'missing-key' | 'invalid-path'

/** DSN 解析失败时抛出的结构化错误。 */
export class DsnError extends Error {
	/** 错误码。 */
	readonly code: DsnErrorCode

	/**
	 * 创建 DSN 解析错误。
	 * @param code 错误码
	 * @param message 错误说明
	 */
	constructor(code: DsnErrorCode, message: string) {
		super(message)
		this.name = 'DsnError'
		this.code = code
	}
}

/**
 * 解析 dt-monitor DSN，得到上报地址、项目 ID 与公开 key。
 * @param dsn DSN 字符串
 * @returns 结构化 DSN
 * @throws {DsnError} DSN 格式非法时抛出
 */
export function parseDsn(dsn: string): ParsedDsn {
	const raw = dsn.trim()
	let url: URL
	try {
		url = new URL(raw)
	} catch {
		throw new DsnError('invalid-url', 'DSN 不是合法 URL')
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new DsnError('invalid-protocol', 'DSN 仅支持 http/https')
	}
	let publicKey: string
	try {
		publicKey = decodeURIComponent(url.username)
	} catch {
		throw new DsnError('missing-key', 'DSN public key 编码非法')
	}
	if (!publicKey) throw new DsnError('missing-key', 'DSN 缺少 public key')
	const normalizedPath = url.pathname.replace(/\/$/, '')
	const markerIndex = normalizedPath.indexOf(INGEST_PATH_SEGMENT)
	if (markerIndex < 0) throw new DsnError('invalid-path', 'DSN 必须包含 /ingest/v1/ 路径')
	const projectSegment = normalizedPath.slice(markerIndex + INGEST_PATH_SEGMENT.length)
	if (!projectSegment || projectSegment.includes('/')) {
		throw new DsnError('invalid-path', 'DSN 缺少合法的项目 ID')
	}
	let projectId: string
	try {
		projectId = decodeURIComponent(projectSegment)
	} catch {
		throw new DsnError('invalid-path', 'DSN 项目 ID 编码非法')
	}
	const apiBase = normalizedPath.slice(0, markerIndex)
	const ingestUrl = new URL(url.origin + normalizedPath)
	ingestUrl.searchParams.set('key', publicKey)
	url.searchParams.forEach((value, key) => {
		if (key !== 'key') ingestUrl.searchParams.append(key, value)
	})
	ingestUrl.hash = ''
	const replayBaseUrl = `${url.origin}${apiBase}${REPLAY_PATH_SEGMENT}${encodeURIComponent(projectId)}`
	return {
		dsn: raw,
		origin: url.origin,
		host: url.host,
		hostname: url.hostname,
		projectId,
		publicKey,
		ingestUrl: ingestUrl.toString(),
		apiBase,
		replayBaseUrl,
	}
}

/**
 * 构造 Replay 分片上传地址。
 * @param dsn 已解析 DSN
 * @param replayId Replay ID
 * @param sequence 分片序号
 * @param sessionId 会话 ID
 * @param checksum 分片校验和
 * @returns 完整上传 URL
 */
export function createReplayChunkUrl(
	dsn: ParsedDsn,
	replayId: string,
	sequence: number,
	sessionId: string,
	checksum: string,
): string {
	const url = new URL(`${dsn.replayBaseUrl}/${encodeURIComponent(replayId)}/chunks/${sequence}`)
	url.searchParams.set('key', dsn.publicKey)
	url.searchParams.set('sessionId', sessionId)
	url.searchParams.set('checksum', checksum)
	return url.toString()
}
