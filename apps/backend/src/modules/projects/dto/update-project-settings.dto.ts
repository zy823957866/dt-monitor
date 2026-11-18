import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsBoolean, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator'

/** 项目采样、留存与隐私设置。 */
export class UpdateProjectSettingsDto {
	@ApiPropertyOptional({ description: '错误采样率 0-1' })
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	@Min(0)
	@Max(1)
	errorSampleRate?: number

	@ApiPropertyOptional({ description: '性能采样率 0-1' })
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	@Min(0)
	@Max(1)
	performanceSampleRate?: number

	@ApiPropertyOptional({ description: '埋点采样率 0-1' })
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	@Min(0)
	@Max(1)
	analyticsSampleRate?: number

	@ApiPropertyOptional({ description: 'Trace 采样率 0-1' })
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	@Min(0)
	@Max(1)
	traceSampleRate?: number

	@ApiPropertyOptional({ description: 'Replay 会话采样率 0-1' })
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	@Min(0)
	@Max(1)
	replaySessionSampleRate?: number

	@ApiPropertyOptional({ description: 'Replay 错误会话采样率 0-1' })
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	@Min(0)
	@Max(1)
	replayErrorSampleRate?: number

	@ApiPropertyOptional({ description: '数据留存天数 1-365' })
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(365)
	retentionDays?: number

	@ApiPropertyOptional({ description: 'Replay 留存天数 1-365' })
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(365)
	replayRetentionDays?: number

	@ApiPropertyOptional({ description: '是否脱敏文本与输入' })
	@IsOptional()
	@IsBoolean()
	maskSensitiveData?: boolean

	@ApiPropertyOptional({ description: '是否采集控制台日志' })
	@IsOptional()
	@IsBoolean()
	captureConsole?: boolean
}
