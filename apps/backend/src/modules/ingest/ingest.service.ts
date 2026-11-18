import { createHash } from 'node:crypto'
import {
	BadRequestException,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, In, Repository } from 'typeorm'
import { AnalyticsEvent } from '../analytics/analytics-event.entity'
import { ErrorEvent } from '../errors/error-event.entity'
import { Issue } from '../errors/issue.entity'
import { PerformanceMetric } from '../performance/performance-metric.entity'
import { ProjectKey } from '../projects/project-key.entity'
import { Project } from '../projects/project.entity'
import { TraceSpan } from '../tracing/trace-span.entity'
import type {
	BrowserIngestPayload,
	IngestResult,
	MonitorEvent,
} from './ingest.types'

const MAX_EVENTS_PER_BATCH = 50
const MAX_NAME_LENGTH = 64
const MAX_MESSAGE_LENGTH = 1_000
const MAX_STACK_LENGTH = 20_000

/** 浏览器 SDK 公开上报入口的写入服务。 */
@Injectable()
export class IngestService {
	constructor(
		@InjectDataSource() private readonly dataSource: DataSource,
		@InjectRepository(Project)
		private readonly projectRepo: Repository<Project>,
		@InjectRepository(ProjectKey)
		private readonly keyRepo: Repository<ProjectKey>,
	) {}

	/**
	 * 校验 browser key 并写入一批浏览器事件。
	 * @param projectId 项目 ID
	 * @param key DSN public key
	 * @param rawPayload 文本或 JSON 请求体
	 * @returns 接受、拒绝与幂等跳过数量
	 */
	async ingest(
		projectId: number,
		key: string,
		rawPayload: unknown,
	): Promise<IngestResult> {
		const project = await this.authenticate(projectId, key)
		const payload = parsePayload(rawPayload)
		if (!Array.isArray(payload.events) || payload.events.length === 0) {
			throw new BadRequestException('events 必须是非空数组')
		}
		if (payload.events.length > MAX_EVENTS_PER_BATCH) {
			throw new BadRequestException(
				`单批最多上报 ${MAX_EVENTS_PER_BATCH} 条事件`,
			)
		}

		const valid: MonitorEvent[] = []
		const errors: IngestResult['errors'] = []
		payload.events.forEach((event, index) => {
			const message = validateEvent(event)
			if (message) errors.push({ index, code: 'invalid_event', message })
			else valid.push(event)
		})
		if (valid.length === 0)
			return {
				accepted: 0,
				rejected: errors.length,
				duplicates: 0,
				errors,
			}

		const errorRows = await this.dataSource.getRepository(ErrorEvent).find({
			where: {
				projectId: project.id,
				eventId: In(valid.map((event) => event.eventId)),
			},
			select: ['eventId'],
		})
		const performanceRows = await this.dataSource
			.getRepository(PerformanceMetric)
			.find({
				where: {
					projectId: project.id,
					eventId: In(valid.map((event) => event.eventId)),
				},
				select: ['eventId'],
			})
		const analyticsRows = await this.dataSource
			.getRepository(AnalyticsEvent)
			.find({
				where: {
					projectId: project.id,
					eventId: In(valid.map((event) => event.eventId)),
				},
				select: ['eventId'],
			})
		const spanIds = valid.flatMap((event) =>
			event.span ? [event.span.spanId] : [],
		)
		const spanRows = spanIds.length
			? await this.dataSource.getRepository(TraceSpan).find({
					where: { projectId: project.id, spanId: In(spanIds) },
					select: ['spanId'],
				})
			: []
		const seenErrorIds = new Set(errorRows.map((row) => row.eventId))
		const seenPerformanceIds = new Set(
			performanceRows.map((row) => row.eventId),
		)
		const seenAnalyticsIds = new Set(
			analyticsRows.map((row) => row.eventId),
		)
		const seenSpanIds = new Set(spanRows.map((row) => row.spanId))
		const events = valid.filter((event) => {
			if (
				event.type === 'span' &&
				event.span &&
				seenSpanIds.has(event.span.spanId)
			)
				return false
			if (event.type === 'error') return !seenErrorIds.has(event.eventId)
			if (event.type === 'performance')
				return !seenPerformanceIds.has(event.eventId)
			return !seenAnalyticsIds.has(event.eventId)
		})
		const duplicates = valid.length - events.length
		if (events.length === 0)
			return { accepted: 0, rejected: errors.length, duplicates, errors }

		await this.dataSource.transaction(async (manager) => {
			let errorCount = 0
			for (const event of events) {
				const context = event.context ?? {}
				const occurredAt = new Date(event.occurredAt || event.timestamp)
				if (event.type === 'error' && event.error) {
					errorCount += 1
					await this.saveError(manager, project.id, event, occurredAt)
				} else if (event.type === 'performance' && event.metric) {
					await manager.getRepository(PerformanceMetric).save(
						manager.getRepository(PerformanceMetric).create({
							projectId: project.id,
							eventId: event.eventId,
							metricName: event.metric.metricName.slice(0, 20),
							value: event.metric.value,
							rating: event.metric.rating,
							pagePath: context.page?.path?.slice(0, 255) || '/',
							environment: context.environment?.slice(0, 30),
							release: context.release?.slice(0, 50),
							browser: context.browser?.name?.slice(0, 30),
							os: context.os?.name?.slice(0, 30),
							deviceType: context.device?.type?.slice(0, 30),
							recordedAt: occurredAt,
						}),
					)
				} else if (event.type === 'span' && event.span) {
					await this.saveSpan(manager, project.id, event)
				} else {
					await manager.getRepository(AnalyticsEvent).save(
						manager.getRepository(AnalyticsEvent).create({
							projectId: project.id,
							eventId: event.eventId,
							eventName: event.name.slice(0, 64),
							eventType: (event.eventType || event.type).slice(
								0,
								30,
							),
							distinctId:
								context.user?.anonymousId?.slice(0, 64) ??
								context.user?.id?.slice(0, 64),
							sessionId: context.session?.id?.slice(0, 64),
							pagePath: context.page?.path?.slice(0, 255) || '/',
							environment: context.environment?.slice(0, 30),
							release: context.release?.slice(0, 50),
							properties: event.properties ?? {},
							occurredAt,
						}),
					)
				}
			}

			await manager.increment(
				Project,
				{ id: project.id },
				'eventCount',
				events.length,
			)
			if (errorCount > 0)
				await manager.increment(
					Project,
					{ id: project.id },
					'errorCount',
					errorCount,
				)
		})

		return {
			accepted: events.length,
			rejected: errors.length,
			duplicates,
			errors,
		}
	}

