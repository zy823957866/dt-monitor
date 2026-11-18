import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

/** 错误趋势/列表公共查询。 */
export class ErrorQueryDto {
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

	@ApiPropertyOptional({ description: 'Issue ID（错误详情趋势使用）' })
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	issueId?: number
}

/** 错误 Issue 分页查询。 */
export class QueryIssueDto extends ErrorQueryDto {
	@ApiPropertyOptional({ description: '状态：open / in_progress / resolved / ignored' })
	@IsOptional()
	@IsIn(['open', 'in_progress', 'resolved', 'ignored'])
	status?: string

	@ApiPropertyOptional({ description: '级别：error / warning / info' })
	@IsOptional()
	@IsIn(['error', 'warning', 'info'])
	level?: string

	@ApiPropertyOptional({ description: '消息、指纹或路径关键词' })
	@IsOptional()
	@IsString()
	keyword?: string

	@ApiPropertyOptional({ description: '分页参数继承' })
	@IsOptional()
	pageNum = 1

	@ApiPropertyOptional({ description: '每页大小继承' })
	@IsOptional()
	pageSize = 20
}

/** 错误事件分页查询。 */
export class QueryErrorEventDto extends PageQueryDto {
	@ApiPropertyOptional({ description: '项目 ID' })
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	projectId?: number

	@ApiPropertyOptional({ description: 'Issue ID' })
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	issueId?: number

	@ApiPropertyOptional({ description: '开始时间 ISO' })
	@IsOptional()
	@IsString()
	from?: string

	@ApiPropertyOptional({ description: '结束时间 ISO' })
	@IsOptional()
	@IsString()
	to?: string
}

/** 错误 Issue 状态更新。 */
export class UpdateIssueDto {
	@ApiPropertyOptional({ description: '状态' })
	@IsOptional()
	@IsIn(['open', 'in_progress', 'resolved', 'ignored'])
	status?: string

	@ApiPropertyOptional({ description: '指派用户 ID' })
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	assigneeId?: number
}
