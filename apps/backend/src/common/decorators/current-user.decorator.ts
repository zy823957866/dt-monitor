import { createParamDecorator, type ExecutionContext } from '@nestjs/common'

/** JWT 校验后注入的当前用户。 */
export interface AuthUser {
	id: number
	username: string
	roles: string[]
	jti: string
}

/** 获取当前登录用户。 @returns 当前用户 */
export const CurrentUser = createParamDecorator(
	(_data: unknown, ctx: ExecutionContext): AuthUser => {
		const request = ctx.switchToHttp().getRequest()
		return request.user as AuthUser
	},
)
