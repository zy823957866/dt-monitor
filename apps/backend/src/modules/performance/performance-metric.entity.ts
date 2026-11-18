import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import { eventPrimaryColumnType } from '../../common/entities/primary-column'

/** Web Vitals / 长任务指标事实表（当前管理 API 使用 MySQL 事实表，ClickHouse 迁移在数据面阶段完成）。 */
@Entity('monitor_performance_metric')
@Index('IDX_monitor_performance_event', ['projectId', 'eventId'], {
	unique: true,
})
export class PerformanceMetric {
	@PrimaryGeneratedColumn({ type: eventPrimaryColumnType })
	id!: number

	@Column({ name: 'project_id', type: 'int' })
	projectId!: number

	@Column({ name: 'event_id', length: 64 })
	eventId!: string

	@Column({ name: 'metric_name', length: 20 })
	metricName!: string

	@Column({ type: 'double' })
	value!: number

	@Column({ length: 30, default: 'good' })
	rating!: string

	@Column({ name: 'page_path', length: 255 })
	pagePath!: string

	@Column({ length: 30, nullable: true })
	environment?: string

	@Column({ length: 50, nullable: true })
	release?: string

	@Column({ length: 30, nullable: true })
	browser?: string

	@Column({ length: 30, nullable: true })
	os?: string

	@Column({ name: 'device_type', length: 30, nullable: true })
	deviceType?: string

	@Column({ name: 'recorded_at', type: 'datetime' })
	recordedAt!: Date
}
