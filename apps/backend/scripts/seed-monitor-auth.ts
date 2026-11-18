import 'dotenv/config'
import mysql from 'mysql2/promise'

/** dt_frames 中的 monitor 菜单种子。 */
interface MonitorMenuSeed {
	/** 菜单 ID（不超过 32 字符） */
	id: string
	/** 父菜单 ID */
	parentId: string | null
	/** 菜单类型 */
	type: 'catalog' | 'menu' | 'button'
	/** 中文名称 */
	name: string
	/** 前端静态路由路径 */
	path?: string
	/** 排序 */
	order: number
	/** 后端权限码 */
	authCode?: string
	/** 是否在菜单中隐藏 */
	hideInMenu?: number
}

/** 与前端静态路由及后端 RequirePermission 保持一致。 */
const MONITOR_MENUS: MonitorMenuSeed[] = [
	{
		id: 'monitor_root_insight',
		parentId: null,
		type: 'catalog',
		name: '监控',
		order: 0,
	},
	{
		id: 'monitor_overview',
		parentId: 'monitor_root_insight',
		type: 'menu',
		name: '概览',
		path: '/monitor/overview',
		order: 1,
		authCode: 'monitor:overview:view',
	},
	{
		id: 'monitor_errors',
		parentId: 'monitor_root_insight',
		type: 'menu',
		name: '错误',
		path: '/monitor/errors',
		order: 2,
		authCode: 'monitor:error:list',
	},
	{
		id: 'monitor_error_detail',
		parentId: 'monitor_errors',
		type: 'menu',
		name: '错误详情',
		path: '/monitor/errors/:id',
		order: 900,
		authCode: 'monitor:error:read',
		hideInMenu: 1,
	},
	{
		id: 'monitor_error_update',
		parentId: 'monitor_errors',
		type: 'button',
		name: '修改错误状态',
		order: 10,
		authCode: 'monitor:error:update',
		hideInMenu: 1,
	},
	{
		id: 'monitor_performance',
		parentId: 'monitor_root_insight',
		type: 'menu',
		name: '性能',
		path: '/monitor/performance',
		order: 3,
		authCode: 'monitor:performance:view',
	},
	{
		id: 'monitor_traces',
		parentId: 'monitor_root_insight',
		type: 'menu',
		name: 'Trace',
		path: '/monitor/traces',
		order: 4,
		authCode: 'monitor:trace:view',
	},
	{
		id: 'monitor_trace_detail',
		parentId: 'monitor_traces',
		type: 'menu',
		name: 'Trace 详情',
		path: '/monitor/traces/:traceId',
		order: 901,
		authCode: 'monitor:trace:read',
		hideInMenu: 1,
	},
	{
		id: 'monitor_replays',
		parentId: 'monitor_root_insight',
		type: 'menu',
		name: 'Replay',
		path: '/monitor/replays',
		order: 5,
		authCode: 'monitor:replay:view',
	},
	{
		id: 'monitor_replay_read',
		parentId: 'monitor_replays',
		type: 'button',
		name: '查看回放',
		order: 10,
		authCode: 'monitor:replay:read',
		hideInMenu: 1,
	},
	{
		id: 'monitor_analytics',
		parentId: 'monitor_root_insight',
		type: 'menu',
		name: '埋点',
		path: '/monitor/analytics',
		order: 6,
		authCode: 'monitor:analytics:view',
	},
	{
		id: 'monitor_event_explore',
		parentId: 'monitor_analytics',
		type: 'button',
		name: '事件探索',
		order: 10,
		authCode: 'monitor:event:explore',
		hideInMenu: 1,
	},
	{
		id: 'monitor_root_config',
		parentId: null,
		type: 'catalog',
		name: '管理',
		order: 100,
	},
	{
		id: 'monitor_projects',
		parentId: 'monitor_root_config',
		type: 'menu',
		name: '项目管理',
		path: '/monitor/projects',
		order: 10,
		authCode: 'monitor:project:list',
	},
	{
		id: 'monitor_project_create',
		parentId: 'monitor_projects',
		type: 'button',
		name: '新建项目',
		order: 1,
		authCode: 'monitor:project:create',
		hideInMenu: 1,
	},
	{
		id: 'monitor_project_update',
		parentId: 'monitor_projects',
		type: 'button',
		name: '编辑项目',
		order: 2,
		authCode: 'monitor:project:update',
		hideInMenu: 1,
	},
	{
		id: 'monitor_project_delete',
		parentId: 'monitor_projects',
		type: 'button',
		name: '删除项目',
		order: 3,
		authCode: 'monitor:project:delete',
		hideInMenu: 1,
	},
	{
		id: 'monitor_project_rotate',
		parentId: 'monitor_projects',
		type: 'button',
		name: '轮换 Key',
		order: 4,
		authCode: 'monitor:project:rotate-key',
		hideInMenu: 1,
	},
	{
		id: 'monitor_sdk',
		parentId: 'monitor_root_config',
		type: 'menu',
		name: 'SDK 接入',
		path: '/monitor/sdk',
		order: 11,
		authCode: 'monitor:sdk:view',
	},
	{
		id: 'monitor_alerts',
		parentId: 'monitor_root_config',
		type: 'menu',
		name: '告警',
		path: '/monitor/alerts',
		order: 12,
		authCode: 'monitor:alert:list',
	},
	{
		id: 'monitor_alert_create',
		parentId: 'monitor_alerts',
		type: 'button',
		name: '新建规则',
		order: 1,
		authCode: 'monitor:alert:create',
		hideInMenu: 1,
	},
	{
		id: 'monitor_alert_update',
		parentId: 'monitor_alerts',
		type: 'button',
		name: '编辑规则',
		order: 2,
		authCode: 'monitor:alert:update',
		hideInMenu: 1,
	},
	{
		id: 'monitor_alert_delete',
		parentId: 'monitor_alerts',
		type: 'button',
		name: '删除规则',
		order: 3,
		authCode: 'monitor:alert:delete',
		hideInMenu: 1,
	},
]

