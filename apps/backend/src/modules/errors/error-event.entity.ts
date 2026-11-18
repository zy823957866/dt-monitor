import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'
import { eventPrimaryColumnType } from '../../common/entities/primary-column'

/** 错误样本事件。 */
@Entity('monitor_error_event')
export class ErrorEvent {
	@PrimaryGeneratedColumn({ type: eventPrimaryColumnType })
	id!: number

	@Column({ name: 'event_id', length: 64, unique: true })
	eventId!: string

	@Column({ name: 'project_id', type: 'int' })
	projectId!: number

	@Column({ name: 'issue_id', type: 'int' })
	issueId!: number

	@Column({ length: 1000 })
	message!: string

	@Column({ name: 'stack', type: 'text', nullable: true })
	stack?: string

	@Column({ name: 'trace_id', length: 64, nullable: true })
	traceId?: string

	@Column({ name: 'replay_id', length: 64, nullable: true })
	replayId?: string

	@Column({ name: 'page_path', length: 255, nullable: true })
	pagePath?: string

	@Column({ length: 30, nullable: true })
	environment?: string

	@Column({ length: 50, nullable: true })
	release?: string

	@Column({ type: 'json', nullable: true })
	context?: Record<string, unknown>

	@Column({ name: 'occurred_at', type: 'datetime' })
	occurredAt!: Date
}
