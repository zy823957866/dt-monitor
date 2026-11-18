import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator'

/** 创建项目参数。 */
export class CreateProjectDto {
	@ApiProperty({ description: '项目名称', example: 'dt-monitor-demo' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(80)
	name!: string

	@ApiProperty({ description: '项目编码', example: 'dt-monitor-demo' })
	@IsString()
	@Matches(/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/, {
		message: '项目编码需为 3-80 位小写字母、数字或连字符',
	})
	appId!: string

	@ApiPropertyOptional({ description: '平台类型', default: 'web' })
	@IsOptional()
	@IsString()
	@MaxLength(30)
	platform?: string

	@ApiPropertyOptional({ description: '描述' })
	@IsOptional()
	@IsString()
	@MaxLength(500)
	description?: string
}
