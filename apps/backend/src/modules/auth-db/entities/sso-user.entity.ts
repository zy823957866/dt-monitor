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

/** 统一认证库用户（映射 dt_frames.sys_user，只读）。 */
@Entity('sys_user')
export class SsoUser {
	/** 用户 ID（bigint 转 number） */
	@PrimaryColumn({ type: 'bigint', transformer: bigintToNumberTransformer })
	id!: number

	/** 登录账号 */
	@Column({ length: 100 })
	username!: string

	/** 昵称 */
	@Column({ length: 100, nullable: true })
	nickname?: string

	/** 邮箱 */
	@Column({ length: 100, nullable: true })
	email?: string

	/** 手机号 */
	@Column({ length: 20, nullable: true })
	phone?: string

	/** 头像地址 */
	@Column({ length: 255, nullable: true })
	avatar?: string

	/** 状态：1 启用，0 禁用 */
	@Column({ type: 'tinyint', default: 1 })
	status!: number

	/** 是否系统内置用户 */
	@Column({ name: 'is_system', type: 'tinyint', default: 0 })
	isSystem!: number

	/** 创建时间 */
	@CreateDateColumn({ name: 'create_time' })
	createTime!: Date

	/** 更新时间 */
	@UpdateDateColumn({ name: 'update_time' })
	updateTime!: Date

	/** 逻辑删除标记：0 未删除，1 已删除 */
	@Column({ type: 'tinyint', default: 0 })
	deleted!: number

	/** 用户角色 */
	@ManyToMany(() => SsoRole, (role) => role.users)
	@JoinTable({
		name: 'sys_user_role',
		joinColumn: { name: 'user_id', referencedColumnName: 'id' },
		inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
	})
	roles!: SsoRole[]
}
