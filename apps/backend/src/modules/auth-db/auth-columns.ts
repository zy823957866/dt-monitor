import type { ValueTransformer } from 'typeorm'

/**
 * MySQL bigint 转 JavaScript number：dt_frames 的用户与角色 ID 在监控端按 number 使用。
 */
export const bigintToNumberTransformer: ValueTransformer = {
	to: (value: unknown): number | null => (value == null ? null : Number(value)),
	from: (value: unknown): number | null => (value == null ? null : Number(value)),
}

/**
 * sys_role.is_system 兼容映射：MySQL bit(1) 返回 Buffer，SQLite 返回 boolean/number。
 */
export const bitToBooleanTransformer: ValueTransformer = {
	to: (value: unknown): boolean => Boolean(value),
	from: (value: unknown): boolean => {
		if (typeof value === 'boolean') return value
		if (typeof value === 'number') return value === 1
		if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true'
		if (Buffer.isBuffer(value)) return value[0] === 1
		return Boolean(value)
	},
}

/**
 * 根据当前认证库驱动返回 is_system 列类型：MySQL 为 bit(1)，SQLite 测试库为 boolean。
 * @returns TypeORM 列类型
 */
export function isSystemColumnType(): 'bit' | 'boolean' {
	const type = process.env.AUTH_DB_TYPE ?? process.env.DB_TYPE ?? 'mysql'
	return type === 'better-sqlite3' ? 'boolean' : 'bit'
}
