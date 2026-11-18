import { DataSource, Repository } from 'typeorm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectKey } from '../projects/project-key.entity'
import { Project } from '../projects/project.entity'
import { OtlpService } from './otlp.service'

describe('OtlpService', () => {
	let service: OtlpService
	let saveSpan: ReturnType<typeof vi.fn>

	beforeEach(() => {
		saveSpan = vi.fn()
		const projectRepo = {
			findOne: vi
				.fn()
				.mockResolvedValue({ id: 1, deleted: 0, status: 1 }),
		} as unknown as Repository<Project>
		const keyRepo = {
			findOne: vi
				.fn()
				.mockResolvedValue({
					projectId: 1,
					keyType: 'server',
					status: 1,
				}),
		} as unknown as Repository<ProjectKey>
		const spanWriteRepo = {
			create: vi.fn().mockImplementation((row) => row),
			save: saveSpan,
		}
		const manager = {
			getRepository: vi.fn().mockReturnValue(spanWriteRepo),
			increment: vi.fn(),
		}
		const dataSource = {
			getRepository: vi
				.fn()
				.mockReturnValue({ find: vi.fn().mockResolvedValue([]) }),
			transaction: vi.fn(async (callback) => callback(manager)),
		} as unknown as DataSource
		service = new OtlpService(dataSource, projectRepo, keyRepo)
	})

	it('accepts valid spans and reports invalid spans without aborting the batch', async () => {
		const result = await service.ingest('mk_server_test', {
			resourceSpans: [
				{
					resource: {
						attributes: [
							{
								key: 'service.name',
								value: { stringValue: 'api' },
							},
							{
								key: 'deployment.environment',
								value: { stringValue: 'demo' },
							},
						],
					},
					scopeSpans: [
						{
							spans: [
								{
									traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
									spanId: 'bbbbbbbbbbbbbbbb',
									name: '',
									startTimeUnixNano: '1000000000',
									endTimeUnixNano: '2000000000',
								},
								{
									traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
									spanId: 'cccccccccccccccc',
									name: 'GET /api/demo',
									startTimeUnixNano: '1000000000',
									endTimeUnixNano: '2000000000',
									attributes: [
										{
											key: 'http.request.method',
											value: { stringValue: 'GET' },
										},
									],
								},
							],
						},
					],
				},
			],
		})

		expect(result).toEqual({
			accepted: 1,
			rejected: 1,
			errors: [{ index: 0, code: 'invalid_span', message: 'name 缺失' }],
		})
		expect(saveSpan).toHaveBeenCalledTimes(1)
		expect(saveSpan.mock.calls[0][0]).toMatchObject({
			traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
			spanId: 'cccccccccccccccc',
			service: 'api',
			operation: 'GET /api/demo',
			spanType: 'http',
			environment: 'demo',
			status: 'ok',
		})
	})
})
