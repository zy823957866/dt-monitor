import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

/** 告警触发历史。 */
@Entity('monitor_alert_history')
export class AlertHistory {
	@PrimaryGeneratedColumn()
	id!: number

	@Column({ name: 'project_id', type: 'int' })
	projectId!: number

	@Column({ name: 'rule_id', type: 'int' })
	ruleId!: number

	@Column({ length: 20 })
	status!: string

	@Column({ length: 500 })
	message!: string

	@Column({ name: 'triggered_at', type: 'datetime' })
	triggeredAt!: Date

	@Column({ name: 'resolved_at', type: 'datetime', nullable: true })
	resolvedAt?: Date
}
