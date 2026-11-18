import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { ofPage, type PageResult } from '../../common/dto/page-result.dto'
import { resolveTimeRange } from '../../common/utils/time-range'
import { ProjectsService } from '../projects/projects.service'
import { ErrorEvent } from '../errors/error-event.entity'
import { Issue } from '../errors/issue.entity'
import { ReplaySession } from '../replays/replay-session.entity'
import { QueryTraceDto, TraceSummaryQueryDto } from './dto/query-trace.dto'
import { TraceSpan } from './trace-span.entity'

/** Trace 列表项。 */
export interface TraceListItemVO {
	traceId: string
	operation: string
	service: string
	status: string
	durationMs: number
	spanCount: number
	startTime: Date
	environment?: string
	release?: string
	pagePath?: string
}

/** Trace 汇总。 */
export interface TraceSummaryVO {
	total: number
	averageDurationMs: number
	errorCount: number
	slowCount: number
}

/** Trace 详情。 */
export interface TraceDetailVO {
	traceId: string
	rootOperation: string
	status: string
	hasError: boolean
	durationMs: number
	spanCount: number
	serviceCount: number
	startTime: Date
	environment?: string
	release?: string
	sessionId?: string
	pagePath?: string
	replayId?: string
	spans: SpanVO[]
	issues: Array<{
		id: number
		message: string
		culprit?: string
		level: string
		status: string
		eventCount: number
		lastSeen: Date
	}>
	replay?: {
		replayId: string
		sessionId: string
		pagePath: string
		durationMs: number
		errorCount: number
		startedAt: Date
	}
}

/** Span 视图。 */
export interface SpanVO {
	spanId: string
	parentSpanId?: string
	service: string
	operation: string
	spanType: string
	startTime: Date
	durationMs: number
	status: string
	isRoot: boolean
	attributes?: Record<string, unknown>
}

/** Trace 查询服务。 */
@Injectable()
export class TracingService {
	constructor(
		@InjectRepository(TraceSpan) private readonly spanRepo: Repository<TraceSpan>,
		@InjectRepository(ErrorEvent) private readonly errorRepo: Repository<ErrorEvent>,
		@InjectRepository(Issue) private readonly issueRepo: Repository<Issue>,
		@InjectRepository(ReplaySession) private readonly replayRepo: Repository<ReplaySession>,
		private readonly projectsService: ProjectsService,
	) {}

	/** Trace 列表。 @param query 查询参数 @returns 分页 Trace */
	async page(query: QueryTraceDto): Promise<PageResult<TraceListItemVO>> {
		const project = await this.projectsService.resolveProject(query.projectId)
		const range = resolveTimeRange(query)
		const qb = this.spanRepo
			.createQueryBuilder('span')
			.where('span.projectId = :projectId', { projectId: project.id })
			.andWhere('span.isRoot = 1')
			.andWhere('span.startTime BETWEEN :from AND :to', { from: range.from, to: range.to })
			.orderBy('span.startTime', 'DESC')
			.skip((query.pageNum - 1) * query.pageSize)
			.take(query.pageSize)
		if (query.status) qb.andWhere('span.status = :status', { status: query.status })
		if (query.service) qb.andWhere('span.service = :service', { service: query.service })
		if (query.environment) qb.andWhere('span.environment = :environment', { environment: query.environment })
		if (query.release) qb.andWhere('span.release = :release', { release: query.release })
		if (query.pagePath) qb.andWhere('span.pagePath = :pagePath', { pagePath: query.pagePath })
		if (query.minDurationMs !== undefined) qb.andWhere('span.durationMs >= :minDurationMs', { minDurationMs: query.minDurationMs })
		if (query.keyword) {
			qb.andWhere('(span.traceId LIKE :keyword OR span.operation LIKE :keyword)', {
				keyword: `%${query.keyword}%`,
			})
		}
		const [roots, total] = await qb.getManyAndCount()
		const traceIds = roots.map((root) => root.traceId)
		const counts = traceIds.length
			? await this.spanRepo
				.createQueryBuilder('span')
				.select('span.traceId', 'traceId')
				.addSelect('COUNT(*)', 'spanCount')
				.where('span.traceId IN (:...traceIds)', { traceIds })
				.groupBy('span.traceId')
				.getRawMany()
			: []
		const countMap = new Map(counts.map((item) => [String(item.traceId), Number(item.spanCount)]))
		return ofPage(
			query.pageNum,
			query.pageSize,
			total,
			roots.map((root) => ({
				traceId: root.traceId,
				operation: root.operation,
				service: root.service,
				status: root.status,
				durationMs: Number(root.durationMs),
				spanCount: countMap.get(root.traceId) ?? 1,
				startTime: root.startTime,
				environment: root.environment,
				release: root.release,
				pagePath: root.pagePath,
			})),
		)
	}

