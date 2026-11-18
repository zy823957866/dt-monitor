import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { type AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator'
import { Public } from '../../common/decorators/public.decorator'
import { UsersService } from '../users/users.service'
import { AuthService } from './auth.service'
import { RefreshDto } from './dto/refresh.dto'

/** 认证接口。 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
	constructor(
		private readonly authService: AuthService,
		private readonly usersService: UsersService,
	) {}

	@Public()
	@Post('refresh')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: '刷新访问令牌' })
	refresh(@Body() dto: RefreshDto): Promise<{ accessToken: string; refreshToken: string }> {
		return this.authService.refresh(dto.refreshToken)
	}

	@Get('profile')
	@ApiBearerAuth()
	@ApiOperation({ summary: '当前用户信息' })
	profile(@CurrentUser() user: AuthUser) {
		return this.usersService.getProfile(user.id)
	}

	@Post('logout')
	@HttpCode(HttpStatus.OK)
	@ApiBearerAuth()
	@ApiOperation({ summary: '登出' })
	async logout(@CurrentUser() user: AuthUser): Promise<{ success: boolean }> {
		await this.authService.logout(user.id, user.jti)
		return { success: true }
	}
}
