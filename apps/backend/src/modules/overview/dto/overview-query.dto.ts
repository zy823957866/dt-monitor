import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Min } from 'class-validator'

/** 概览查询。 */
export class OverviewQueryDto {
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
