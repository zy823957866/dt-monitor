import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
	bucketExpression,
	fillTrend,
	percentile,
	resolveBucketUnit,
	type TrendPoint,
} from '../../common/utils/aggregate'
import { resolveTimeRange, type TimeRange } from '../../common/utils/time-range'
import { ProjectsService } from '../projects/projects.service'
import { PerformanceMetric } from './performance-metric.entity'
import {
	PerformanceQueryDto,
	PerformanceTrendQueryDto,
	SlowPageQueryDto,
} from './dto/query-performance.dto'

/** 性能指标摘要。 */
export interface PerformanceMetricVO {
	metric: string
	value: number
	p50: number
	p75: number
	p95: number
	rating: 'good' | 'needs-improvement' | 'poor'
}

/** 慢页面。 */
export interface SlowPageVO {
	pagePath: string
	visits: number
	p75: number
	p95: number
	average: number
}

/** 长任务分组。 */
export interface LongTaskVO {
	pagePath: string
	message: string
	count: number
	maxDuration: number
	totalDuration: number
}

/** 性能监控服务。 */
@Injectable()
export class PerformanceService {
	constructor(
		@InjectRepository(PerformanceMetric)
		private readonly metricRepo: Repository<PerformanceMetric>,
		private readonly projectsService: ProjectsService,
	) {}

	/** 指标汇总。 @param query 查询参数 @returns 指标摘要 */
	async summary(query: PerformanceQueryDto): Promise<PerformanceMetricVO[]> {
		const project = await this.projectsService.resolveProject(query.projectId)
		const range = resolveTimeRange(query)
		const qb = this.metricRepo
			.createQueryBuilder('metric')
			.select(['metric.metricName', 'metric.value'])
			.where('metric.projectId = :projectId', { projectId: project.id })
			.andWhere('metric.recordedAt BETWEEN :from AND :to', { from: range.from, to: range.to })
		this.applyFilters(qb, query)
		const rows = await qb.getMany()
		const byMetric = new Map<string, number[]>()
		for (const row of rows) {
			if (row.metricName === 'LONG_TASK') continue
			const list = byMetric.get(row.metricName) ?? []
			list.push(Number(row.value))
			byMetric.set(row.metricName, list)
		}
		return ['LCP', 'FCP', 'INP', 'CLS', 'TTFB', 'FP']
			.filter((metric) => byMetric.has(metric))
			.map((metric) => {
				const values = byMetric.get(metric) ?? []
				const p75 = percentile(values, 75)
				return {
					metric,
					value: percentile(values, 50),
					p50: percentile(values, 50),
					p75,
					p95: percentile(values, 95),
					rating: this.rating(metric, p75),
				}
			})
	}

	/** 指标趋势。 @param query 指标趋势参数 @returns 趋势点 */
	async timeseries(query: PerformanceTrendQueryDto): Promise<{
		unit: 'hour' | 'day'
		metric: string
		points: TrendPoint[]
	}> {
		const project = await this.projectsService.resolveProject(query.projectId)
		const range = resolveTimeRange(query)
		const unit = resolveBucketUnit(range.from, range.to)
		const bucket = bucketExpression(this.metricRepo.manager.connection, 'metric.recordedAt', unit)
		const qb = this.metricRepo
			.createQueryBuilder('metric')
			.select(bucket, 'bucket')
			.addSelect('AVG(metric.value)', 'value')
			.where('metric.projectId = :projectId', { projectId: project.id })
			.andWhere('metric.metricName = :metric', { metric: query.metric })
			.andWhere('metric.recordedAt BETWEEN :from AND :to', { from: range.from, to: range.to })
			.groupBy(bucket)
			.orderBy(bucket, 'ASC')
		this.applyFilters(qb, query)
		const rows = await qb.getRawMany()
		return { unit, metric: query.metric, points: fillTrend(range.from, range.to, unit, rows) }
	}

