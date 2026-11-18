import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import { eventPrimaryColumnType } from '../../common/entities/primary-column'

/** 埋点事件事实表。 */
@Entity('monitor_analytics_event')
@Index('IDX_monitor_analytics_event', ['projectId', 'eventId'], {
	unique: true,
})
export class AnalyticsEvent {
	@PrimaryGeneratedColumn({ type: eventPrimaryColumnType })
	id!: number

	@Column({ name: 'project_id', type: 'int' })
	projectId!: number

	@Column({ name: 'event_id', length: 64 })
	eventId!: string

	@Column({ name: 'event_name', length: 64 })
	eventName!: string

	@Column({ name: 'event_type', length: 30, default: 'custom' })
	eventType!: string

	@Column({ name: 'distinct_id', length: 64, nullable: true })
	distinctId?: string

	@Column({ name: 'session_id', length: 64, nullable: true })
	sessionId?: string

	@Column({ name: 'page_path', length: 255 })
	pagePath!: string

	@Column({ length: 30, nullable: true })
	environment?: string

	@Column({ length: 50, nullable: true })
	release?: string

	@Column({ type: 'json', nullable: true })
	properties?: Record<string, unknown>

	@Column({ name: 'occurred_at', type: 'datetime' })
	occurredAt!: Date
}
