import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { SsoMenu } from '../auth-db/entities/sso-menu.entity'
import { SsoRole } from '../auth-db/entities/sso-role.entity'
import { SsoApp } from '../auth-db/entities/sso-app.entity'
import { UsersService } from '../users/users.service'

/** monitor 应用的菜单范围。 */
const MONITOR_APP_ID = 'monitor'

/** 前端布局菜单结构。 */
export interface MenuVO {
	id: string
	pid: string | null
	path: string
	name: string
	type: string
	order: number
	authCode?: string
	icon?: string
	show: boolean
	keepAlive: boolean
	affixTab: boolean
	hideInBreadcrumb: boolean
	hideInTab: boolean
	appId: string
}

/** 前端布局用户信息。 */
export interface UserInfoVO {
	userId: string
	username: string
	userName: string
	nickname: string
	avatar: string
	signature: string
	email?: string
	roles: string[]
}

/** 应用入口卡片。 */
export interface AppVO {
	id: number
	code: string
	name: string
	description?: string
	icon?: string
	iconName?: string
	category?: string
	path: string
	baseUrl?: string
	openMode?: string
	themeColor?: string
	templateCode?: string
	status: number
	order: number
	entryType: 'app' | 'scaffold'
	isBuiltin: number
}

/** 用户侧数据服务：从 dt_frames 读取资料、菜单与权限。 */
@Injectable()
export class UserEndpointService {
	constructor(
		@InjectRepository(SsoMenu, 'auth') private readonly menuRepo: Repository<SsoMenu>,
		@InjectRepository(SsoRole, 'auth') private readonly roleRepo: Repository<SsoRole>,
		@InjectRepository(SsoApp, 'auth') private readonly appRepo: Repository<SsoApp>,
		private readonly usersService: UsersService,
	) {}

	/** 获取当前用户布局资料。 @param userId 用户 ID @returns 布局用户信息 */
	async getInfo(userId: number): Promise<UserInfoVO> {
		const user = await this.usersService.findOne(userId)
		const roles = await this.usersService.findRoleCodesByUserId(userId)
		return {
			userId: String(user.id),
			username: user.username,
			userName: user.nickname ?? user.username,
			nickname: user.nickname ?? user.username,
			avatar: user.avatar ?? '',
			signature: '',
			email: user.email,
			roles,
		}
	}

	/** 获取当前用户可见的 monitor 菜单。 @param userId 用户 ID @returns 菜单数组 */
	async getMenus(userId: number): Promise<MenuVO[]> {
		const isSystem = await this.usersService.hasSystemRole(userId)
		let menus: SsoMenu[]
		if (isSystem) {
			menus = await this.menuRepo.find({
				where: { deleted: 0, appId: MONITOR_APP_ID },
				order: { order: 'ASC' },
			})
		} else {
			const roles = await this.roleRepo.find({
				where: { users: { id: userId }, deleted: 0, status: 1 },
				relations: { menus: true },
			})
			const menuMap = new Map<string, SsoMenu>()
			for (const role of roles) {
				for (const menu of role.menus ?? []) {
					if (menu.deleted === 0 && menu.appId === MONITOR_APP_ID) {
						menuMap.set(menu.id, menu)
					}
				}
			}
			menus = [...menuMap.values()].sort((a, b) => a.order - b.order)
		}
		return menus.map((menu) => ({
			id: menu.id,
			pid: menu.parentId ?? null,
			path: menu.path ?? `/${menu.id}`,
			name: menu.zhCnName,
			type: menu.type,
			order: menu.order,
			authCode: menu.authCode,
			icon: menu.icon || menu.iconName || undefined,
			show: menu.hideInMenu === 0,
			keepAlive: Boolean(menu.keepAlive),
			affixTab: Boolean(menu.affixTab),
			hideInBreadcrumb: Boolean(menu.hideInBreadcrumb),
			hideInTab: Boolean(menu.hideInTab),
			appId: menu.appId,
		}))
	}

	/** 获取当前用户 monitor 权限码。 @param userId 用户 ID @returns 权限码数组 */
	getPermissions(userId: number): Promise<string[]> {
		return this.usersService.findPermissionCodesByUserId(userId)
	}

	/**
	 * 获取当前用户可见的应用入口。
	 * 系统角色返回全部启用应用，其他角色仅返回 sys_app_role 中已授权的应用。
	 * @param userId 用户 ID
	 * @returns 应用卡片数组
	 */
	async getApps(userId: number): Promise<AppVO[]> {
		const isSystem = await this.usersService.hasSystemRole(userId)
		let apps: SsoApp[]
		if (isSystem) {
			apps = await this.appRepo.find({
				where: { status: 1, deleted: 0 },
				order: { order: 'ASC' },
			})
		} else {
			const roles = await this.roleRepo.find({
				where: { users: { id: userId }, deleted: 0, status: 1 },
			})
			const roleIds = roles.map((role) => role.id)
			if (roleIds.length === 0) return []
			apps = await this.appRepo
				.createQueryBuilder('app')
				.innerJoin('sys_app_role', 'appRole', 'appRole.app_id = app.id')
				.where('app.deleted = 0')
				.andWhere('app.status = 1')
				.andWhere('appRole.role_id IN (:...roleIds)', { roleIds })
				.distinct(true)
				.orderBy('app.order', 'ASC')
				.getMany()
		}
		return apps.map((app) => ({
			id: app.id,
			code: app.code,
			name: app.name,
			description: app.description,
			icon: app.icon,
			iconName: app.iconName,
			category: app.category,
			path: app.path ?? '',
			baseUrl: app.baseUrl,
			openMode: app.openMode,
			themeColor: app.themeColor,
			templateCode: app.templateCode,
			status: app.status,
			order: app.order,
			entryType: app.entryType === 'scaffold' ? 'scaffold' : 'app',
			isBuiltin: app.isBuiltin,
		}))
	}
}
