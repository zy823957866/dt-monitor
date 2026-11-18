import axios from 'axios'
import { CacheKey, getLocal, removeLocal } from '@dt-frames/core'

/** 发送 SSO 登录请求时写入 sessionStorage 的 CSRF state 键名。 */
export const SSO_STATE_KEY = 'dt_sso_state'

/** 暂存原始回跳目标的 sessionStorage 键名。 */
export const SSO_REDIRECT_KEY = 'dt_sso_redirect'

/** 暂存 PKCE code_verifier 的 sessionStorage 键名。 */
export const SSO_PKCE_VERIFIER_KEY = 'dt_sso_pkce_verifier'

/** 暂存 OIDC nonce 的 sessionStorage 键名。 */
export const SSO_NONCE_KEY = 'dt_sso_nonce'

/** OIDC 令牌端点返回结构。 */
export interface OAuthTokenResult {
	/** 访问令牌 */
	access_token: string
	/** 令牌类型 */
	token_type: string
	/** 访问令牌有效秒数 */
	expires_in: number
	/** 刷新令牌 */
	refresh_token: string
	/** ID 令牌 */
	id_token: string
	/** 授权范围 */
	scope?: string
}

/** 换令牌请求参数。 */
export interface ExchangeCodeParams {
	/** 授权码 */
	code: string
	/** 回调地址（必须与授权请求一致） */
	redirectUri: string
	/** OIDC 客户端 ID */
	clientId: string
	/** PKCE code_verifier */
	codeVerifier?: string
	/** 机密客户端密钥 */
	clientSecret?: string
}

/**
 * 使用授权码换取 access/refresh/id_token。
 * 通过 /auth-api 代理访问 auth-server，避免业务 axios 外壳包装。
 * @param params 换令牌参数
 * @returns 令牌结果集
 */
export function exchangeAuthCode(params: ExchangeCodeParams): Promise<OAuthTokenResult> {
	const body = new URLSearchParams({
		grant_type: 'authorization_code',
		code: params.code,
		redirect_uri: params.redirectUri,
		client_id: params.clientId,
	})
	if (params.codeVerifier) body.set('code_verifier', params.codeVerifier)
	if (params.clientSecret) body.set('client_secret', params.clientSecret)

	return axios
		.post<{ code: number; data: OAuthTokenResult; message: string }>(
			'/auth-api/oauth/token',
			body,
			{ headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
		)
		.then((response) => response.data.data)
}

/** 生成随机 state。 @returns 随机字符串 */
function generateSsoState(): string {
	const cryptoObj = globalThis.crypto
	if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
		return cryptoObj.randomUUID()
	}
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** 生成 OIDC nonce。 @returns 随机字符串 */
function generateSsoNonce(): string {
	return generateSsoState()
}

/** 生成 PKCE code_verifier。 @returns 32 字节 base64url 字符串 */
function generatePkceVerifier(): string {
	const bytes = new Uint8Array(32)
	globalThis.crypto.getRandomValues(bytes)
	return base64UrlEncode(bytes)
}

/**
 * 计算 PKCE S256 挑战值。
 * @param verifier code_verifier
 * @returns base64url 编码的挑战值
 */
async function pkceChallengeFromVerifier(verifier: string): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(verifier),
	)
	return base64UrlEncode(new Uint8Array(digest))
}

/**
 * 将字节数组编码为 base64url。
 * @param bytes 原始字节
 * @returns 无 padding 的 base64url
 */
