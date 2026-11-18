import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Between, In, Repository, type ObjectLiteral, type SelectQueryBuilder } from 'typeorm'
import {
	bucketExpression,
	fillTrend,
	percentile,
	resolveBucketUnit,
	type TrendPoint,
} from '../../common/utils/aggregate'
import { percentage } from '../../common/utils/percentage'
import { resolveTimeRange } from '../../common/utils/time-range'
import { AlertHistory } from '../alerts/alert-history.entity'
import { AlertRule } from '../alerts/alert-rule.entity'
import { AnalyticsEvent } from '../analytics/analytics-event.entity'
import { ErrorEvent } from '../errors/error-event.entity'
import { Issue } from '../errors/issue.entity'
import { PerformanceMetric } from '../performance/performance-metric.entity'
import { ProjectsService } from '../projects/projects.service'
import { ReplaySession } from '../replays/replay-session.entity'
import { TraceSpan } from '../tracing/trace-span.entity'
import { OverviewQueryDto } from './dto/overview-query.dto'

/** 概览指标卡。 */
export interface OverviewMetricVO {
	key: string
	label: string
	value: number
	unit: string
	change: number
}

/** 概览 Web Vitals 卡。 */
export interface OverviewVitalVO {
	metric: string
	value: number
	unit: string
	p75: number
	p95: number
	rating: 'good' | 'needs-improvement' | 'poor'
}

/** 慢 Trace。 */
export interface OverviewSlowTraceVO {
	traceId: string
	operation: string
	service: string
	durationMs: number
}

/** 最近告警。 */
export interface OverviewAlertVO {
	id: number
	name: string
	status: string
	triggeredAt: Date
}

/** 概览聚合服务。 */
@Injectable()
export class OverviewService {
	constructor(
		@InjectRepository(AnalyticsEvent)
		private readonly analyticsRepo: Repository<AnalyticsEvent>,
		@InjectRepository(ErrorEvent)
		private readonly errorRepo: Repository<ErrorEvent>,
		@InjectRepository(Issue)
		private readonly issueRepo: Repository<Issue>,
		@InjectRepository(PerformanceMetric)
		private readonly metricRepo: Repository<PerformanceMetric>,
		@InjectRepository(TraceSpan)
		private readonly spanRepo: Repository<TraceSpan>,
		@InjectRepository(ReplaySession)
		private readonly replayRepo: Repository<ReplaySession>,
		@InjectRepository(AlertHistory)
		private readonly historyRepo: Repository<AlertHistory>,
		@InjectRepository(AlertRule)
		private readonly ruleRepo: Repository<AlertRule>,
		private readonly projectsService: ProjectsService,
	) {}

