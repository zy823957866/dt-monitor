import { describe, expect, it } from 'vitest'
import { createReplayChunkUrl, DsnError, parseDsn } from './dsn'

describe('parseDsn', () => {
	it('解析 HTTPS DSN 与常见 /api 前缀', () => {
		const parsed = parseDsn('https://pk_demo@monitor.example.com/api/ingest/v1/p_1001')
		expect(parsed.origin).toBe('https://monitor.example.com')
		expect(parsed.projectId).toBe('p_1001')
		expect(parsed.publicKey).toBe('pk_demo')
		expect(parsed.apiBase).toBe('/api')
		expect(parsed.ingestUrl).toBe(
			'https://monitor.example.com/api/ingest/v1/p_1001?key=pk_demo',
		)
		expect(parsed.replayBaseUrl).toBe('https://monitor.example.com/api/replay/v1/p_1001')
	})

	it('保留端口并覆盖已有 key 参数', () => {
		const parsed = parseDsn('http://pk_local@localhost:3001/api/ingest/v1/7?key=old&env=dev')
		expect(parsed.origin).toBe('http://localhost:3001')
		expect(parsed.host).toBe('localhost:3001')
		expect(parsed.ingestUrl).toBe('http://localhost:3001/api/ingest/v1/7?key=pk_local&env=dev')
	})

	it('URL 编码项目 ID', () => {
		const parsed = parseDsn('https://pk@example.com/ingest/v1/demo%20app')
		expect(parsed.projectId).toBe('demo app')
		expect(parsed.apiBase).toBe('')
	})

	it('拒绝缺少 key、非法路径和非 HTTP 协议', () => {
		expect(() => parseDsn('https://monitor.example.com/api/ingest/v1/1')).toThrow(DsnError)
		expect(() => parseDsn('https://pk@example.com/api/ingest/v1/')).toThrow(DsnError)
		expect(() => parseDsn('ftp://pk@example.com/ingest/v1/1')).toThrow(DsnError)
		expect(() => parseDsn('not a url')).toThrow(DsnError)
	})
})

describe('createReplayChunkUrl', () => {
	it('构造带幂等查询参数的 Replay 分片地址', () => {
		const parsed = parseDsn('https://pk@example.com/api/ingest/v1/42')
		const url = createReplayChunkUrl(parsed, 'replay-1', 3, 'session-1', 'abc123')
		expect(url).toBe(
			'https://example.com/api/replay/v1/42/replay-1/chunks/3?key=pk&sessionId=session-1&checksum=abc123',
		)
	})
})
