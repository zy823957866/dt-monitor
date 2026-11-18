import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator'

/** 性能指标允许值。 */
export const PERFORMANCE_METRICS = ['FP', 'FCP', 'LCP', 'CLS', 'INP', 'TTFB', 'LONG_TASK'] as const

/** 性能趋势查询。 */
export class PerformanceQueryDto {
	@ApiPropertyOptional({ description: '项目 ID' })
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	projectId?: number

	@ApiPropertyOptional({ description: '开始时间 ISO' })
	@IsOptional()
	@IsString()
	from?: string

	@ApiPropertyOptional({ description: '结束时间 ISO' })
	@IsOptional()
	@IsString()
	to?: string

	@ApiPropertyOptional({ description: '环境' })
	@IsOptional()
	@IsString()
	environment?: string

	@ApiPropertyOptional({ description: '版本' })
	@IsOptional()
	@IsString()
	release?: string

	@ApiPropertyOptional({ description: '页面路径' })
	@IsOptional()
	@IsString()
	pagePath?: string
}

/** 性能趋势指标。 */
export class PerformanceTrendQueryDto extends PerformanceQueryDto {
	@ApiPropertyOptional({ description: '指标', enum: PERFORMANCE_METRICS })
	@IsIn(PERFORMANCE_METRICS)
	metric!: (typeof PERFORMANCE_METRICS)[number]
}

/** 慢页面查询。 */
export class SlowPageQueryDto extends PerformanceQueryDto {
	@ApiPropertyOptional({ description: '指标', default: 'LCP' })
	@IsOptional()
	@IsIn(['FP', 'FCP', 'LCP', 'CLS', 'INP', 'TTFB'])
	metric?: 'FP' | 'FCP' | 'LCP' | 'CLS' | 'INP' | 'TTFB'

	@ApiPropertyOptional({ description: '返回数量', default: 10 })
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	limit?: number
}
