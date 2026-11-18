import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsBooleanString, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

/** Replay 列表查询。 */
export class QueryReplayDto extends PageQueryDto {
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

	@ApiPropertyOptional({ description: '页面' })
	@IsOptional()
	@IsString()
	pagePath?: string

	@ApiPropertyOptional({ description: '是否含错误 true/false' })
	@IsOptional()
	@IsBooleanString()
	errorOnly?: string

	@ApiPropertyOptional({ description: 'Replay ID、用户或页面关键词' })
	@IsOptional()
	@IsString()
	keyword?: string

	@ApiPropertyOptional({ description: '最小会话时长毫秒' })
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	@Min(0)
	minDurationMs?: number

	@ApiPropertyOptional({ description: '最大会话时长毫秒' })
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	@Min(0)
	maxDurationMs?: number
}

/** Replay 汇总查询。 */
export class ReplaySummaryQueryDto {
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
}
