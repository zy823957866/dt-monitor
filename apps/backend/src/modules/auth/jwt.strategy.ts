import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import type { Request } from 'express'
import type { AuthUser } from '../../common/decorators/current-user.decorator'
import { RedisService } from '../../redis/redis.service'
import type { JwtPayload } from './jwt.types'
import type { AuthServerConfig } from '../../config/configuration'
import { JwksService } from './jwks.service'
import { resolvePublicKeyPem } from './jwt.utils'

/** JWT 策略：校验统一认证中心令牌签名、受众与共享在线会话。 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
	constructor(
		config: ConfigService,
		private readonly redisService: RedisService,
		jwksService: JwksService,
	) {
		const accessSecret = config.getOrThrow<string>('jwt.accessSecret')
		const publicKeyPem = resolvePublicKeyPem(config)
		const authServer = config.get<AuthServerConfig>('authServer')
		const supportsRs256 = Boolean(publicKeyPem || authServer?.url)
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			audience: 'monitor',
			algorithms: supportsRs256 ? ['RS256'] : ['HS256'],
			secretOrKeyProvider: (
				_request: Request,
				rawJwtToken: string,
				done: (error: unknown, secretOrKey?: string | Buffer) => void,
			) => {
				void jwksService
					.resolveVerificationKey(rawJwtToken)
					.then((key) => done(null, key ?? accessSecret))
					.catch((error: unknown) => done(error))
			},
		})
	}

	/** 校验共享会话存在后注入 req.user。 @param payload 令牌载荷 @returns 当前用户 */
	async validate(payload: JwtPayload): Promise<AuthUser> {
		if (!payload.jti) throw new UnauthorizedException('登录状态已失效')
		const session = await this.redisService.getRaw(`dt-frame:monitor:online:${payload.jti}`)
		if (!session) throw new UnauthorizedException('登录状态已失效，请重新登录')
		return {
			id: payload.sub,
			username: payload.username,
			roles: payload.roles,
			jti: payload.jti,
		}
	}
}
