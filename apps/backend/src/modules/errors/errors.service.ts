import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { bucketExpression, fillTrend, resolveBucketUnit } from '../../common/utils/aggregate'
import { ofPage, type PageResult } from '../../common/dto/page-result.dto'
import { resolveTimeRange } from '../../common/utils/time-range'
import { ProjectsService } from '../projects/projects.service'
import { ReplaySession } from '../replays/replay-session.entity'
import { TraceSpan } from '../tracing/trace-span.entity'
import { ErrorEvent } from './error-event.entity'
import { Issue } from './issue.entity'
import {
	ErrorQueryDto,
	QueryErrorEventDto,
	QueryIssueDto,
	UpdateIssueDto,
} from './dto/query-errors.dto'

/** 错误 Issue 视图。 */
export interface IssueVO {
	id: number
	message: string
	type: string
	level: string
	status: string
	eventCount: number
	userCount: number
	firstSeen: Date
	lastSeen: Date
	pagePath?: string
	release?: string
	environment?: string
	culprit?: string
	traceId?: string
	replayId?: string
	fingerprint: string
}

/** 错误事件视图。 */
export interface ErrorEventVO {
	id: string
	eventId: string
	message: string
	stack?: string
	traceId?: string
	replayId?: string
	pagePath?: string
	environment?: string
	release?: string
	context?: Record<string, unknown>
	occurredAt: Date
}

/** 错误监控服务。 */
@Injectable()
export class ErrorsService {
	constructor(
		@InjectRepository(Issue) private readonly issueRepo: Repository<Issue>,
		@InjectRepository(ErrorEvent) private readonly eventRepo: Repository<ErrorEvent>,
		@InjectRepository(TraceSpan) private readonly spanRepo: Repository<TraceSpan>,
		@InjectRepository(ReplaySession) private readonly replayRepo: Repository<ReplaySession>,
		private readonly projectsService: ProjectsService,
	) {}

	/** 错误趋势。 @param query 查询参数 @returns 错误与新 Issue 趋势 */
	async trend(query: ErrorQueryDto): Promise<{
		unit: 'hour' | 'day'
		errors: Array<{ label: string; value: number }>
		newIssues: Array<{ label: string; value: number }>
	}> {
		const project = await this.projectsService.resolveProject(query.projectId)
		const range = resolveTimeRange(query)
		const unit = resolveBucketUnit(range.from, range.to)
		const eventBucket = bucketExpression(this.eventRepo.manager.connection, 'event.occurredAt', unit)
		const issueBucket = bucketExpression(this.issueRepo.manager.connection, 'issue.firstSeen', unit)
		const eventQuery = this.eventRepo
			.createQueryBuilder('event')
			.select(eventBucket, 'bucket')
			.addSelect('COUNT(*)', 'value')
			.where('event.projectId = :projectId', { projectId: project.id })
			.andWhere('event.occurredAt BETWEEN :from AND :to', {
				from: range.from,
				to: range.to,
			})
			.groupBy(eventBucket)
			.orderBy(eventBucket, 'ASC')
		this.applyEventFilters(eventQuery, query)
		if (query.issueId) eventQuery.andWhere('event.issueId = :issueId', { issueId: query.issueId })
		const issueQuery = this.issueRepo
			.createQueryBuilder('issue')
			.select(issueBucket, 'bucket')
			.addSelect('COUNT(*)', 'value')
			.where('issue.projectId = :projectId', { projectId: project.id })
			.andWhere('issue.firstSeen BETWEEN :from AND :to', {
				from: range.from,
				to: range.to,
			})
			.groupBy(issueBucket)
			.orderBy(issueBucket, 'ASC')
		if (query.environment) issueQuery.andWhere('issue.environment = :environment', { environment: query.environment })
		if (query.release) issueQuery.andWhere('issue.release = :release', { release: query.release })
		if (query.pagePath) issueQuery.andWhere('issue.pagePath = :pagePath', { pagePath: query.pagePath })
		if (query.issueId) issueQuery.andWhere('issue.id = :issueId', { issueId: query.issueId })
		const [eventRows, issueRows] = await Promise.all([eventQuery.getRawMany(), issueQuery.getRawMany()])
		return {
			unit,
			errors: fillTrend(range.from, range.to, unit, eventRows),
			newIssues: fillTrend(range.from, range.to, unit, issueRows),
		}
	}

