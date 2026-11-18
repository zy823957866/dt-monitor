import {
	Column,
	CreateDateColumn,
	Entity,
	JoinTable,
	ManyToMany,
	PrimaryColumn,
	UpdateDateColumn,
} from 'typeorm'
import { bigintToNumberTransformer } from '../auth-columns'
import { SsoRole } from './sso-role.entity'

/** 统一认证库应用（映射 dt_frames.sys_app，只读）。 */
@Entity('sys_app')
export class SsoApp {
	/** 应用 ID（bigint 转 number） */
	@PrimaryColumn({ type: 'bigint', transformer: bigintToNumberTransformer })
	id!: number

	/** 应用名称 */
	@Column({ length: 50 })
	name!: string

	/** 应用编码，同时作为 OIDC client_id */
	@Column({ length: 50 })
	code!: string

	/** 图标 base64 */
	@Column({ type: 'text', nullable: true })
	icon?: string

	/** 图标名称 */
	@Column({ name: 'icon_name', length: 500, nullable: true })
	iconName?: string

	/** 排序 */
	@Column({ type: 'int', default: 999 })
	order!: number

	/** 状态：1 启用，0 禁用 */
	@Column({ type: 'tinyint', default: 1 })
	status!: number

	/** 描述 */
	@Column({ length: 200, nullable: true })
	description?: string

	/** 分类 */
	@Column({ length: 50, nullable: true })
	category?: string

	/** 访问路径 */
	@Column({ length: 255, nullable: true })
	path?: string

	/** 应用基址 */
	@Column({ name: 'base_url', length: 255, nullable: true })
	baseUrl?: string

	/** 打开方式：tab / iframe */
	@Column({ name: 'open_mode', length: 10, nullable: true })
	openMode?: string

	/** 主题色 */
	@Column({ name: 'theme_color', length: 20, nullable: true })
	themeColor?: string

	/** 入口类型：app / scaffold */
	@Column({ name: 'entry_type', length: 20, default: 'app' })
	entryType!: string

	/** 模板编码 */
	@Column({ name: 'template_code', length: 20, nullable: true })
	templateCode?: string

	/** 是否内置应用 */
	@Column({ name: 'is_builtin', type: 'tinyint', default: 0 })
	isBuiltin!: number

	/** 创建时间 */
	@CreateDateColumn({ name: 'create_time' })
	createTime!: Date

	/** 更新时间 */
	@UpdateDateColumn({ name: 'update_time' })
	updateTime!: Date

	/** 逻辑删除标记 */
	@Column({ type: 'tinyint', default: 0 })
	deleted!: number

	/** 可访问该应用的角色 */
	@ManyToMany(() => SsoRole)
	@JoinTable({
		name: 'sys_app_role',
		joinColumn: { name: 'app_id', referencedColumnName: 'id' },
		inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
	})
	roles!: SsoRole[]
}
