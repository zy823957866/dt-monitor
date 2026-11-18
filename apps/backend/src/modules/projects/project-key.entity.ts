import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'

/** 项目公开上报 key / 服务端 OTLP key。 */
@Entity('monitor_project_key')
export class ProjectKey {
	@PrimaryGeneratedColumn()
	id!: number

	@Column({ name: 'project_id', type: 'int' })
	projectId!: number

	@Column({ name: 'key_type', length: 20 })
	keyType!: 'browser' | 'server'

	@Column({ name: 'key_value', unique: true, length: 100 })
	keyValue!: string

	@Column({ type: 'tinyint', default: 1 })
	status!: number

	@CreateDateColumn({ name: 'create_time' })
	createTime!: Date
}