function base64UrlEncode(bytes: Uint8Array): string {
	let binary = ''
	for (const byte of bytes) binary += String.fromCharCode(byte)
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

/**
 * 解析 JWT payload。
 * @param token 完整 JWT
 * @returns payload 对象，解析失败返回空对象
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
	const part = token.split('.')[1]
	if (!part) return {}
	const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
	const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
	try {
		return JSON.parse(atob(padded)) as Record<string, unknown>
	} catch {
		return {}
	}
}

/**
 * 校验 id_token 中的 nonce。
 * @param idToken ID 令牌
 * @param expectedNonce 期望值
 * @returns 是否一致
 */
export function validateIdTokenNonce(idToken: string, expectedNonce: string): boolean {
	if (!expectedNonce) return false
	return decodeJwtPayload(idToken).nonce === expectedNonce
}

/**
 * 清洗回跳地址，只允许同源 http/https 路径。
 * @param raw 原始地址
 * @param fallback 非法时回退值
 * @returns 安全路径
 */
export function sanitizeRedirectTarget(raw: string | null | undefined, fallback = '/'): string {
	if (!raw) return fallback
	let value = raw.trim()
	if (!value) return fallback
	if (/%[0-9a-f]{2}/i.test(value)) {
		try {
			value = decodeURIComponent(value)
		} catch {
			return fallback
		}
	}
	if (/^(?:javascript|data|vbscript):/i.test(value)) return fallback
	if (value.startsWith('//') || value.startsWith('/\\') || value.includes('\\')) {
		return fallback
	}
	try {
		const url = new URL(value, window.location.origin)
		if (url.origin !== window.location.origin) return fallback
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return fallback
		const target = `${url.pathname}${url.search}${url.hash}`
		for (const char of target) {
			const codePoint = char.codePointAt(0) ?? 0
			if (codePoint <= 0x1f || codePoint === 0x7f) return fallback
		}
		return target
	} catch {
		return fallback
	}
}

/**
 * 从 init-project 的 redirectUrl 参数解析真实回跳目标。
 * @param raw redirectUrl 字符串
 * @returns 安全目标路径，无法解析时返回空串
 */
function resolveSsoRedirectTarget(raw: string): string {
	const target = raw.replace(/^redirectUrl=/, '')
	const safeTarget = sanitizeRedirectTarget(target, '')
	if (!safeTarget) return ''
	try {
		const url = new URL(target, window.location.origin)
		const recorded = url.searchParams.get('redirect')
		if (recorded) return sanitizeRedirectTarget(recorded, '')
		const pathname = new URL(safeTarget, window.location.origin).pathname
		if (/\/login$|\/init-project$|\/sso\/callback$/i.test(pathname)) return ''
		return safeTarget
	} catch {
		return ''
	}
}

/**
 * 构建当前应用部署基路径下的 SSO 回调地址。
 * @returns 完整回调 URL
 */
export function buildSsoCallbackUrl(): string {
	const base = import.meta.env.BASE_URL || '/'
	const normalizedBase = base.endsWith('/') ? base : `${base}/`
	return `${window.location.origin}${normalizedBase}sso/callback`
}

/**
 * 为应用内路径加上部署基路径。
 * @param path 应用内路径或完整 URL
 * @returns 可直接跳转的地址
 */
export function withAppBase(path: string): string {
	const base = import.meta.env.BASE_URL || '/'
	if (path.startsWith('#')) return path
	const safePath = sanitizeRedirectTarget(path, base)
	if (base === '/') return safePath
	const root = base.endsWith('/') ? base.slice(0, -1) : base
	if (safePath === root || safePath.startsWith(`${root}/`)) return safePath
	return `${root}${safePath.startsWith('/') ? safePath : `/${safePath}`}`
}

/**
 * 构建 auth-center 登录地址，写入 state/nonce/PKCE 到 sessionStorage。
 * @param options 回调地址、客户端 ID、回跳目标、是否强制重新登录
 * @returns auth-center 登录 URL
 */
export async function buildAuthCenterLoginUrl(options: {
	callbackUrl: string
	clientId: string
	redirectTarget?: string
	forcePrompt?: boolean
}): Promise<string> {
	const state = generateSsoState()
	const nonce = generateSsoNonce()
	const verifier = generatePkceVerifier()
	sessionStorage.setItem(SSO_STATE_KEY, state)
	sessionStorage.setItem(SSO_NONCE_KEY, nonce)
	sessionStorage.setItem(SSO_PKCE_VERIFIER_KEY, verifier)
	const safeRedirectTarget = sanitizeRedirectTarget(options.redirectTarget, '')
	if (safeRedirectTarget) sessionStorage.setItem(SSO_REDIRECT_KEY, safeRedirectTarget)

	const codeChallenge = await pkceChallengeFromVerifier(verifier)
	const authCenterUrl = (import.meta.env.VITE_SSO_URL as string | undefined) || 'http://localhost:5174'
	const params = new URLSearchParams({
		redirect: options.callbackUrl,
		client_id: options.clientId,
		state,
		nonce,
		code_challenge: codeChallenge,
		code_challenge_method: 'S256',
	})
	if (options.forcePrompt) params.set('prompt', 'login')
	return `${authCenterUrl}/login?${params.toString()}`
}

/**
 * 构建 SSO 登录 URL（供布局 init-project 调用）。
 * @param redirectUrl 形如 redirectUrl=<url> 的参数
 * @returns auth-center 登录 URL
 */
export async function buildSsoLoginUrl(redirectUrl: string): Promise<string> {
	const originTarget = resolveSsoRedirectTarget(redirectUrl)
	const callbackUrl = buildSsoCallbackUrl()
	const clientId = (import.meta.env.VITE_OIDC_CLIENT_ID as string | undefined) || 'monitor'
	return buildAuthCenterLoginUrl({ callbackUrl, clientId, redirectTarget: originTarget })
}

/**
 * 请求 auth-server 结束当前会话。
 * @param accessToken 当前访问令牌
 * @param postLogoutRedirectUri 登出回跳地址
 * @param clientId 客户端 ID
 * @returns 登出跳转信息
 */
export function requestSsoLogout(
	accessToken: string,
	postLogoutRedirectUri: string,
	clientId: string,
): Promise<{ logoutUrl: string }> {
	return axios
		.post<{ code: number; data: { logoutUrl: string }; message: string }>(
			'/auth-api/oauth/logout',
			{ client_id: clientId, post_logout_redirect_uri: postLogoutRedirectUri },
			{ headers: { Authorization: `Bearer ${accessToken}` } },
		)
		.then((response) => response.data.data)
}

/**
 * 调用 monitor 后端登出，撤销共享在线会话与 monitor 客户端刷新令牌。
 * 用于 auth-server 因退出回跳地址未注册而拒绝时的兜底。
 * @param accessToken 当前访问令牌
 */
async function requestMonitorLogout(accessToken: string): Promise<void> {
	await axios.post(
		'/api/auth/logout',
		{},
		{ headers: { Authorization: `Bearer ${accessToken}`, 'X-Skip-Login-Expired': '1' } },
	)
}

/** 清理本地登录态。 */
function clearLocalAuth(): void {
	removeLocal(CacheKey.TOKEN)
	removeLocal(CacheKey.REFRESH_TOKEN)
	removeLocal(CacheKey.USER_INFO)
}

/**
 * 登出统一认证会话并构建新的 SSO 登录地址。
 * 存在本地 token 时强制 prompt=login，避免 sso-gateway 复用旧会话。
 * @param redirectTarget 登录成功后的应用内回跳目标
 * @returns auth-center 登录 URL
 */
export async function buildSsoLogoutUrl(redirectTarget = '/'): Promise<string> {
	const token = getLocal<string>(CacheKey.TOKEN) ?? ''
	const clientId = (import.meta.env.VITE_OIDC_CLIENT_ID as string | undefined) || 'monitor'
	const loginRedirect = `${window.location.origin}${withAppBase('/login')}`
	if (token) {
		try {
			await requestSsoLogout(token, loginRedirect, clientId)
		} catch {
			// auth-server 可能拒绝未注册的退出回跳地址，继续尝试本应用登出
		}
		try {
			await requestMonitorLogout(token)
		} catch {
			// 认证中心不可用时仍清理本地状态并跳登录页，避免卡死
		}
	}
	clearLocalAuth()
	const safeTarget = sanitizeRedirectTarget(redirectTarget, '/')
	return buildAuthCenterLoginUrl({
		callbackUrl: buildSsoCallbackUrl(),
		clientId,
		redirectTarget: safeTarget,
		forcePrompt: Boolean(token),
	})
}
