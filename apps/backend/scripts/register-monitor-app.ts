import 'dotenv/config'
import mysql from 'mysql2/promise'

/** dt_frames 中已存在的应用记录。 */
interface AppRow {
	id: number
	name: string | null
	redirect_uris: string | null
}

/** 读取认证库连接参数。 */
function authDbConfig(): mysql.ConnectionOptions {
	const database = process.env.AUTH_DB_DATABASE ?? 'dt_frames'
	return {
		host: process.env.AUTH_DB_HOST ?? process.env.DB_HOST ?? 'localhost',
		port: Number(process.env.AUTH_DB_PORT ?? process.env.DB_PORT ?? 3306),
		user: process.env.AUTH_DB_USERNAME ?? process.env.DB_USERNAME ?? 'root',
		password: process.env.AUTH_DB_PASSWORD ?? process.env.DB_PASSWORD ?? '',
		database,
		charset: process.env.AUTH_DB_CHARSET ?? 'utf8mb4',
	}
}

/**
 * 合并 OIDC 回调地址。
 * @param current 数据库现有逗号分隔地址
 * @param callback 本次需要追加的回调地址
 * @returns 合并后的地址
 */
function mergeRedirectUris(current: string | null, callback: string): string {
	const items = (current ?? '')
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean)
	if (!items.includes(callback)) items.push(callback)
	return items.join(',')
}

/**
 * 幂等注册 monitor OIDC 应用并授权启用中的系统角色。
 * 不创建、不修改任何菜单、角色或角色菜单授权。
 */
async function main(): Promise<void> {
	const connection = await mysql.createConnection(authDbConfig())
	const baseUrl = (process.env.MONITOR_APP_BASE_URL ?? 'http://localhost:5179').replace(/\/$/, '')
	const callback = `${baseUrl}/sso/callback`
	const name = process.env.MONITOR_APP_NAME ?? '监控平台'

	try {
		const [rows] = await connection.query<AppRow[] & mysql.RowDataPacket[]>(
			'SELECT `id`, `name`, `redirect_uris` FROM `sys_app` WHERE `code` = ? LIMIT 1',
			['monitor'],
		)
		let appId: number
		if (rows.length) {
			appId = Number(rows[0].id)
			const redirectUris = mergeRedirectUris(rows[0].redirect_uris, callback)
			await connection.query(
				'UPDATE `sys_app` SET `status` = 1, `deleted` = 0, `path` = ?, `base_url` = ?, ' +
					"`open_mode` = 'tab', `entry_type` = 'app', `is_builtin` = 0, " +
					"`redirect_uris` = ?, `name` = COALESCE(NULLIF(`name`, ''), ?), " +
					'`update_time` = NOW() WHERE `id` = ?',
				['/monitor/overview', baseUrl, redirectUris, name, appId],
			)
		} else {
			const [result] = await connection.query<mysql.ResultSetHeader>(
				'INSERT INTO `sys_app` (`name`, `code`, `order`, `status`, `deleted`, `description`, ' +
					'`category`, `path`, `base_url`, `open_mode`, `entry_type`, `is_builtin`, ' +
					'`user_count`, `client_secret`, `redirect_uris`, `create_time`, `update_time`) ' +
					'VALUES (?, ?, 50, 1, 0, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, NOW(), NOW())',
				[
					name,
					'monitor',
					'dt-monitor 监控平台',
					'monitor',
					'/monitor/overview',
					baseUrl,
					'tab',
					'app',
					callback,
				],
			)
			appId = Number(result.insertId)
		}

		const [roles] = await connection.query<Array<{ id: number }> & mysql.RowDataPacket[]>(
			'SELECT `id` FROM `sys_role` WHERE `deleted` = 0 AND `status` = 1 ' +
				'AND CAST(`is_system` AS UNSIGNED) = 1',
		)
		for (const role of roles) {
			await connection.query(
				'INSERT IGNORE INTO `sys_app_role` (`app_id`, `role_id`) VALUES (?, ?)',
				[appId, Number(role.id)],
			)
		}
		console.log(
			`monitor 应用已就绪：id=${appId}, base_url=${baseUrl}, callback=${callback}, ` +
				`系统角色授权=${roles.length} 个`,
		)
		console.log('菜单、角色与角色菜单授权未做任何改动，请在权限中心手工维护。')
	} finally {
		await connection.end()
	}
}

void main().catch((error: unknown) => {
	console.error('注册 monitor 应用失败：', error instanceof Error ? error.message : error)
	process.exitCode = 1
})