	/** Trace 汇总统计。 @param query 查询参数 @returns 汇总 */
	async summary(query: TraceSummaryQueryDto): Promise<TraceSummaryVO> {
		const project = await this.projectsService.resolveProject(query.projectId)
		const range = resolveTimeRange(query)
		const qb = this.spanRepo
			.createQueryBuilder('span')
			.where('span.projectId = :projectId', { projectId: project.id })
			.andWhere('span.isRoot = 1')
			.andWhere('span.startTime BETWEEN :from AND :to', { from: range.from, to: range.to })
		if (query.environment) qb.andWhere('span.environment = :environment', { environment: query.environment })
		if (query.release) qb.andWhere('span.release = :release', { release: query.release })
		const rows = await qb.select(['span.durationMs', 'span.status']).getMany()
		const totalDuration = rows.reduce((sum, row) => sum + Number(row.durationMs), 0)
		return {
			total: rows.length,
			averageDurationMs: rows.length ? Number((totalDuration / rows.length).toFixed(2)) : 0,
			errorCount: rows.filter((row) => row.status === 'error').length,
			slowCount: rows.filter((row) => Number(row.durationMs) > 1000).length,
		}
	}

	/** Trace 详情。 @param traceId Trace ID @returns Trace 与 Span */
	async detail(traceId: string): Promise<TraceDetailVO> {
		const spans = await this.spanRepo.find({
			where: { traceId },
			order: { startTime: 'ASC' },
		})
		if (!spans.length) throw new NotFoundException('Trace 不存在')
		const root = spans.find((span) => span.isRoot === 1) ?? spans[0]!
		const replayId = this.replayIdFromAttributes(root.attributes)
		const [errorEvents, replay] = await Promise.all([
			this.errorRepo.find({ where: { traceId }, order: { occurredAt: 'DESC' }, take: 5 }),
			replayId ? this.replayRepo.findOne({ where: { replayId } }) : Promise.resolve(null),
		])
		const issueIds = [...new Set(errorEvents.map((event) => event.issueId))]
		const issues = issueIds.length
			? await this.issueRepo.find({ where: { id: In(issueIds) } })
			: []
		return {
			traceId,
			rootOperation: root.operation,
			status: root.status,
			hasError: spans.some((span) => span.status === 'error'),
			durationMs: Number(root.durationMs),
			spanCount: spans.length,
			serviceCount: new Set(spans.map((span) => span.service)).size,
			startTime: root.startTime,
			environment: root.environment,
			release: root.release,
			sessionId: root.sessionId,
			pagePath: root.pagePath,
			replayId,
			spans: spans.map((span) => ({
				spanId: span.spanId,
				parentSpanId: span.parentSpanId,
				service: span.service,
				operation: span.operation,
				spanType: span.spanType,
				startTime: span.startTime,
				durationMs: Number(span.durationMs),
				status: span.status,
				isRoot: span.isRoot === 1,
				attributes: span.attributes,
			})),
			issues: issues.map((issue) => ({
				id: issue.id,
				message: issue.message,
				culprit: issue.culprit,
				level: issue.level,
				status: issue.status,
				eventCount: issue.eventCount,
				lastSeen: issue.lastSeen,
			})),
			replay: replay
				? {
					replayId: replay.replayId,
					sessionId: replay.sessionId,
					pagePath: replay.pagePath,
					durationMs: replay.durationMs,
					errorCount: replay.errorCount,
					startedAt: replay.startedAt,
				}
				: undefined,
		}
	}

	/** Trace 筛选元数据。 @param projectId 项目 ID @returns 服务、环境、版本、页面 */
	async filters(projectId?: number): Promise<{
		services: string[]
		environments: string[]
		releases: string[]
		pages: string[]
	}> {
		const project = await this.projectsService.resolveProject(projectId)
		const rows = await this.spanRepo.find({
			where: { projectId: project.id, isRoot: 1 },
			select: ['service', 'environment', 'release', 'pagePath'],
		})
		return {
		services: [...new Set(rows.map((row) => row.service).filter(Boolean))],
			environments: [...new Set(rows.map((row) => row.environment).filter(Boolean))] as string[],
			releases: [...new Set(rows.map((row) => row.release).filter(Boolean))] as string[],
			pages: [...new Set(rows.map((row) => row.pagePath).filter(Boolean))] as string[],
		}
	}

	private replayIdFromAttributes(attributes?: Record<string, unknown>): string | undefined {
		return attributes && typeof attributes.replayId === 'string' ? attributes.replayId : undefined
	}
}

/** Trace ID 列表批量查询辅助。 @param repo Span 仓库 @param traceIds Trace ID @returns Span 数组 */
export async function findSpansByTraceIds(
	repo: Repository<TraceSpan>,
	traceIds: string[],
): Promise<TraceSpan[]> {
	if (!traceIds.length) return []
	return repo.find({ where: { traceId: In(traceIds) } })
}
