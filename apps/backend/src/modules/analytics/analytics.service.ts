import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
	bucketExpression,
	fillTrend,
	resolveBucketUnit,
	type TrendPoint,
} from '../../common/utils/aggregate'
import { ofPage, type PageResult } from '../../common/dto/page-result.dto'
import { percentage } from '../../common/utils/percentage'
import { resolveTimeRange } from '../../common/utils/time-range'
import { ProjectsService } from '../projects/projects.service'
import { AnalyticsEvent } from './analytics-event.entity'
import {
	AnalyticsQueryDto,
	QueryAnalyticsEventsDto,
	QueryEventExploreDto,
} from './dto/query-analytics.dto'

/** 埋点汇总。 */
export interface AnalyticsSummaryVO {
	eventTotal: number
	uniqueUsers: number
	uniqueSessions: number
	conversionRate: number
}

/** 聚合事件视图。 */
export interface AnalyticsEventVO {
	eventName: string
	eventType: string
	triggerCount: number
	uniqueUsers: number
	frequencyRate: number
}

/** 转化漏斗步骤。 */
export interface FunnelStepVO {
	name: string
	count: number
	rate: number
}

/** 原始事件视图。 */
export interface EventExploreVO {
	id: string
	eventName: string
	eventType: string
	distinctId?: string
	sessionId?: string
	pagePath: string
	environment?: string
	release?: string
	properties?: Record<string, unknown>
	occurredAt: Date
}

/** 埋点分析服务。 */
@Injectable()
export class AnalyticsService {
	constructor(
		@InjectRepository(AnalyticsEvent)
		private readonly eventRepo: Repository<AnalyticsEvent>,
		private readonly projectsService: ProjectsService,
	) {}

	/** 埋点汇总。 @param query 查询参数 @returns 汇总 */
	async summary(query: AnalyticsQueryDto): Promise<AnalyticsSummaryVO> {
		const project = await this.projectsService.resolveProject(query.projectId)
		const range = resolveTimeRange(query)
		const base = this.buildBaseQuery(query, project.id, range.from, range.to)
		const total = await base.clone().getCount()
		const users = await base
			.clone()
			.select('COUNT(DISTINCT event.distinctId)', 'value')
			.getRawOne<{ value: string }>()
		const sessions = await base
			.clone()
			.select('COUNT(DISTINCT event.sessionId)', 'value')
			.getRawOne<{ value: string }>()
		const funnel = await this.funnel({ ...query, projectId: project.id })
		return {
			eventTotal: total,
			uniqueUsers: Number(users?.value ?? 0),
			uniqueSessions: Number(sessions?.value ?? 0),
			conversionRate: funnel[funnel.length - 1]?.rate ?? 0,
		}
	}

	/** 事件趋势。 @param query 查询参数 @returns 趋势点 */
	async trend(query: AnalyticsQueryDto): Promise<{
		unit: 'hour' | 'day'
		points: TrendPoint[]
	}> {
		const project = await this.projectsService.resolveProject(query.projectId)
		const range = resolveTimeRange(query)
		const unit = resolveBucketUnit(range.from, range.to)
		const bucket = bucketExpression(this.eventRepo.manager.connection, 'event.occurredAt', unit)
		const qb = this.buildBaseQuery(query, project.id, range.from, range.to)
			.select(bucket, 'bucket')
			.addSelect('COUNT(*)', 'value')
			.groupBy(bucket)
			.orderBy(bucket, 'ASC')
		return { unit, points: fillTrend(range.from, range.to, unit, await qb.getRawMany()) }
	}

	/** 聚合事件分页。 @param query 查询参数 @returns 事件分页 */
	async events(query: QueryAnalyticsEventsDto): Promise<PageResult<AnalyticsEventVO>> {
		const project = await this.projectsService.resolveProject(query.projectId)
		const range = resolveTimeRange(query)
		const totalBase = this.buildBaseQuery(query, project.id, range.from, range.to)
		if (query.eventType) totalBase.andWhere('event.eventType = :eventType', { eventType: query.eventType })
		if (query.keyword) totalBase.andWhere('event.eventName LIKE :keyword', { keyword: `%${query.keyword}%` })
		const groups = await totalBase
			.clone()
			.select('event.eventName', 'eventName')
			.addSelect('event.eventType', 'eventType')
			.addSelect('COUNT(*)', 'triggerCount')
			.addSelect('COUNT(DISTINCT event.distinctId)', 'uniqueUsers')
			.groupBy('event.eventName')
			.addGroupBy('event.eventType')
			.orderBy('triggerCount', 'DESC')
			.offset((query.pageNum - 1) * query.pageSize)
			.limit(query.pageSize)
			.getRawMany<{
				eventName: string
				eventType: string
				triggerCount: string
				uniqueUsers: string
			}>()
		const groupsTotal = await totalBase
			.clone()
			.select('COUNT(DISTINCT event.eventName)', 'value')
			.getRawOne<{ value: string }>()
		const totalEvents = await totalBase.clone().getCount()
		return ofPage(
			query.pageNum,
			query.pageSize,
			Number(groupsTotal?.value ?? 0),
			groups.map((group) => ({
				eventName: group.eventName,
				eventType: group.eventType,
				triggerCount: Number(group.triggerCount),
				uniqueUsers: Number(group.uniqueUsers),
				frequencyRate: percentage(Number(group.triggerCount), totalEvents),
			})),
		)
	}

