import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
	IsIn,
	IsInt,
	IsNumber,
	IsOptional,
	IsString,
	MaxLength,
	Min,
	MinLength,
} from 'class-validator'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

/** 创建告警规则。 */
export class CreateAlertRuleDto {
	@ApiProperty({ description: '项目 ID' })
	@Type(() => Number)
	@IsInt()
	@Min(1)
	projectId!: number

	@ApiProperty({ description: '规则名称' })
	@IsString()
	@MinLength(2)
	@MaxLength(120)
	name!: string

	@ApiProperty({ description: '指标：error_rate / lcp / inp / long_task / availability' })
	@IsString()
	@MaxLength(30)
	metric!: string

	@ApiPropertyOptional({ description: '比较符', default: '>' })
	@IsOptional()
	@IsIn(['>', '>=', '<', '<=', '='])
	comparator?: string

	@ApiProperty({ description: '阈值' })
	@Type(() => Number)
	@IsNumber()
	threshold!: number

	@ApiPropertyOptional({ description: '窗口分钟数', default: 10 })
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	windowMinutes?: number

	@ApiPropertyOptional({ description: '冷却分钟数', default: 30 })
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	cooldownMinutes?: number

	@ApiPropertyOptional({ description: '通知渠道', default: 'webhook' })
	@IsOptional()
	@IsString()
	channel?: string

	@ApiPropertyOptional({ description: '条件描述' })
	@IsOptional()
	@IsString()
	@MaxLength(255)
	conditionSummary?: string
}

/** 更新告警规则。 */
export class UpdateAlertRuleDto {
	@ApiPropertyOptional({ description: '规则名称' })
	@IsOptional()
	@IsString()
	@MaxLength(120)
	name?: string

	@ApiPropertyOptional({ description: '指标' })
	@IsOptional()
	@IsString()
	@MaxLength(30)
	metric?: string

	@ApiPropertyOptional({ description: '比较符' })
	@IsOptional()
	@IsIn(['>', '>=', '<', '<=', '='])
	comparator?: string

	@ApiPropertyOptional({ description: '阈值' })
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	threshold?: number

	@ApiPropertyOptional({ description: '窗口分钟数' })
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	windowMinutes?: number

	@ApiPropertyOptional({ description: '冷却分钟数' })
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	cooldownMinutes?: number

	@ApiPropertyOptional({ description: '通知渠道' })
	@IsOptional()
	@IsString()
	channel?: string

	@ApiPropertyOptional({ description: '状态：active / paused' })
	@IsOptional()
	@IsIn(['active', 'paused'])
	status?: string

	@ApiPropertyOptional({ description: '条件描述' })
	@IsOptional()
	@IsString()
	@MaxLength(255)
	conditionSummary?: string
}

/** 告警规则分页查询。 */
export class QueryAlertRuleDto extends PageQueryDto {
	@ApiPropertyOptional({ description: '项目 ID' })
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	projectId?: number

	@ApiPropertyOptional({ description: '状态' })
	@IsOptional()
	@IsIn(['active', 'paused'])
	status?: string

	@ApiPropertyOptional({ description: '指标' })
	@IsOptional()
	@IsString()
	metric?: string

	@ApiPropertyOptional({ description: '渠道' })
	@IsOptional()
	@IsString()
	channel?: string

	@ApiPropertyOptional({ description: '关键词' })
	@IsOptional()
	@IsString()
	keyword?: string
}

/** 告警历史查询。 */
export class QueryAlertHistoryDto extends PageQueryDto {
	@ApiPropertyOptional({ description: '项目 ID' })
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	projectId?: number

	@ApiPropertyOptional({ description: '规则 ID' })
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	ruleId?: number
}
