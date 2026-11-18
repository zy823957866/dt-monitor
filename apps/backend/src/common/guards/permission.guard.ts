import {
	ForbiddenException,
	Injectable,
	type CanActivate,
	type ExecutionContext,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { AuthUser } from '../decorators/current-user.decorator'
import { REQUIRE_PERMISSION_KEY } from '../decorators/require-permission.decorator'
import { UsersService } from '../../modules/users/users.service'

/** 权限守卫：系统角色直接放行，其他用户必须拥有全部声明权限码。 */
@Injectable()
export class PermissionGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly usersService: UsersService,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const required = this.reflector.getAllAndOverride<string[]>(REQUIRE_PERMISSION_KEY, [
			context.getHandler(),
			context.getClass(),
		])
		if (!required?.length) return true
		const user = context.switchToHttp().getRequest().user as AuthUser
		if (await this.usersService.hasSystemRole(user.id)) return true
		const codes = await this.usersService.findPermissionCodesByUserId(user.id)
		const missing = required.filter((code) => !codes.includes(code))
		if (missing.length) throw new ForbiddenException(`缺少权限: ${missing.join(', ')}`)
		return true
	}
}
