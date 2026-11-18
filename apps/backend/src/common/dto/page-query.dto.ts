import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'

/** 分页查询基础参数。 */
export class PageQueryDto {
	@ApiPropertyOptional({ default: 1, description: '页码' })
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@IsOptional()
	pageNum = 1

	@ApiPropertyOptional({ default: 10, description: '每页条数' })
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	@IsOptional()
	pageSize = 10
}
