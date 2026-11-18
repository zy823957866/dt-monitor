import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsNumber, IsString, Min } from 'class-validator'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

/** Trace 列表查询。 */
export class QueryTraceDto extends PageQueryDto {
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

	@ApiPropertyOptional({ description: '状态：ok / error' })
	@IsOptional()
	@IsIn(['ok', 'error'])
	status?: string

	@ApiPropertyOptional({ description: '服务' })
	@IsOptional()
	@IsString()
	service?: string

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

	@ApiPropertyOptional({ description: 'Trace ID 或请求路径' })
	@IsOptional()
	@IsString()
	keyword?: string

	@ApiPropertyOptional({ description: '最小耗时毫秒' })
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	@Min(0)
	minDurationMs?: number
}

/** Trace 汇总查询。 */
export class TraceSummaryQueryDto {
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
}
