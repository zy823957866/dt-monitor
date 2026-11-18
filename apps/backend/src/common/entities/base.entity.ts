import { Column, CreateDateColumn, UpdateDateColumn } from 'typeorm'

/** 审计基类：创建/更新时间与逻辑删除标记。 */
export abstract class BaseEntity {
	@CreateDateColumn({ name: 'create_time' })
	createTime!: Date

	@UpdateDateColumn({ name: 'update_time' })
	updateTime!: Date

	@Column({ name: 'deleted', type: 'tinyint', default: 0 })
	deleted!: number
}