	/** 分页查询 Issue。 @param query 查询参数 @returns 分页 Issue */
	async page(query: QueryIssueDto): Promise<PageResult<IssueVO>> {
		const project = await this.projectsService.resolveProject(query.projectId)
		const qb = this.issueRepo
			.createQueryBuilder('issue')
			.where('issue.projectId = :projectId', { projectId: project.id })
			.orderBy('issue.lastSeen', 'DESC')
			.skip((query.pageNum - 1) * query.pageSize)
			.take(query.pageSize)
		if (query.status) qb.andWhere('issue.status = :status', { status: query.status })
		if (query.level) qb.andWhere('issue.level = :level', { level: query.level })
		if (query.environment) qb.andWhere('issue.environment = :environment', { environment: query.environment })
		if (query.release) qb.andWhere('issue.release = :release', { release: query.release })
		if (query.pagePath) qb.andWhere('issue.pagePath = :pagePath', { pagePath: query.pagePath })
		if (query.keyword) {
			qb.andWhere('(issue.message LIKE :keyword OR issue.fingerprint LIKE :keyword OR issue.culprit LIKE :keyword)', {
				keyword: `%${query.keyword}%`,
			})
		}
		const [rows, total] = await qb.getManyAndCount()
		return ofPage(query.pageNum, query.pageSize, total, rows.map((row) => this.toIssueVO(row)))
	}

