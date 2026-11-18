import { SetMetadata } from '@nestjs/common'

/** 公开接口元数据 key。 */
export const IS_PUBLIC_KEY = 'isPublic'

/** 标记接口无需 JWT 即可访问。 @returns 方法/类装饰器 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true)
