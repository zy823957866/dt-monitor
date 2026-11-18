import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

/** 错误 Issue 聚合。 */
@Entity('monitor_issue')
export class Issue {
	@PrimaryGeneratedColumn()
	id!: number

	@Column({ name: 'project_id', type: 'int' })
	projectId!: number

	@Column({ length: 64, unique: true })
	fingerprint!: string

	@Column({ length: 1000 })
	message!: string

	@Column({ length: 80, default: 'TypeError' })
	type!: string

	@Column({ length: 20, default: 'error' })
	level!: string

	@Column({ length: 20, default: 'open' })
	status!: string

	@Column({ name: 'event_count', type: 'int', default: 0 })
	eventCount!: number

	@Column({ name: 'user_count', type: 'int', default: 0 })
	userCount!: number

	@Column({ name: 'first_seen', type: 'datetime' })
	firstSeen!: Date

	@Column({ name: 'last_seen', type: 'datetime' })
	lastSeen!: Date

	@Column({ name: 'page_path', length: 255, nullable: true })
	pagePath?: string

	@Column({ name: 'release', length: 50, nullable: true })
	release?: string

	@Column({ name: 'environment', length: 30, nullable: true })
	environment?: string

	@Column({ length: 255, nullable: true })
	culprit?: string

	@Column({ name: 'trace_id', length: 64, nullable: true })
	traceId?: string

	@Column({ name: 'replay_id', length: 64, nullable: true })
	replayId?: string

	@Column({ name: 'assignee_id', type: 'int', nullable: true })
	assigneeId?: number | null

	@Column({ type: 'json', nullable: true })
	metadata?: Record<string, unknown>
}
