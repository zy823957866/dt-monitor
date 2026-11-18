import {
	Column,
	CreateDateColumn,
	Entity,
	JoinTable,
	ManyToMany,
	PrimaryColumn,
	UpdateDateColumn,
} from 'typeorm'
import { bigintToNumberTransformer, bitToBooleanTransformer, isSystemColumnType } from '../auth-columns'
import { SsoMenu } from './sso-menu.entity'
import { SsoUser } from './sso-user.entity'

/** 统一认证库角色（映射 dt_frames.sys_role，只读）。 */
@Entity('sys_role')
export class SsoRole {
	/** 角色 ID（bigint 转 number） */
	@PrimaryColumn({ type: 'bigint', transformer: bigintToNumberTransformer })
	id!: number

	/** 角色编码 */
	@Column({ unique: true, length: 50 })
	code!: string

	/** 角色名称 */
	@Column({ length: 50 })
	name!: string

	/** 排序 */
	@Column({ type: 'int', default: 999 })
	order!: number

	/** 状态：1 启用，0 禁用 */
	@Column({ type: 'tinyint', default: 1 })
	status!: number

	/** 是否系统内置角色（bit(1) 转 boolean） */
	@Column({
		name: 'is_system',
		type: isSystemColumnType(),
		transformer: bitToBooleanTransformer,
	})
	isSystem!: boolean

	/** 描述 */
	@Column({ length: 200, nullable: true })
	description?: string

	/** 创建时间 */
	@CreateDateColumn({ name: 'create_time' })
	createTime!: Date

	/** 更新时间 */
	@UpdateDateColumn({ name: 'update_time' })
	updateTime!: Date

	/** 逻辑删除标记：0 未删除，1 已删除 */
	@Column({ type: 'tinyint', default: 0 })
	deleted!: number

	/** 角色用户 */
	@ManyToMany(() => SsoUser, (user) => user.roles)
	users!: SsoUser[]

	/** 角色菜单与按钮权限 */
	@ManyToMany(() => SsoMenu)
	@JoinTable({
		name: 'sys_role_menu',
		joinColumn: { name: 'role_id', referencedColumnName: 'id' },
		inverseJoinColumn: { name: 'menu_id', referencedColumnName: 'id' },
	})
	menus!: SsoMenu[]
}
