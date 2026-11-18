import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import { eventPrimaryColumnType } from '../../common/entities/primary-column'

/** 已持久化的 Replay gzip 分片索引。 */
@Entity('monitor_replay_chunk')
@Index('IDX_monitor_replay_chunk_unique', ['projectId', 'replayId', 'sequence'], { unique: true })
export class ReplayChunk {
	@PrimaryGeneratedColumn({ type: eventPrimaryColumnType })
	id!: number

	@Column({ name: 'project_id', type: 'int' })
	projectId!: number

	@Column({ name: 'replay_id', length: 64 })
	replayId!: string

	@Column({ type: 'int' })
	sequence!: number

	@Column({ name: 'session_id', length: 64 })
	sessionId!: string

	@Column({ name: 'storage_key', length: 500 })
	storageKey!: string

	@Column({ name: 'raw_size', type: 'int' })
	rawSize!: number

	@Column({ name: 'compressed_size', type: 'int' })
	compressedSize!: number

	@Column({ name: 'event_count', type: 'int', default: 0 })
	eventCount!: number

	@Column({ length: 64 })
	checksum!: string

	@Column({ name: 'mask_version', length: 30, default: '1.0.0' })
	maskVersion!: string

	@Column({ type: 'tinyint', default: 0 })
	truncated!: number

	@Column({ name: 'captured_from', type: 'datetime' })
	capturedFrom!: Date

	@Column({ name: 'captured_to', type: 'datetime' })
	capturedTo!: Date

	@CreateDateColumn({ name: 'received_at' })
	receivedAt!: Date
}
