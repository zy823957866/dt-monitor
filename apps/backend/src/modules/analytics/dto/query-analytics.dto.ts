import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

/** 埋点基础查询。 */
export class AnalyticsQueryDto {
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

	@ApiPropertyOptional({ description: '页面' })
	@IsOptional()
	@IsString()
	pagePath?: string
}

/** 埋点聚合事件分页查询。 */
export class QueryAnalyticsEventsDto extends AnalyticsQueryDto {
	@ApiPropertyOptional({ description: '事件类型' })
	@IsOptional()
	@IsIn(['view', 'click', 'custom', 'page_view'])
	eventType?: string

	@ApiPropertyOptional({ description: '事件名关键词' })
	@IsOptional()
	@IsString()
	keyword?: string

	@ApiPropertyOptional({ description: '页码', default: 1 })
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	pageNum = 1

	@ApiPropertyOptional({ description: '每页大小', default: 20 })
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	pageSize = 20
}

/** 原始事件分页查询。 */
export class QueryEventExploreDto extends PageQueryDto {
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

	@ApiPropertyOptional({ description: '事件名' })
	@IsOptional()
	@IsString()
	eventName?: string

	@ApiPropertyOptional({ description: '用户 ID' })
	@IsOptional()
	@IsString()
	distinctId?: string

	@ApiPropertyOptional({ description: '页面' })
	@IsOptional()
	@IsString()
	pagePath?: string
}
