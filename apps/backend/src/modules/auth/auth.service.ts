import {
	BadGatewayException,
	Injectable,
	ServiceUnavailableException,
	UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AuthServerConfig } from '../../config/configuration'
import { RedisService } from '../../redis/redis.service'

/** auth-server 刷新接口的响应外壳。 */
interface RefreshEnvelope {
	code: number
	data?: { accessToken?: string; refreshToken?: string }
	message?: string
}

/** 认证服务：代理统一认证中心刷新令牌并维护共享在线会话。 */
@Injectable()
export class AuthService {
	constructor(
		private readonly config: ConfigService,
		private readonly redisService: RedisService,
	) {}

	/**
	 * 代理 auth-server 刷新访问令牌。
	 * @param refreshToken 统一认证中心签发的刷新令牌
	 * @returns 新的访问令牌与刷新令牌
	 */
	async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
		const authServer = this.config.get<AuthServerConfig>('authServer')
		if (!authServer?.url) throw new ServiceUnavailableException('认证服务配置缺失')
		let response: Response
		try {
			response = await fetch(`${authServer.url.replace(/\/$/, '')}/auth/refresh`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ refreshToken }),
				signal: AbortSignal.timeout(authServer.timeout),
			})
		} catch {
			throw new ServiceUnavailableException('认证服务不可用')
		}
		let body: RefreshEnvelope
		try {
			body = (await response.json()) as RefreshEnvelope
		} catch {
			throw new BadGatewayException('认证服务响应格式错误')
		}
		if (!response.ok || body.code !== 0) {
			const message = body.message || '刷新令牌无效或已过期'
			if (response.status === 400 || response.status === 401) {
				throw new UnauthorizedException(message)
			}
			throw new BadGatewayException(message)
		}
		const accessToken = body.data?.accessToken
		const nextRefreshToken = body.data?.refreshToken
		if (!accessToken || !nextRefreshToken) {
			throw new UnauthorizedException('认证服务未返回完整令牌')
		}
		return { accessToken, refreshToken: nextRefreshToken }
	}

	/**
	 * 登出当前在线会话并撤销 monitor 客户端刷新令牌。
	 * @param userId 用户 ID
	 * @param jti 当前会话 ID
	 */
	async logout(userId: number, jti: string): Promise<void> {
		await this.redisService.delRaw(`dt-frame:auth:refresh:monitor:${userId}`)
		await this.redisService.delRaw(`dt-frame:monitor:online:${jti}`)
	}
}