	/** Issue 详情。 @param id Issue ID @returns Issue、样本、关联 Trace 与 Replay */
	async findOne(id: number): Promise<{
		issue: IssueVO
		sample?: ErrorEventVO
		traces: Array<{
			traceId: string
			operation: string
			service: string
			status: string
			durationMs: number
			spanCount: number
			startTime: Date
		}>
		replay?: {
			replayId: string
			sessionId: string
			pagePath: string
			durationMs: number
			errorCount: number
			startedAt: Date
		}
	}> {
		const issue = await this.issueRepo.findOne({ where: { id } })
		if (!issue) throw new NotFoundException('Issue 不存在')
		const sample = await this.eventRepo.findOne({ where: { issueId: id }, order: { occurredAt: 'DESC' } })
		const traceRows = await this.eventRepo
			.createQueryBuilder('event')
			.select('event.traceId', 'traceId')
			.where('event.issueId = :issueId', { issueId: id })
			.andWhere('event.traceId IS NOT NULL')
			.groupBy('event.traceId')
			.limit(5)
			.getRawMany<{ traceId: string }>()
		const traceIds = traceRows.map((row) => row.traceId)
		if (issue.traceId && !traceIds.includes(issue.traceId)) traceIds.unshift(issue.traceId)
		const roots = traceIds.length
			? await this.spanRepo.find({ where: { traceId: In(traceIds), isRoot: 1 } })
			: []
		const counts = traceIds.length
			? await this.spanRepo
				.createQueryBuilder('span')
				.select('span.traceId', 'traceId')
				.addSelect('COUNT(*)', 'spanCount')
				.where('span.traceId IN (:...traceIds)', { traceIds })
				.groupBy('span.traceId')
				.getRawMany<{ traceId: string; spanCount: string }>()
			: []
		const rootMap = new Map(roots.map((root) => [root.traceId, root]))
		const countMap = new Map(counts.map((row) => [row.traceId, Number(row.spanCount)]))
		const traces = traceIds
			.map((traceId) => {
				const root = rootMap.get(traceId)
				if (!root) return undefined
				return {
					traceId,
					operation: root.operation,
					service: root.service,
					status: root.status,
					durationMs: Number(root.durationMs),
					spanCount: countMap.get(traceId) ?? 1,
					startTime: root.startTime,
				}
			})
			.filter((item): item is NonNullable<typeof item> => Boolean(item))
		const replayId = issue.replayId ?? sample?.replayId
		const replay = replayId ? await this.replayRepo.findOne({ where: { replayId } }) : null
		return {
			issue: this.toIssueVO(issue),
			sample: sample ? this.toEventVO(sample) : undefined,
			traces,
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

	/** 更新 Issue 状态或指派。 @param id Issue ID @param dto 更新参数 @returns Issue */
	async update(id: number, dto: UpdateIssueDto): Promise<IssueVO> {
		const issue = await this.issueRepo.findOne({ where: { id } })
		if (!issue) throw new NotFoundException('Issue 不存在')
		if (dto.status) issue.status = dto.status
		if (dto.assigneeId !== undefined) issue.assigneeId = dto.assigneeId
		await this.issueRepo.save(issue)
		return this.toIssueVO(issue)
	}

	/** 分页查询错误样本。 @param query 查询参数 @returns 样本分页 */
	async events(query: QueryErrorEventDto): Promise<PageResult<ErrorEventVO>> {
		const project = await this.projectsService.resolveProject(query.projectId)
		const range = resolveTimeRange({ from: query.from, to: query.to })
		const qb = this.eventRepo
			.createQueryBuilder('event')
			.where('event.projectId = :projectId', { projectId: project.id })
			.andWhere('event.occurredAt BETWEEN :from AND :to', { from: range.from, to: range.to })
			.orderBy('event.occurredAt', 'DESC')
			.skip((query.pageNum - 1) * query.pageSize)
			.take(query.pageSize)
		if (query.issueId) qb.andWhere('event.issueId = :issueId', { issueId: query.issueId })
		const [rows, total] = await qb.getManyAndCount()
		return ofPage(query.pageNum, query.pageSize, total, rows.map((row) => this.toEventVO(row)))
	}

	/** 筛选元数据。 @param projectId 项目 ID @returns 环境、版本、页面 */
	async filters(projectId?: number): Promise<{
		environments: string[]
		releases: string[]
		pages: string[]
	}> {
		const project = await this.projectsService.resolveProject(projectId)
		const [environments, releases, pages] = await Promise.all([
			this.issueRepo.createQueryBuilder('issue').select('issue.environment', 'value').where('issue.projectId = :projectId', { projectId: project.id }).andWhere('issue.environment IS NOT NULL').groupBy('issue.environment').getRawMany(),
			this.issueRepo.createQueryBuilder('issue').select('issue.release', 'value').where('issue.projectId = :projectId', { projectId: project.id }).andWhere('issue.release IS NOT NULL').groupBy('issue.release').getRawMany(),
			this.issueRepo.createQueryBuilder('issue').select('issue.pagePath', 'value').where('issue.projectId = :projectId', { projectId: project.id }).andWhere('issue.pagePath IS NOT NULL').groupBy('issue.pagePath').getRawMany(),
		])
		return {
			environments: environments.map((item) => String(item.value)),
			releases: releases.map((item) => String(item.value)),
			pages: pages.map((item) => String(item.value)),
		}
	}

	private applyEventFilters(
		qb: ReturnType<Repository<ErrorEvent>['createQueryBuilder']>,
		query: ErrorQueryDto,
	): void {
		if (query.environment) qb.andWhere('event.environment = :environment', { environment: query.environment })
		if (query.release) qb.andWhere('event.release = :release', { release: query.release })
		if (query.pagePath) qb.andWhere('event.pagePath = :pagePath', { pagePath: query.pagePath })
	}

	private toIssueVO(issue: Issue): IssueVO {
		return {
			id: issue.id,
			message: issue.message,
			type: issue.type,
			level: issue.level,
			status: issue.status,
			eventCount: issue.eventCount,
			userCount: issue.userCount,
			firstSeen: issue.firstSeen,
			lastSeen: issue.lastSeen,
			pagePath: issue.pagePath,
			release: issue.release,
			environment: issue.environment,
			culprit: issue.culprit,
			traceId: issue.traceId,
			replayId: issue.replayId,
			fingerprint: issue.fingerprint,
		}
	}

	private toEventVO(event: ErrorEvent): ErrorEventVO {
		return {
			id: String(event.id),
			eventId: event.eventId,
			message: event.message,
			stack: event.stack,
			traceId: event.traceId,
			replayId: event.replayId,
			pagePath: event.pagePath,
			environment: event.environment,
			release: event.release,
			context: event.context,
			occurredAt: event.occurredAt,
		}
	}
}