	/** 概览聚合数据。 @param query 查询参数 @returns 概览 */
	async summary(query: OverviewQueryDto): Promise<{
		project: { id: number; name: string; appId: string; environmentCount: number }
		metrics: OverviewMetricVO[]
		vitals: OverviewVitalVO[]
		errorTrend: TrendPoint[]
		newIssueTrend: TrendPoint[]
		eventTrend: TrendPoint[]
		slowTraces: OverviewSlowTraceVO[]
		recentReplays: Array<{
			replayId: string
			sessionId: string
			pagePath: string
			durationMs: number
			errorCount: number
			startedAt: Date
		}>
		recentAlerts: OverviewAlertVO[]
	}> {
		const project = await this.projectsService.resolveProject(query.projectId)
		const range = resolveTimeRange(query)
		const unit = resolveBucketUnit(range.from, range.to)
		const previousRange = {
			from: new Date(range.from.getTime() - (range.to.getTime() - range.from.getTime())),
			to: range.from,
		}
		const eventBase = this.analyticsRepo
			.createQueryBuilder('event')
			.where('event.projectId = :projectId', { projectId: project.id })
			.andWhere('event.occurredAt BETWEEN :from AND :to', { from: range.from, to: range.to })
		if (query.environment) eventBase.andWhere('event.environment = :environment', { environment: query.environment })
		if (query.release) eventBase.andWhere('event.release = :release', { release: query.release })
		const eventTotal = await eventBase.clone().getCount()
		const errorBase = this.errorRepo
			.createQueryBuilder('event')
			.where('event.projectId = :projectId', { projectId: project.id })
			.andWhere('event.occurredAt BETWEEN :from AND :to', { from: range.from, to: range.to })
		if (query.environment) errorBase.andWhere('event.environment = :environment', { environment: query.environment })
		if (query.release) errorBase.andWhere('event.release = :release', { release: query.release })
		const errorCount = await errorBase.clone().getCount()
		const issueBase = this.issueRepo
			.createQueryBuilder('issue')
			.where('issue.projectId = :projectId', { projectId: project.id })
			.andWhere('issue.firstSeen BETWEEN :from AND :to', { from: range.from, to: range.to })
		if (query.environment) issueBase.andWhere('issue.environment = :environment', { environment: query.environment })
		if (query.release) issueBase.andWhere('issue.release = :release', { release: query.release })
		const uniqueUsers = Number(
			(
				await eventBase
					.clone()
					.select('COUNT(DISTINCT event.distinctId)', 'value')
					.getRawOne<{ value: string }>()
			)?.value ?? 0,
		)
		const previousEventsQuery = this.analyticsRepo
			.createQueryBuilder('event')
			.where('event.projectId = :projectId', { projectId: project.id })
			.andWhere('event.occurredAt BETWEEN :from AND :to', {
				from: previousRange.from,
				to: previousRange.to,
			})
		if (query.environment) previousEventsQuery.andWhere('event.environment = :environment', { environment: query.environment })
		if (query.release) previousEventsQuery.andWhere('event.release = :release', { release: query.release })
		const previousEvents = await previousEventsQuery.getCount()
		const previousErrorsQuery = this.errorRepo
			.createQueryBuilder('event')
			.where('event.projectId = :projectId', { projectId: project.id })
			.andWhere('event.occurredAt BETWEEN :from AND :to', {
				from: previousRange.from,
				to: previousRange.to,
			})
		if (query.environment) previousErrorsQuery.andWhere('event.environment = :environment', { environment: query.environment })
		if (query.release) previousErrorsQuery.andWhere('event.release = :release', { release: query.release })
		const previousErrors = await previousErrorsQuery.getCount()
		const previousUsersQuery = this.analyticsRepo
			.createQueryBuilder('event')
			.select('COUNT(DISTINCT event.distinctId)', 'value')
			.where('event.projectId = :projectId', { projectId: project.id })
			.andWhere('event.occurredAt BETWEEN :from AND :to', {
				from: previousRange.from,
				to: previousRange.to,
			})
		if (query.environment) previousUsersQuery.andWhere('event.environment = :environment', { environment: query.environment })
		if (query.release) previousUsersQuery.andWhere('event.release = :release', { release: query.release })
		const previousUsers = Number((await previousUsersQuery.getRawOne<{ value: string }>())?.value ?? 0)
		const [errorTrend, newIssueTrend, eventTrend] = await Promise.all([
			this.aggregateTrend(errorBase, 'event.occurredAt', range.from, range.to, unit),
			this.aggregateTrend(issueBase, 'issue.firstSeen', range.from, range.to, unit),
			this.aggregateTrend(eventBase, 'event.occurredAt', range.from, range.to, unit),
		])
		const vitals = await this.vitals(project.id, range.from, range.to, query)
		const traceWhere: Record<string, unknown> = {
			projectId: project.id,
			isRoot: 1,
			startTime: Between(range.from, range.to),
		}
		if (query.environment) traceWhere.environment = query.environment
		if (query.release) traceWhere.release = query.release
		const slowTraces = await this.spanRepo.find({
			where: traceWhere,
			order: { durationMs: 'DESC' },
			take: 5,
		})
		const replayWhere: Record<string, unknown> = {
			projectId: project.id,
			startedAt: Between(range.from, range.to),
		}
		if (query.environment) replayWhere.environment = query.environment
		if (query.release) replayWhere.release = query.release
		const recentReplays = await this.replayRepo.find({
			where: replayWhere,
			order: { startedAt: 'DESC' },
			take: 4,
		})
		const histories = await this.historyRepo.find({
			where: { projectId: project.id, triggeredAt: Between(range.from, range.to) },
			order: { triggeredAt: 'DESC' },
			take: 4,
		})
		const rules = histories.length
			? await this.ruleRepo.find({ where: { id: In(histories.map((history) => history.ruleId)) } })
			: []
		const ruleMap = new Map(rules.map((rule) => [rule.id, rule.name]))
		return {
			project: {
				id: project.id,
				name: project.name,
				appId: project.appId,
				environmentCount: project.environmentCount,
			},
			metrics: [
				{ key: 'events', label: '事件总量', value: eventTotal, unit: '', change: percentage(eventTotal - previousEvents, Math.max(previousEvents, 1)) },
				{ key: 'errors', label: '错误数', value: errorCount, unit: '', change: percentage(errorCount - previousErrors, Math.max(previousErrors, 1)) },
				{ key: 'errorRate', label: '错误率', value: percentage(errorCount, eventTotal), unit: '%', change: 0 },
				{ key: 'users', label: '活跃用户', value: uniqueUsers, unit: '', change: percentage(uniqueUsers - previousUsers, Math.max(previousUsers, 1)) },
			],
			vitals,
			errorTrend,
			newIssueTrend,
			eventTrend,
			slowTraces: slowTraces.map((span) => ({
				traceId: span.traceId,
				operation: span.operation,
				service: span.service,
				durationMs: Number(span.durationMs),
			})),
			recentReplays: recentReplays.map((replay) => ({
				replayId: replay.replayId,
				sessionId: replay.sessionId,
				pagePath: replay.pagePath,
				durationMs: replay.durationMs,
				errorCount: replay.errorCount,
				startedAt: replay.startedAt,
			})),
			recentAlerts: histories.map((history) => ({
				id: history.id,
				name: ruleMap.get(history.ruleId) ?? '告警规则',
				status: history.status,
				triggeredAt: history.triggeredAt,
			})),
		}
	}

