import { Controller, Get } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { type AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator'
import {
	UserEndpointService,
	type AppVO,
	type MenuVO,
	type UserInfoVO,
} from './user-endpoint.service'

/** 用户侧接口：当前用户、菜单、权限与应用入口。 */
@ApiTags('user')
@ApiBearerAuth()
@Controller('user')
export class UserEndpointController {
	constructor(private readonly userEndpointService: UserEndpointService) {}

	@Get('info')
	@ApiOperation({ summary: '当前用户信息' })
	info(@CurrentUser() user: AuthUser): Promise<UserInfoVO> {
		return this.userEndpointService.getInfo(user.id)
	}

	@Get('menus')
	@ApiOperation({ summary: '当前用户菜单' })
	menus(@CurrentUser() user: AuthUser): Promise<MenuVO[]> {
		return this.userEndpointService.getMenus(user.id)
	}

	@Get('permissions')
	@ApiOperation({ summary: '当前用户权限码' })
	permissions(@CurrentUser() user: AuthUser): Promise<string[]> {
		return this.userEndpointService.getPermissions(user.id)
	}

	@Get('apps')
	@ApiOperation({ summary: '当前用户应用入口' })
	apps(@CurrentUser() user: AuthUser): Promise<AppVO[]> {
		return this.userEndpointService.getApps(user.id)
	}
}
