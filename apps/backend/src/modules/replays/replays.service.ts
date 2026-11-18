import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ofPage, type PageResult } from '../../common/dto/page-result.dto'
import { percentage } from '../../common/utils/percentage'
import { resolveTimeRange } from '../../common/utils/time-range'
import { AnalyticsEvent } from '../analytics/analytics-event.entity'
import { ErrorEvent } from '../errors/error-event.entity'
import { ProjectsService } from '../projects/projects.service'
import { QueryReplayDto, ReplaySummaryQueryDto } from './dto/query-replay.dto'
import { ReplaySession } from './replay-session.entity'

/** Replay 列表项。 */
export interface ReplayListItemVO {
	replayId: string
	sessionId: string
	distinctId?: string
	pagePath: string
	environment?: string
	release?: string
	durationMs: number
	sizeBytes: number
	eventCount: number
	errorCount: number
	samplingReason: string
	startedAt: Date
}

/** Replay 汇总。 */
export interface ReplaySummaryVO {
	total: number
	averageDurationMs: number
	coverageRate: number
	errorReplayCount: number
}

/** Replay 事件时间线。 */
export interface ReplayTimelineItemVO {
	type: 'error' | 'event'
	name: string
	occurredAt: Date
	pagePath: string
}

/** Replay 服务。 */
@Injectable()
export class ReplaysService {
	constructor(
		@InjectRepository(ReplaySession)
		private readonly replayRepo: Repository<ReplaySession>,
		@InjectRepository(AnalyticsEvent)
		private readonly analyticsRepo: Repository<AnalyticsEvent>,
		@InjectRepository(ErrorEvent)
		private readonly errorRepo: Repository<ErrorEvent>,
		private readonly projectsService: ProjectsService,
	) {}

	/** Replay 分页列表。 @param query 查询参数 @returns 分页会话 */
	async page(query: QueryReplayDto): Promise<PageResult<ReplayListItemVO>> {
		const project = await this.projectsService.resolveProject(query.projectId)
		const range = resolveTimeRange(query)
		const qb = this.replayRepo
			.createQueryBuilder('replay')
			.where('replay.projectId = :projectId', { projectId: project.id })
			.andWhere('replay.startedAt BETWEEN :from AND :to', { from: range.from, to: range.to })
			.orderBy('replay.startedAt', 'DESC')
			.skip((query.pageNum - 1) * query.pageSize)
			.take(query.pageSize)
		if (query.environment) qb.andWhere('replay.environment = :environment', { environment: query.environment })
		if (query.pagePath) qb.andWhere('replay.pagePath = :pagePath', { pagePath: query.pagePath })
		if (query.errorOnly === 'true') qb.andWhere('replay.errorCount > 0')
		if (query.errorOnly === 'false') qb.andWhere('replay.errorCount = 0')
		if (query.minDurationMs !== undefined) qb.andWhere('replay.durationMs >= :minDurationMs', { minDurationMs: query.minDurationMs })
		if (query.maxDurationMs !== undefined) qb.andWhere('replay.durationMs <= :maxDurationMs', { maxDurationMs: query.maxDurationMs })
		if (query.keyword) {
			qb.andWhere('(replay.replayId LIKE :keyword OR replay.distinctId LIKE :keyword OR replay.pagePath LIKE :keyword)', {
				keyword: `%${query.keyword}%`,
			})
		}
		const [rows, total] = await qb.getManyAndCount()
		return ofPage(query.pageNum, query.pageSize, total, rows.map((row) => ({ ...row })))
	}

	/** Replay 汇总。 @param query 查询参数 @returns 汇总 */
	async summary(query: ReplaySummaryQueryDto): Promise<ReplaySummaryVO> {
		const project = await this.projectsService.resolveProject(query.projectId)
		const range = resolveTimeRange(query)
		const replays = await this.replayRepo.find({
			where: { projectId: project.id },
		})
		const filtered = replays.filter(
			(row) => new Date(row.startedAt).getTime() >= range.from.getTime() && new Date(row.startedAt).getTime() <= range.to.getTime(),
		)
		const sessionRows = await this.analyticsRepo
			.createQueryBuilder('event')
			.select('event.sessionId', 'sessionId')
			.where('event.projectId = :projectId', { projectId: project.id })
			.andWhere('event.occurredAt BETWEEN :from AND :to', { from: range.from, to: range.to })
			.andWhere('event.sessionId IS NOT NULL')
			.groupBy('event.sessionId')
			.getRawMany()
		const averageDuration = filtered.length
			? filtered.reduce((sum, row) => sum + Number(row.durationMs), 0) / filtered.length
			: 0
		return {
			total: filtered.length,
			averageDurationMs: Number(averageDuration.toFixed(0)),
			coverageRate: percentage(filtered.length, sessionRows.length),
			errorReplayCount: filtered.filter((row) => row.errorCount > 0).length,
		}
	}

	/** Replay 详情与关联时间线。 @param replayId Replay ID @returns 会话与时间线 */
	async detail(replayId: string): Promise<{
		replay: ReplayListItemVO
		timeline: ReplayTimelineItemVO[]
	}> {
		const replay = await this.replayRepo.findOne({ where: { replayId } })
		if (!replay) throw new NotFoundException('Replay 不存在')
		const startedAt = new Date(replay.startedAt)
		const endedAt = new Date(startedAt.getTime() + replay.durationMs)
		const [errors, events] = await Promise.all([
			this.errorRepo.find({
				where: { replayId },
			}),
			this.analyticsRepo
				.createQueryBuilder('event')
				.where('event.projectId = :projectId', { projectId: replay.projectId })
				.andWhere('event.sessionId = :sessionId', { sessionId: replay.sessionId })
				.andWhere('event.occurredAt BETWEEN :from AND :to', { from: startedAt, to: endedAt })
				.orderBy('event.occurredAt', 'ASC')
				.limit(200)
				.getMany(),
		])
		return {
			replay: { ...replay },
			timeline: [
				...errors.map((error) => ({
					type: 'error' as const,
					name: error.message,
					occurredAt: error.occurredAt,
					pagePath: error.pagePath ?? replay.pagePath,
				})),
				...events.map((event) => ({
					type: 'event' as const,
					name: event.eventName,
					occurredAt: event.occurredAt,
					pagePath: event.pagePath,
				})),
			].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()),
		}
	}

	/** Replay 筛选元数据。 @param projectId 项目 ID @returns 环境、页面 */
	async filters(projectId?: number): Promise<{ environments: string[]; pages: string[] }> {
		const project = await this.projectsService.resolveProject(projectId)
		const rows = await this.replayRepo.find({
			where: { projectId: project.id },
			select: ['environment', 'pagePath'],
		})
		return {
			environments: [...new Set(rows.map((row) => row.environment).filter(Boolean))] as string[],
			pages: [...new Set(rows.map((row) => row.pagePath).filter(Boolean))],
		}
	}
}