	/**
	 * 校验 browser key 与项目状态。
	 * @param projectId 项目 ID
	 * @param key public key
	 * @returns 启用项目
	 */
	async authenticate(projectId: number, key: string): Promise<Project> {
		if (!Number.isInteger(projectId) || projectId <= 0)
			throw new BadRequestException('项目 ID 非法')
		if (!key || key.length > 100)
			throw new UnauthorizedException('上报 key 缺失或非法')
		const project = await this.projectRepo.findOne({
			where: { id: projectId, deleted: 0 },
		})
		if (!project || project.status !== 1)
			throw new UnauthorizedException('项目不可用')
		const keyRow = await this.keyRepo.findOne({
			where: { projectId, keyValue: key, keyType: 'browser', status: 1 },
		})
		if (!keyRow) throw new UnauthorizedException('browser key 无效')
		return project
	}

	/** @param manager 事务管理器 @param projectId 项目 @param event 错误事件 @param occurredAt 发生时间 */
	private async saveError(
		manager: EntityManager,
		projectId: number,
		event: MonitorEvent,
		occurredAt: Date,
	): Promise<void> {
		const error = event.error!
		const context = event.context
		const seed =
			error.fingerprint ||
			[error.type, error.message, error.stack?.split('\n')[1]]
				.filter(Boolean)
				.join('|')
		const fingerprint = `${projectId}:${createHash('sha256').update(seed).digest('hex')}`
		const issueRepo = manager.getRepository(Issue)
		let issue = await issueRepo.findOne({ where: { fingerprint } })
		if (!issue) {
			issue = issueRepo.create({
				projectId,
				fingerprint,
				message: error.message.slice(0, MAX_MESSAGE_LENGTH),
				type: (error.type || 'Error').slice(0, 80),
				level: event.level,
				status: 'open',
				eventCount: 0,
				userCount: 0,
				firstSeen: occurredAt,
				lastSeen: occurredAt,
				pagePath: context?.page?.path?.slice(0, 255),
				release: context?.release?.slice(0, 50),
				environment: context?.environment?.slice(0, 30),
				culprit: error.resourceUrl?.slice(0, 255),
				traceId: context?.trace?.traceId?.slice(0, 64),
				replayId: context?.replay?.replayId?.slice(0, 64),
			})
		}
		issue.eventCount += 1
		issue.lastSeen = occurredAt
		issue.traceId = context?.trace?.traceId ?? issue.traceId
		issue.replayId = context?.replay?.replayId ?? issue.replayId
		await issueRepo.save(issue)
		await manager.getRepository(ErrorEvent).save(
			manager.getRepository(ErrorEvent).create({
				eventId: event.eventId,
				projectId,
				issueId: issue.id,
				message: error.message.slice(0, MAX_MESSAGE_LENGTH),
				stack: error.stack?.slice(0, MAX_STACK_LENGTH),
				traceId: context?.trace?.traceId?.slice(0, 64),
				replayId: context?.replay?.replayId?.slice(0, 64),
				pagePath: context?.page?.path?.slice(0, 255),
				environment: context?.environment?.slice(0, 30),
				release: context?.release?.slice(0, 50),
				context: sanitizeContext(context),
				occurredAt,
			}),
		)
	}

