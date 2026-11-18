import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import { eventPrimaryColumnType } from '../../common/entities/primary-column'

/** Trace Span 事实表。 */
@Entity('monitor_span')
@Index('IDX_monitor_span_unique', ['projectId', 'spanId'], { unique: true })
export class TraceSpan {
	@PrimaryGeneratedColumn({ type: eventPrimaryColumnType })
	id!: number

	@Column({ name: 'project_id', type: 'int' })
	projectId!: number

	@Column({ name: 'trace_id', length: 64 })
	traceId!: string

	@Column({ name: 'span_id', length: 32 })
	spanId!: string

	@Column({ name: 'parent_span_id', length: 32, nullable: true })
	parentSpanId?: string

	@Column({ length: 80 })
	service!: string

	@Column({ length: 255 })
	operation!: string

	@Column({ name: 'span_type', length: 30, default: 'http' })
	spanType!: string

	@Column({ name: 'start_time', type: 'datetime' })
	startTime!: Date

	@Column({ name: 'duration_ms', type: 'double' })
	durationMs!: number

	@Column({ length: 20, default: 'ok' })
	status!: string

	@Column({ length: 30, nullable: true })
	environment?: string

	@Column({ length: 50, nullable: true })
	release?: string

	@Column({ name: 'session_id', length: 64, nullable: true })
	sessionId?: string

	@Column({ name: 'page_path', length: 255, nullable: true })
	pagePath?: string

	@Column({ name: 'is_root', type: 'tinyint', default: 0 })
	isRoot!: number

	@Column({ type: 'json', nullable: true })
	attributes?: Record<string, unknown>
}
