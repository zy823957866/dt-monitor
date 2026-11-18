import type { MigrationInterface, QueryRunner } from 'typeorm'

/** 为浏览器事件幂等写入补充事件 ID 与 Span 唯一约束。 */
export class AddIngestEventIds1763337604000 implements MigrationInterface {
	name = 'AddIngestEventIds1763337604000'

	/** @param queryRunner 迁移执行器 */
	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			'ALTER TABLE `monitor_performance_metric` ADD COLUMN `event_id` varchar(64) NOT NULL AFTER `project_id`',
		)
		await queryRunner.query(
			'CREATE UNIQUE INDEX `IDX_monitor_performance_event` ON `monitor_performance_metric` (`project_id`, `event_id`)',
		)
		await queryRunner.query(
			'ALTER TABLE `monitor_analytics_event` ADD COLUMN `event_id` varchar(64) NOT NULL AFTER `project_id`',
		)
		await queryRunner.query(
			'CREATE UNIQUE INDEX `IDX_monitor_analytics_event` ON `monitor_analytics_event` (`project_id`, `event_id`)',
		)
		await queryRunner.query(
			'CREATE UNIQUE INDEX `IDX_monitor_span_unique` ON `monitor_span` (`project_id`, `span_id`)',
		)
	}

	/** @param queryRunner 迁移执行器 */
	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			'ALTER TABLE `monitor_performance_metric` DROP INDEX `IDX_monitor_performance_event`',
		)
		await queryRunner.query(
			'ALTER TABLE `monitor_performance_metric` DROP COLUMN `event_id`',
		)
		await queryRunner.query(
			'ALTER TABLE `monitor_analytics_event` DROP INDEX `IDX_monitor_analytics_event`',
		)
		await queryRunner.query(
			'ALTER TABLE `monitor_analytics_event` DROP COLUMN `event_id`',
		)
		await queryRunner.query(
			'ALTER TABLE `monitor_span` DROP INDEX `IDX_monitor_span_unique`',
		)
	}
}
