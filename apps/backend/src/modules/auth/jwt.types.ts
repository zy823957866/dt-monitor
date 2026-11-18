/** 统一认证中心签发的访问令牌载荷。 */
export interface JwtPayload {
	/** 用户 ID */
	sub: number
	/** 登录账号 */
	username: string
	/** 角色编码 */
	roles: string[]
	/** 在线会话 ID */
	jti: string
	/** 令牌受众（应用编码） */
	aud?: string | string[]
}
