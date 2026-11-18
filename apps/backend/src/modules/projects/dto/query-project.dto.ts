import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

/** 项目分页查询参数。 */
export class QueryProjectDto extends PageQueryDto {
	@ApiPropertyOptional({ description: '项目名称或 appId' })
	@IsOptional()
	@IsString()
	keyword?: string

	@ApiPropertyOptional({ description: '状态' })
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(2)
	status?: number
}
