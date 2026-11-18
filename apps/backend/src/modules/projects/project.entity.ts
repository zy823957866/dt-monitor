import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/** 监控项目。 */
@Entity('monitor_project')
export class Project {
	@PrimaryGeneratedColumn()
	id!: number

	@Column({ length: 80 })
	name!: string

	@Column({ name: 'app_id', unique: true, length: 80 })
	appId!: string

	@Column({ length: 30, default: 'web' })
	platform!: string

	@Column({ type: 'tinyint', default: 1 })
	status!: number

	@Column({ name: 'environment_count', type: 'int', default: 1 })
	environmentCount!: number

	@Column({ name: 'sdk_version', length: 30, default: '0.2.0' })
	sdkVersion!: string

	@Column({ name: 'event_count', type: 'bigint', default: 0 })
	eventCount!: number

	@Column({ name: 'error_count', type: 'bigint', default: 0 })
	errorCount!: number

	@Column({ name: 'owner_id', type: 'int', nullable: true })
	ownerId?: number | null

	@Column({ length: 500, nullable: true })
	description?: string

	@Column({ type: 'json', nullable: true })
	settings?: Record<string, unknown>

	@CreateDateColumn({ name: 'create_time' })
	createTime!: Date

	@UpdateDateColumn({ name: 'update_time' })
	updateTime!: Date

	@Column({ name: 'deleted', type: 'tinyint', default: 0 })
	deleted!: number
}
