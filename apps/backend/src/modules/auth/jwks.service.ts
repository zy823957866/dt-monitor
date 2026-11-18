import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createPublicKey, type JsonWebKey } from 'node:crypto'
import type { AuthServerConfig } from '../../config/configuration'
import { decodeJwtHeader, isAsymmetricAlgorithm, resolvePublicKeyPem } from './jwt.utils'

/** auth-server JWKS 中的单把公钥。 */
interface Jwk extends JsonWebKey {
	kid?: string
	alg?: string
	use?: string
}

/** auth-server JWKS 响应外壳。 */
interface JwksResponse {
	code?: number
	data?: { keys?: Jwk[] }
	message?: string
	keys?: Jwk[]
}

/** JWKS 缓存有效期：5 分钟，兼顾公钥轮换与认证服务可用性。 */
const JWKS_CACHE_TTL_MS = 5 * 60_000

/**
 * 统一认证公钥解析服务。
 * 优先使用 JWT_PUBLIC_KEY；未配置时从 auth-server 的 /oauth/jwks 拉取并缓存，
 * 这样业务后端无需复制认证服务的私钥配置，也能支持公钥轮换。
 */
@Injectable()
export class JwksService {
	private cache: { expiresAt: number; keys: Jwk[] } | null = null
	private pending: Promise<Jwk[]> | null = null

	constructor(private readonly config: ConfigService) {}

	/**
	 * 按令牌头部选择验签公钥。
	 * @param token 原始 JWT
	 * @returns PEM 公钥；对称算法或未配置认证服务时返回 undefined
	 */
	async resolveVerificationKey(token: string): Promise<string | undefined> {
		const staticKey = resolvePublicKeyPem(this.config)
		if (staticKey) return staticKey

		const header = decodeJwtHeader(token)
		if (!isAsymmetricAlgorithm(header?.alg)) return undefined

		let keys = await this.loadKeys()
		let key = this.selectKey(keys, header?.kid)
		if (!key && header?.kid) {
			this.cache = null
			keys = await this.loadKeys()
			key = this.selectKey(keys, header.kid)
		}
		if (!key) throw new ServiceUnavailableException('认证服务未发布可用 JWKS 公钥')

		return createPublicKey({ key, format: 'jwk' })
			.export({ type: 'spki', format: 'pem' })
			.toString()
	}

	/**
	 * 从缓存或 auth-server 获取公钥集合。
	 * @returns JWK 数组
	 */
	private async loadKeys(): Promise<Jwk[]> {
		if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.keys
		if (this.pending) return this.pending

		this.pending = this.fetchKeys()
			.then((keys) => {
				this.cache = { expiresAt: Date.now() + JWKS_CACHE_TTL_MS, keys }
				return keys
			})
			.finally(() => {
				this.pending = null
			})
		return this.pending
	}

	/**
	 * 请求 auth-server 的 JWKS 端点。
	 * @returns JWK 数组
	 */
	private async fetchKeys(): Promise<Jwk[]> {
		const authServer = this.config.get<AuthServerConfig>('authServer')
		if (!authServer?.url) throw new ServiceUnavailableException('认证服务配置缺失')

		let response: Response
		try {
			response = await fetch(`${authServer.url.replace(/\/$/, '')}/oauth/jwks`, {
				signal: AbortSignal.timeout(authServer.timeout),
			})
		} catch {
			throw new ServiceUnavailableException('认证服务不可用')
		}
		if (!response.ok) throw new ServiceUnavailableException('认证服务 JWKS 不可用')

		let body: JwksResponse
		try {
			body = (await response.json()) as JwksResponse
		} catch {
			throw new ServiceUnavailableException('认证服务 JWKS 响应格式错误')
		}
		const keys = body.data?.keys ?? body.keys ?? []
		const usable = keys.filter((key) => Boolean(key.kty && key.kid))
		if (usable.length === 0) throw new ServiceUnavailableException('认证服务未发布 JWKS 公钥')
		return usable
	}

	/**
	 * 按 kid 选择公钥；未携带 kid 时选择首个签名公钥。
	 * @param keys JWK 集合
	 * @param kid 令牌头部 kid
	 * @returns 匹配的公钥
	 */
	private selectKey(keys: Jwk[], kid?: string): Jwk | undefined {
		if (kid) return keys.find((key) => key.kid === kid)
		return keys.find((key) => key.use === 'sig') ?? keys[0]
	}
}
