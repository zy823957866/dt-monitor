import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/** 告警规则。 */
@Entity('monitor_alert_rule')
export class AlertRule {
	@PrimaryGeneratedColumn()
	id!: number

	@Column({ name: 'project_id', type: 'int' })
	projectId!: number

	@Column({ length: 120 })
	name!: string

	@Column({ length: 30 })
	metric!: string

	@Column({ length: 10, default: '>' })
	comparator!: string

	@Column({ type: 'double' })
	threshold!: number

	@Column({ name: 'window_minutes', type: 'int', default: 10 })
	windowMinutes!: number

	@Column({ name: 'cooldown_minutes', type: 'int', default: 30 })
	cooldownMinutes!: number

	@Column({ length: 50, default: 'webhook' })
	channel!: string

	@Column({ length: 20, default: 'active' })
	status!: string

	@Column({ name: 'condition_summary', length: 255 })
	conditionSummary!: string

	@Column({ name: 'last_triggered_at', type: 'datetime', nullable: true })
	lastTriggeredAt?: Date

	@CreateDateColumn({ name: 'create_time' })
	createTime!: Date

	@UpdateDateColumn({ name: 'update_time' })
	updateTime!: Date

	@Column({ name: 'deleted', type: 'tinyint', default: 0 })
	deleted!: number
}
