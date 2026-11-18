import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator'

/** 更新项目参数。 */
export class UpdateProjectDto {
	@ApiPropertyOptional({ description: '项目名称' })
	@IsOptional()
	@IsString()
	@MaxLength(80)
	name?: string

	@ApiPropertyOptional({ description: '项目编码' })
	@IsOptional()
	@Matches(/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/, {
		message: '项目编码需为 3-80 位小写字母、数字或连字符',
	})
	appId?: string

	@ApiPropertyOptional({ description: '状态：1 启用，0 暂停，2 归档' })
	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(2)
	status?: number

	@ApiPropertyOptional({ description: '描述' })
	@IsOptional()
	@IsString()
	@MaxLength(500)
	description?: string
}
