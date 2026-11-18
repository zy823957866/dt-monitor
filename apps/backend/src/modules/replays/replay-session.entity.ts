import { Column, Entity, PrimaryColumn } from 'typeorm'

/** Replay 会话索引。 */
@Entity('monitor_replay_session')
export class ReplaySession {
	@PrimaryColumn({ name: 'replay_id', length: 64 })
	replayId!: string

	@Column({ name: 'project_id', type: 'int' })
	projectId!: number

	@Column({ name: 'session_id', length: 64 })
	sessionId!: string

	@Column({ name: 'distinct_id', length: 64, nullable: true })
	distinctId?: string

	@Column({ name: 'page_path', length: 255 })
	pagePath!: string

	@Column({ length: 30, nullable: true })
	environment?: string

	@Column({ length: 50, nullable: true })
	release?: string

	@Column({ name: 'duration_ms', type: 'int' })
	durationMs!: number

	@Column({ name: 'size_bytes', type: 'int', default: 0 })
	sizeBytes!: number

	@Column({ name: 'event_count', type: 'int', default: 0 })
	eventCount!: number

	@Column({ name: 'error_count', type: 'int', default: 0 })
	errorCount!: number

	@Column({ name: 'sampling_reason', length: 50, default: 'session' })
	samplingReason!: string

	@Column({ name: 'started_at', type: 'datetime' })
	startedAt!: Date

	@Column({ name: 'trace_id', length: 64, nullable: true })
	traceId?: string
}