	/** 慢页面 Top N。 @param query 查询参数 @returns 页面列表 */
	async pages(query: SlowPageQueryDto): Promise<SlowPageVO[]> {
		const project = await this.projectsService.resolveProject(query.projectId)
		const range = resolveTimeRange(query)
		const metric = query.metric ?? 'LCP'
		const qb = this.metricRepo
			.createQueryBuilder('metric')
			.select(['metric.pagePath', 'metric.value'])
			.where('metric.projectId = :projectId', { projectId: project.id })
			.andWhere('metric.metricName = :metric', { metric })
			.andWhere('metric.recordedAt BETWEEN :from AND :to', { from: range.from, to: range.to })
		this.applyFilters(qb, query)
		const rows = await qb.getMany()
		const grouped = new Map<string, number[]>()
		for (const row of rows) {
			const list = grouped.get(row.pagePath) ?? []
			list.push(Number(row.value))
			grouped.set(row.pagePath, list)
		}
		return [...grouped.entries()]
			.map(([pagePath, values]) => {
				const average = values.reduce((sum, value) => sum + value, 0) / values.length
				return {
					pagePath,
					visits: values.length,
					p75: percentile(values, 75),
					p95: percentile(values, 95),
					average: Number(average.toFixed(2)),
				}
			})
			.sort((a, b) => b.p75 - a.p75)
			.slice(0, query.limit ?? 10)
	}

	/** 长任务分析。 @param query 查询参数 @returns 长任务分组 */
	async longTasks(query: PerformanceQueryDto): Promise<LongTaskVO[]> {
		const project = await this.projectsService.resolveProject(query.projectId)
		const range = resolveTimeRange(query)
		const qb = this.metricRepo
			.createQueryBuilder('metric')
			.where('metric.projectId = :projectId', { projectId: project.id })
			.andWhere('metric.metricName = :metric', { metric: 'LONG_TASK' })
			.andWhere('metric.recordedAt BETWEEN :from AND :to', { from: range.from, to: range.to })
		this.applyFilters(qb, query)
		const rows = await qb.getMany()
		const grouped = new Map<string, LongTaskVO>()
		for (const row of rows) {
			const current = grouped.get(row.pagePath) ?? {
				pagePath: row.pagePath,
				message: row.rating,
				count: 0,
				maxDuration: 0,
				totalDuration: 0,
			}
			current.count += 1
			current.maxDuration = Math.max(current.maxDuration, Number(row.value))
			current.totalDuration += Number(row.value)
			grouped.set(row.pagePath, current)
		}
		return [...grouped.values()].sort((a, b) => b.maxDuration - a.maxDuration).slice(0, 10)
	}

	/** 性能筛选元数据。 @param projectId 项目 ID @returns 环境、版本、页面 */
	async filters(projectId?: number): Promise<{
		environments: string[]
		releases: string[]
		pages: string[]
	}> {
		const project = await this.projectsService.resolveProject(projectId)
		const qb = this.metricRepo.createQueryBuilder('metric').where('metric.projectId = :projectId', {
			projectId: project.id,
		})
		const rows = await qb.select(['metric.environment', 'metric.release', 'metric.pagePath']).getMany()
		return {
			environments: [...new Set(rows.map((row) => row.environment).filter(Boolean))] as string[],
			releases: [...new Set(rows.map((row) => row.release).filter(Boolean))] as string[],
			pages: [...new Set(rows.map((row) => row.pagePath).filter(Boolean))],
		}
	}

	/** 查询原始指标，供概览复用。 @param projectId 项目 ID @param range 时间范围 @param metric 指标 @returns 指标行 */
	async rawValues(projectId: number, range: TimeRange, metric?: string): Promise<PerformanceMetric[]> {
		const qb = this.metricRepo
			.createQueryBuilder('metric')
			.where('metric.projectId = :projectId', { projectId })
			.andWhere('metric.recordedAt BETWEEN :from AND :to', { from: range.from, to: range.to })
		if (metric) qb.andWhere('metric.metricName = :metric', { metric })
		return qb.getMany()
	}

	private applyFilters(
		qb: ReturnType<Repository<PerformanceMetric>['createQueryBuilder']>,
		query: PerformanceQueryDto,
	): void {
		if (query.environment) qb.andWhere('metric.environment = :environment', { environment: query.environment })
		if (query.release) qb.andWhere('metric.release = :release', { release: query.release })
		if (query.pagePath) qb.andWhere('metric.pagePath = :pagePath', { pagePath: query.pagePath })
	}

	private rating(metric: string, value: number): 'good' | 'needs-improvement' | 'poor' {
		const thresholds: Record<string, [number, number]> = {
			LCP: [2500, 4000],
			FCP: [1800, 3000],
			INP: [200, 500],
			CLS: [0.1, 0.25],
			TTFB: [800, 1800],
			FP: [2000, 3000],
		}
		const [good, poor] = thresholds[metric] ?? [0, 0]
		if (value <= good) return 'good'
		return value <= poor ? 'needs-improvement' : 'poor'
	}
}
