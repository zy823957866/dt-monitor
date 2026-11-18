import { SetMetadata } from '@nestjs/common'

/** 权限码元数据 key。 */
export const REQUIRE_PERMISSION_KEY = 'requirePermission'

/**
 * 声明接口所需权限码。
 * @param permissions 一个或多个权限码，需全部满足
 * @returns 方法装饰器
 */
export const RequirePermission = (...permissions: string[]): MethodDecorator =>
	SetMetadata(REQUIRE_PERMISSION_KEY, permissions)
