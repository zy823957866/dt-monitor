import { ApiProperty } from '@nestjs/swagger'
import { IsString } from 'class-validator'

/** 刷新令牌请求参数。 */
export class RefreshDto {
	@ApiProperty({ description: '刷新令牌' })
	@IsString()
	refreshToken!: string
}