	private async aggregateTrend<T extends ObjectLiteral>(
		qb: SelectQueryBuilder<T>,
		column: string,
		from: Date,
		to: Date,
		unit: 'hour' | 'day',
	): Promise<TrendPoint[]> {
		const bucket = bucketExpression(this.analyticsRepo.manager.connection, column, unit)
		const rows = await qb
			.clone()
			.select(bucket, 'bucket')
			.addSelect('COUNT(*)', 'value')
			.groupBy(bucket)
			.orderBy(bucket, 'ASC')
			.getRawMany()
		return fillTrend(from, to, unit, rows)
	}

	private async vitals(
		projectId: number,
		from: Date,
		to: Date,
		query: OverviewQueryDto,
	): Promise<OverviewVitalVO[]> {
		const qb = this.metricRepo
			.createQueryBuilder('metric')
			.select(['metric.metricName', 'metric.value'])
			.where('metric.projectId = :projectId', { projectId })
			.andWhere('metric.recordedAt BETWEEN :from AND :to', { from, to })
		if (query.environment) qb.andWhere('metric.environment = :environment', { environment: query.environment })
		if (query.release) qb.andWhere('metric.release = :release', { release: query.release })
		const rows = await qb.getMany()
		const grouped = new Map<string, number[]>()
		for (const row of rows) {
			if (row.metricName === 'LONG_TASK') continue
			const values = grouped.get(row.metricName) ?? []
			values.push(Number(row.value))
			grouped.set(row.metricName, values)
		}
		return ['LCP', 'FCP', 'CLS', 'INP', 'TTFB']
			.filter((metric) => grouped.has(metric))
			.map((metric) => {
				const values = grouped.get(metric) ?? []
				const p75 = percentile(values, 75)
				const rating = this.rating(metric, p75)
				return {
					metric,
					value: percentile(values, 50),
					unit: metric === 'CLS' ? '' : 'ms',
					p75,
					p95: percentile(values, 95),
					rating,
				}
			})
	}

	private rating(metric: string, value: number): 'good' | 'needs-improvement' | 'poor' {
		const thresholds: Record<string, [number, number]> = {
			LCP: [2500, 4000],
			FCP: [1800, 3000],
			CLS: [0.1, 0.25],
			INP: [200, 500],
			TTFB: [800, 1800],
		}
		const [good, poor] = thresholds[metric] ?? [0, 0]
		if (value <= good) return 'good'
		return value <= poor ? 'needs-improvement' : 'poor'
	}
}
