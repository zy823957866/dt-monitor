import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { gzipSync } from 'node:zlib'
import { INestApplication } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'
import { ProjectKey } from '../src/modules/projects/project-key.entity'
import { Project } from '../src/modules/projects/project.entity'
import { ReplayChunk } from '../src/modules/ingest/replay-chunk.entity'
import { ReplaySession } from '../src/modules/replays/replay-session.entity'
import { TraceSpan } from '../src/modules/tracing/trace-span.entity'

/** @param data gzip 字节 @returns FNV-1a 校验和 */
function checksum(data: Buffer): string {
	let hash = 0x811c9dc5
	for (const byte of data) {
		hash ^= byte
		hash = Math.imul(hash, 0x01000193) >>> 0
	}
	return hash.toString(16).padStart(8, '0')
}

describe('public ingest data plane', () => {
	let app: INestApplication
	let projectRepo: Repository<Project>
	let keyRepo: Repository<ProjectKey>
	let spanRepo: Repository<TraceSpan>
	let replayChunkRepo: Repository<ReplayChunk>
	let replaySessionRepo: Repository<ReplaySession>
	let browserKey: string
	let serverKey: string
	let originalCorsOrigins: string | undefined

	beforeAll(async () => {
		originalCorsOrigins = process.env.CORS_ORIGINS
		process.env.CORS_ORIGINS = 'http://localhost:5181'
		process.env.REPLAY_STORAGE_DIR = join(
			tmpdir(),
			`dt-monitor-replay-${Date.now()}`,
		)
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile()
		app = moduleFixture.createNestApplication()
		configureApp(app)
		await app.init()
		projectRepo = app.get(getRepositoryToken(Project))
		keyRepo = app.get(getRepositoryToken(ProjectKey))
		spanRepo = app.get(getRepositoryToken(TraceSpan))
		replayChunkRepo = app.get(getRepositoryToken(ReplayChunk))
		replaySessionRepo = app.get(getRepositoryToken(ReplaySession))
		browserKey = 'mk_browser_test_key'
		serverKey = 'mk_server_test_key'
		const project = await projectRepo.save(
			projectRepo.create({
				name: 'Demo',
				appId: 'demo',
				platform: 'web',
				status: 1,
				deleted: 0,
				settings: {},
			}),
		)
		await keyRepo.save([
			keyRepo.create({
				projectId: project.id,
				keyType: 'browser',
				keyValue: browserKey,
				status: 1,
			}),
			keyRepo.create({
				projectId: project.id,
				keyType: 'server',
				keyValue: serverKey,
				status: 1,
			}),
		])
	})

	afterAll(async () => {
		if (originalCorsOrigins === undefined) delete process.env.CORS_ORIGINS
		else process.env.CORS_ORIGINS = originalCorsOrigins
		await app?.close()
	})

	it('allows the demo origin to send Replay preflight requests', async () => {
		await request(app.getHttpServer())
			.options('/api/replay/v1/1/replay-1/chunks/0')
			.set('Origin', 'http://localhost:5181')
			.set('Access-Control-Request-Method', 'POST')
			.set('Access-Control-Request-Headers', 'content-type')
			.expect(204)
			.expect('Access-Control-Allow-Origin', 'http://localhost:5181')
			.expect('Access-Control-Allow-Credentials', 'true')
	})

	it('accepts browser event batch and persists linked data', async () => {
		const payload = {
			sdk: { name: 'test', version: '0.1.0' },
			sentAt: new Date().toISOString(),
			events: [
				{
					eventId: 'evt-error-1',
					type: 'error',
					name: 'test error',
					level: 'error',
					timestamp: new Date().toISOString(),
					occurredAt: new Date().toISOString(),
					context: {
						app: { name: 'demo' },
						sdk: { name: 'test', version: '0.1.0' },
						page: { path: '/demo' },
						session: { id: 'session-1' },
						trace: { traceId: 'browsertrace1' },
						user: { anonymousId: 'anon-1' },
					},
					error: {
						message: 'test error',
						type: 'Error',
						mechanism: 'manual',
						handled: true,
					},
				},
				{
					eventId: 'evt-perf-1',
					type: 'performance',
					name: 'FCP',
					level: 'info',
					timestamp: new Date().toISOString(),
					context: {
						app: { name: 'demo' },
						sdk: { name: 'test', version: '0.1.0' },
						page: { path: '/demo' },
					},
					metric: { metricName: 'fcp', value: 120, rating: 'good' },
				},
				{
					eventId: 'evt-span-1',
					type: 'span',
					name: 'GET /api/health',
					level: 'debug',
					timestamp: new Date().toISOString(),
					context: {
						app: { name: 'demo' },
						sdk: { name: 'test', version: '0.1.0' },
						page: { path: '/demo' },
					},
					span: {
						traceId: 'browsertrace1',
						spanId: 'browserspan1',
						service: 'browser',
						operation: 'GET /api/health',
						spanType: 'fetch',
						startTime: new Date().toISOString(),
						durationMs: 12,
						status: 'ok',
						isRoot: false,
					},
				},
			],
		}
		const response = await request(app.getHttpServer())
			.post('/api/ingest/v1/1?key=mk_browser_test_key')
			.set('Content-Type', 'text/plain')
			.send(JSON.stringify(payload))
			.expect(202)
		expect(response.body.data.accepted).toBe(3)
		const retryResponse = await request(app.getHttpServer())
			.post('/api/ingest/v1/1?key=mk_browser_test_key')
			.set('Content-Type', 'text/plain')
			.send(JSON.stringify(payload))
			.expect(202)
		expect(retryResponse.body.data).toMatchObject({
			accepted: 0,
			duplicates: 3,
		})
		const span = await spanRepo.findOne({
			where: { spanId: 'browserspan1' },
		})
		expect(span?.traceId).toBe('browsertrace1')
	})

	it('rejects a server key on the browser ingest endpoint', async () => {
		await request(app.getHttpServer())
			.post('/api/ingest/v1/1?key=mk_server_test_key')
			.send({ events: [] })
			.expect(401)
	})

	it('rejects browser key for OTLP and accepts server key', async () => {
		const body = {
			resourceSpans: [
				{
					resource: {
						attributes: [
							{
								key: 'service.name',
								value: { stringValue: 'api' },
							},
						],
					},
					scopeSpans: [
						{
							spans: [
								{
									traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
									spanId: 'bbbbbbbbbbbbbbbb',
									name: 'GET /api',
									startTimeUnixNano: '1000000000',
									endTimeUnixNano: '2000000000',
								},
							],
						},
					],
				},
			],
		}
		await request(app.getHttpServer())
			.post('/api/otlp/v1/traces')
			.set('x-dt-monitor-key', browserKey)
			.send(body)
			.expect(401)
		const response = await request(app.getHttpServer())
			.post('/api/otlp/v1/traces')
			.set('x-dt-monitor-key', serverKey)
			.send(body)
			.expect(202)
		expect(response.body.data.accepted).toBe(1)
	})

	it('stores gzip replay chunk and creates replay session index', async () => {
		const raw = Buffer.from(
			JSON.stringify([
				{
					type: 4,
					timestamp: 1_000,
					data: { href: 'http://localhost:5181/demo' },
				},
				{ type: 2, timestamp: 2_000, data: {} },
			]),
		)
		const gzip = gzipSync(raw)
		await request(app.getHttpServer())
			.post(
				'/api/replay/v1/1/replay-1/chunks/0?key=mk_browser_test_key&sessionId=session-replay-1&checksum=' +
					checksum(gzip),
			)
			.set('Content-Type', 'application/octet-stream')
			.set('Content-Encoding', 'gzip')
			.send(gzip)
			.expect(204)
		await request(app.getHttpServer())
			.post(
				'/api/replay/v1/1/replay-1/chunks/0?key=mk_browser_test_key&sessionId=session-replay-1&checksum=' +
					checksum(gzip),
			)
			.set('Content-Type', 'application/octet-stream')
			.set('Content-Encoding', 'gzip')
			.send(gzip)
			.expect(204)
		const otherGzip = gzipSync(
			Buffer.from(
				JSON.stringify([{ type: 2, timestamp: 3_000, data: {} }]),
			),
		)
		await request(app.getHttpServer())
			.post(
				'/api/replay/v1/1/replay-1/chunks/0?key=mk_browser_test_key&sessionId=session-replay-1&checksum=' +
					checksum(otherGzip),
			)
			.set('Content-Type', 'application/octet-stream')
			.set('Content-Encoding', 'gzip')
			.send(otherGzip)
			.expect(409)
		const chunk = await replayChunkRepo.findOne({
			where: { replayId: 'replay-1', sequence: 0 },
		})
		const session = await replaySessionRepo.findOne({
			where: { replayId: 'replay-1' },
		})
		expect(chunk?.eventCount).toBe(2)
		expect(session?.sessionId).toBe('session-replay-1')
		expect(session?.pagePath).toBe('/demo')
	})
})