	/** @param manager 事务管理器 @param projectId 项目 @param event Span 事件 */
	private async saveSpan(
		manager: EntityManager,
		projectId: number,
		event: MonitorEvent,
	): Promise<void> {
		const span = event.span!
		const context = event.context
		await manager.getRepository(TraceSpan).save(
			manager.getRepository(TraceSpan).create({
				projectId,
				traceId: span.traceId,
				spanId: span.spanId,
				parentSpanId: span.parentSpanId,
				service: span.service.slice(0, 80),
				operation: span.operation.slice(0, 255),
				spanType: span.spanType.slice(0, 30),
				startTime: new Date(span.startTime),
				durationMs: span.durationMs,
				status: span.status,
				environment: context?.environment?.slice(0, 30),
				release: context?.release?.slice(0, 50),
				sessionId: context?.session?.id?.slice(0, 64),
				pagePath: context?.page?.path?.slice(0, 255),
				isRoot: span.isRoot ? 1 : 0,
				attributes: span.attributes ?? {},
			}),
		)
	}
}

/** @param raw 原始请求体 @returns 标准化批次 */
function parsePayload(raw: unknown): BrowserIngestPayload {
	if (typeof raw === 'string') {
		try {
			return JSON.parse(raw) as BrowserIngestPayload
		} catch {
			throw new BadRequestException('请求体不是合法 JSON')
		}
	}
	if (!raw || typeof raw !== 'object')
		throw new BadRequestException('请求体必须是对象')
	return raw as BrowserIngestPayload
}

/** @param event 未知事件 @returns 错误消息 */
function validateEvent(event: unknown): string | null {
	if (!event || typeof event !== 'object') return '事件必须是对象'
	const item = event as Partial<MonitorEvent>
	if (!item.eventId || typeof item.eventId !== 'string') return 'eventId 缺失'
	if (
		!item.type ||
		!['error', 'performance', 'analytics', 'page_view', 'span'].includes(
			item.type,
		)
	)
		return 'type 非法'
	if (!item.name || item.name.length > MAX_NAME_LENGTH)
		return 'name 缺失或过长'
	if (!item.context || typeof item.context !== 'object') return 'context 缺失'
	if (!item.timestamp || Number.isNaN(Date.parse(item.timestamp)))
		return 'timestamp 非法'
	if (item.type === 'error' && (!item.error || !item.error.message))
		return 'error 负载缺失'
	if (
		item.type === 'performance' &&
		(!item.metric || !Number.isFinite(item.metric.value))
	)
		return 'metric 负载缺失'
	if (
		item.type === 'span' &&
		(!item.span || !item.span.traceId || !item.span.spanId)
	)
		return 'span 负载缺失'
	return null
}

/** @param context 事件上下文 @returns 可持久化上下文 */
function sanitizeContext(
	context: MonitorEvent['context'] | undefined,
): Record<string, unknown> {
	if (!context) return {}
	return {
		app: context.app,
		sdk: context.sdk,
		page: context.page,
		session: context.session,
		user: context.user
			? { anonymousId: context.user.anonymousId, id: context.user.id }
			: undefined,
		browser: context.browser,
		os: context.os,
		device: context.device,
		tags: context.tags,
	}
}
