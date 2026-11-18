import { Injectable, type ExecutionContext } from '@nestjs/common'
import type { Observable } from 'rxjs'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'

/** 全局 JWT 认证守卫：`@Public()` 接口放行。 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
	constructor(private readonly reflector: Reflector) {
		super()
	}

	canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
		const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
			context.getHandler(),
			context.getClass(),
		])
		return isPublic ? true : super.canActivate(context)
	}
}