/** dt_frames 中的应用记录。 */
interface AppRow {
	/** 应用 ID */
	id: number
	/** 应用名称 */
	name: string | null
	/** 逗号分隔的 OIDC 回调地址 */
	redirect_uris: string | null
}

/**
 * 构造 dt_frames 连接参数；认证库未单独配置时继承主库凭据。
 * @returns mysql2 连接参数
 */
function authDbConfig(): mysql.ConnectionOptions {
	return {
		host: process.env.AUTH_DB_HOST ?? process.env.DB_HOST ?? 'localhost',
		port: Number(process.env.AUTH_DB_PORT ?? process.env.DB_PORT ?? 3306),
		user: process.env.AUTH_DB_USERNAME ?? process.env.DB_USERNAME ?? 'root',
		password: process.env.AUTH_DB_PASSWORD ?? process.env.DB_PASSWORD ?? '',
		database: process.env.AUTH_DB_DATABASE ?? 'dt_frames',
		charset: process.env.AUTH_DB_CHARSET ?? 'utf8mb4',
	}
}

/**
 * 合并 OIDC 回调地址，避免重复。
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
 * 幂等注册 monitor OIDC 应用，并授权启用中的系统角色。
 * @param connection dt_frames 连接
 * @param baseUrl monitor 前端基址
 * @returns 应用 ID 与授权角色数量
 */
async function ensureMonitorApp(
	connection: mysql.Connection,
	baseUrl: string,
): Promise<{ appId: number; roleCount: number }> {
	const callback = `${baseUrl}/sso/callback`
	const name = process.env.MONITOR_APP_NAME ?? '监控平台'
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
	return { appId, roleCount: roles.length }
}

/**
 * 幂等写入 monitor 页面菜单与按钮权限码。
 * 只写 dt_frames.sys_menu，不创建用户、角色，也不修改角色菜单授权。
 * @param connection dt_frames 连接
 * @returns 写入的菜单数量
 */
async function seedMonitorMenus(connection: mysql.Connection): Promise<number> {
	for (const menu of MONITOR_MENUS) {
		await connection.query(
			'INSERT INTO `sys_menu` (`id`, `app_id`, `zh_cn_name`, `parent_id`, `type`, `path`, ' +
				'`order`, `hide_in_menu`, `auth_code`, `deleted`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0) ' +
				'ON DUPLICATE KEY UPDATE `app_id` = VALUES(`app_id`), `zh_cn_name` = VALUES(`zh_cn_name`), ' +
				'`parent_id` = VALUES(`parent_id`), `type` = VALUES(`type`), `path` = VALUES(`path`), ' +
				'`order` = VALUES(`order`), `hide_in_menu` = VALUES(`hide_in_menu`), ' +
				'`auth_code` = VALUES(`auth_code`), `deleted` = 0, `update_time` = NOW()',
			[
				menu.id,
				'monitor',
				menu.name,
				menu.parentId,
				menu.type,
				menu.path ?? null,
				menu.order,
				menu.hideInMenu ?? 0,
				menu.authCode ?? null,
			],
		)
	}
	return MONITOR_MENUS.length
}

/** 初始化 dt_frames 中的 monitor 应用、菜单与权限码。 */
async function main(): Promise<void> {
	const connection = await mysql.createConnection(authDbConfig())
	const baseUrl = (process.env.MONITOR_APP_BASE_URL ?? 'http://localhost:5179').replace(/\/$/, '')
	try {
		const { appId, roleCount } = await ensureMonitorApp(connection, baseUrl)
		const menuCount = await seedMonitorMenus(connection)
		console.log(
			`monitor 认证数据已就绪：appId=${appId}, menus=${menuCount}, ` +
				`callback=${baseUrl}/sso/callback, 系统角色授权=${roleCount} 个`,
		)
		console.log('用户、角色与角色菜单授权仍由权限中心维护，脚本不会写入这些数据。')
	} finally {
		await connection.end()
	}
}

void main().catch((error: unknown) => {
	console.error('初始化 monitor 认证数据失败：', error instanceof Error ? error.message : error)
	process.exitCode = 1
})
