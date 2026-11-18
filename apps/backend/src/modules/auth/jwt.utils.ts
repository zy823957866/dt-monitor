import { ConfigService } from '@nestjs/config'

/** JWT 头部中与验签相关的字段。 */
export interface JwtHeader {
	/** 签名算法 */
	alg?: string
	/** 公钥标识 */
	kid?: string
}

/** 解析 JWT 头部。 @param token 原始 JWT @returns 头部对象或 null */
export function decodeJwtHeader(token: string): JwtHeader | null {
	const part = token.split('.')[0]
	if (!part) return null
	const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
	const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
	try {
		return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as JwtHeader
	} catch {
		return null
	}
}

/** 读取统一认证中心公钥 PEM。 @param config 配置服务 @returns 公钥或 undefined */
export function resolvePublicKeyPem(config: ConfigService): string | undefined {
	const publicKey = config.get<string>('jwt.publicKey')
	return publicKey?.trim() ? publicKey : undefined
}

/** 判断 JWT 算法是否为非对称签名算法。 @param alg 算法名 @returns 是否非对称 */
export function isAsymmetricAlgorithm(alg?: string): boolean {
	const normalized = alg?.toUpperCase() ?? ''
	return normalized.startsWith('RS') || normalized.startsWith('ES') || normalized.startsWith('PS')
}