	/** 固定转化漏斗。 @param query 查询参数 @returns 漏斗步骤 */
	async funnel(query: AnalyticsQueryDto): Promise<FunnelStepVO[]> {
		const project = await this.projectsService.resolveProject(query.projectId)
		const range = resolveTimeRange(query)
		const steps = [
			['访问首页', 'page_view'],
			['查看商品', 'product_click'],
			['加入购物车', 'cart_add'],
			['提交订单', 'order_submit'],
			['支付成功', 'pay_success'],
		] as const
		const counts: number[] = []
		for (const [, eventName] of steps) {
			const count = await this.buildBaseQuery(query, project.id, range.from, range.to)
				.andWhere('event.eventName = :eventName', { eventName })
				.getCount()
			counts.push(count)
		}
		const first = counts[0] ?? 0
		return steps.map(([name], index) => ({
			name,
			count: counts[index] ?? 0,
			rate: percentage(counts[index] ?? 0, first),
		}))
	}

	/** 原始事件探索。 @param query 查询参数 @returns 事件分页 */
	async explore(query: QueryEventExploreDto): Promise<PageResult<EventExploreVO>> {
		const project = await this.projectsService.resolveProject(query.projectId)
		const range = resolveTimeRange(query)
		const qb = this.eventRepo
			.createQueryBuilder('event')
			.where('event.projectId = :projectId', { projectId: project.id })
			.andWhere('event.occurredAt BETWEEN :from AND :to', { from: range.from, to: range.to })
			.orderBy('event.occurredAt', 'DESC')
			.skip((query.pageNum - 1) * query.pageSize)
			.take(query.pageSize)
		if (query.eventName) qb.andWhere('event.eventName = :eventName', { eventName: query.eventName })
		if (query.distinctId) qb.andWhere('event.distinctId = :distinctId', { distinctId: query.distinctId })
		if (query.pagePath) qb.andWhere('event.pagePath = :pagePath', { pagePath: query.pagePath })
		const [rows, total] = await qb.getManyAndCount()
		return ofPage(query.pageNum, query.pageSize, total, rows.map((row) => ({
			id: String(row.id),
			eventName: row.eventName,
			eventType: row.eventType,
			distinctId: row.distinctId,
			sessionId: row.sessionId,
			pagePath: row.pagePath,
			environment: row.environment,
			release: row.release,
			properties: row.properties,
			occurredAt: row.occurredAt,
		})))
	}

	/** 筛选元数据。 @param projectId 项目 ID @returns 事件、页面 */
	async filters(projectId?: number): Promise<{
		events: string[]
		pages: string[]
		environments: string[]
		releases: string[]
	}> {
		const project = await this.projectsService.resolveProject(projectId)
		const rows = await this.eventRepo.find({
			where: { projectId: project.id },
			select: ['eventName', 'pagePath', 'environment', 'release'],
		})
		return {
			events: [...new Set(rows.map((row) => row.eventName).filter(Boolean))],
			pages: [...new Set(rows.map((row) => row.pagePath).filter(Boolean))],
			environments: [...new Set(rows.map((row) => row.environment).filter(Boolean))] as string[],
			releases: [...new Set(rows.map((row) => row.release).filter(Boolean))] as string[],
		}
	}

	private buildBaseQuery(
		query: AnalyticsQueryDto,
		projectId: number,
		from: Date,
		to: Date,
	): ReturnType<Repository<AnalyticsEvent>['createQueryBuilder']> {
		const qb = this.eventRepo
			.createQueryBuilder('event')
			.where('event.projectId = :projectId', { projectId })
			.andWhere('event.occurredAt BETWEEN :from AND :to', { from, to })
		if (query.environment) qb.andWhere('event.environment = :environment', { environment: query.environment })
		if (query.release) qb.andWhere('event.release = :release', { release: query.release })
		if (query.pagePath) qb.andWhere('event.pagePath = :pagePath', { pagePath: query.pagePath })
		return qb
	}
}
