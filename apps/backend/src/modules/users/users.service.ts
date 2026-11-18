import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { SsoRole } from '../auth-db/entities/sso-role.entity'
import { SsoUser } from '../auth-db/entities/sso-user.entity'

/** monitor 应用的菜单与权限范围。 */
const MONITOR_APP_ID = 'monitor'

/** 当前用户公开资料。 */
export interface UserProfile {
	id: number
	username: string
	nickname: string
	roles: string[]
	permissions: string[]
}

/** 用户服务：从统一认证库读取用户、角色与 monitor 权限码。 */
@Injectable()
export class UsersService {
	constructor(
		@InjectRepository(SsoUser, 'auth') private readonly userRepo: Repository<SsoUser>,
		@InjectRepository(SsoRole, 'auth') private readonly roleRepo: Repository<SsoRole>,
	) {}

	/** 按 ID 查询启用用户（不存在或已删除则抛错）。 @param id 用户 ID @returns 用户 */
	async findOne(id: number): Promise<SsoUser> {
		const user = await this.userRepo.findOne({ where: { id, deleted: 0 } })
		if (!user) throw new NotFoundException('用户不存在')
		if (user.status === 0) throw new NotFoundException('该用户已被禁用')
		return user
	}

	/** 查询用户角色码。 @param userId 用户 ID @returns 角色码数组 */
	async findRoleCodesByUserId(userId: number): Promise<string[]> {
		const roles = await this.roleRepo
			.createQueryBuilder('role')
			.innerJoin('role.users', 'user', 'user.id = :userId', { userId })
			.where('role.deleted = 0')
			.andWhere('role.status = 1')
			.orderBy('role.order', 'ASC')
			.getMany()
		return roles.map((role) => role.code)
	}

	/** 查询用户 monitor 权限码（来自角色关联的菜单与按钮）。 @param userId 用户 ID @returns 权限码数组 */
	async findPermissionCodesByUserId(userId: number): Promise<string[]> {
		const rows = await this.roleRepo
			.createQueryBuilder('role')
			.innerJoin('role.users', 'user', 'user.id = :userId', { userId })
			.leftJoinAndSelect('role.menus', 'menu')
			.where('role.deleted = 0')
			.andWhere('role.status = 1')
			.andWhere('menu.deleted = 0')
			.andWhere('menu.appId = :appId', { appId: MONITOR_APP_ID })
			.getMany()
		const codes = new Set<string>()
		for (const role of rows) {
			for (const menu of role.menus ?? []) {
				if (menu.deleted === 0 && menu.authCode) codes.add(menu.authCode)
			}
		}
		return [...codes]
	}

	/** 判断用户是否拥有启用的系统角色。 @param userId 用户 ID @returns 是否为系统角色 */
	async hasSystemRole(userId: number): Promise<boolean> {
		const user = await this.userRepo.findOne({
			where: { id: userId, deleted: 0 },
			relations: { roles: true },
		})
		return (
			user?.roles.some(
				(role) => Boolean(role.isSystem) && role.deleted === 0 && role.status === 1,
			) ?? false
		)
	}

	/** 获取当前用户资料。 @param userId 用户 ID @returns 用户资料 */
	async getProfile(userId: number): Promise<UserProfile> {
		const user = await this.findOne(userId)
		const roles = await this.findRoleCodesByUserId(userId)
		const permissions = await this.findPermissionCodesByUserId(userId)
		return {
			id: user.id,
			username: user.username,
			nickname: user.nickname ?? user.username,
			roles,
			permissions,
		}
	}
}
