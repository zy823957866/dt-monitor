import type { Request } from 'express'

/** 获取请求 IP。 @param request Express 请求 @returns IP 字符串 */
export function getRequestIp(request: Request): string {
	const forwarded = request.headers['x-forwarded-for']
	if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0]!.trim()
	return request.ip ?? ''
}

/** 解析浏览器名称。 @param userAgent User-Agent @returns 浏览器名称 */
export function parseBrowser(userAgent?: string): string {
	const ua = userAgent ?? ''
	if (/MicroMessenger/i.test(ua)) return '微信'
	if (/Edg\//i.test(ua)) return 'Edge'
	if (/Chrome\//i.test(ua)) return 'Chrome'
	if (/Firefox\//i.test(ua)) return 'Firefox'
	if (/Safari\//i.test(ua)) return 'Safari'
	return '未知'
}

/** 解析操作系统名称。 @param userAgent User-Agent @returns 操作系统名称 */
export function parseOs(userAgent?: string): string {
	const ua = userAgent ?? ''
	if (/Windows/i.test(ua)) return 'Windows'
	if (/Mac OS X/i.test(ua)) return 'macOS'
	if (/Android/i.test(ua)) return 'Android'
	if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS'
	if (/Linux/i.test(ua)) return 'Linux'
	return '未知'
}

/**
 * 将 JWT 时长转换为秒。
 * @param expiresIn 例如 15m、7d、3600s
 * @returns 秒数
 */
export function expiresInToSeconds(expiresIn: string): number {
	const match = /^([0-9]+)(s|m|h|d)?$/.exec(expiresIn)
	if (!match) return 900
	const value = Number(match[1])
	const unit = match[2] ?? 's'
	return value * (unit === 'm' ? 60 : unit === 'h' ? 3600 : unit === 'd' ? 86400 : 1)
}
