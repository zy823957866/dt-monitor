import {
	Column,
	CreateDateColumn,
	Entity,
	PrimaryColumn,
	UpdateDateColumn,
} from 'typeorm'

/** 统一认证库菜单与按钮权限（映射 dt_frames.sys_menu，只读）。 */
@Entity('sys_menu')
export class SsoMenu {
	/** 菜单 ID（32 位字符串） */
	@PrimaryColumn({ type: 'varchar', length: 32 })
	id!: string

	/** 所属应用编码 */
	@Column({ name: 'app_id', length: 32 })
	appId!: string

	/** 中文名称 */
	@Column({ name: 'zh_cn_name', length: 100 })
	zhCnName!: string

	/** 英文名称 */
	@Column({ name: 'en_name', length: 100, nullable: true })
	enName?: string

	/** 上级菜单 ID */
	@Column({ name: 'parent_id', type: 'varchar', length: 32, nullable: true })
	parentId?: string | null

	/** 类型：catalog / menu / button */
	@Column({ length: 20 })
	type!: string

	/** 路由路径 */
	@Column({ length: 255, nullable: true })
	path?: string

	/** 图标 base64 */
	@Column({ type: 'text', nullable: true })
	icon?: string

	/** 图标名称 */
	@Column({ name: 'icon_name', length: 500, nullable: true })
	iconName?: string

	/** 排序 */
	@Column({ type: 'int', default: 999 })
	order!: number

	/** 是否在菜单中隐藏 */
	@Column({ name: 'hide_in_menu', type: 'tinyint', default: 0 })
	hideInMenu!: number

	/** 权限码 */
	@Column({ name: 'auth_code', length: 100, nullable: true })
	authCode?: string

	/** 是否缓存标签页 */
	@Column({ name: 'keep_alive', type: 'tinyint', default: 0 })
	keepAlive!: number

	/** 是否固定标签页 */
	@Column({ name: 'affix_tab', type: 'tinyint', default: 0 })
	affixTab!: number

	/** 是否隐藏面包屑 */
	@Column({ name: 'hide_in_breadcrumb', type: 'tinyint', default: 0 })
	hideInBreadcrumb!: number

	/** 是否隐藏标签页 */
	@Column({ name: 'hide_in_tab', type: 'tinyint', default: 0 })
	hideInTab!: number

	/** 创建时间 */
	@CreateDateColumn({ name: 'create_time' })
	createTime!: Date

	/** 更新时间 */
	@UpdateDateColumn({ name: 'update_time' })
	updateTime!: Date

	/** 逻辑删除标记 */
	@Column({ type: 'tinyint', default: 0 })
	deleted!: number
}
