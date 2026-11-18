import { randomBytes } from 'node:crypto'
import type { MigrationInterface, QueryRunner } from 'typeorm'

/** 初始化 dt-monitor 默认项目与上报 key；登录、用户、角色和菜单由 dt_frames 统一管理。 */
export class SeedMonitorAdmin1763337601000 implements MigrationInterface {
	name = 'SeedMonitorAdmin1763337601000'

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			'INSERT INTO `monitor_project` (`id`, `name`, `app_id`, `platform`, `status`, `environment_count`, `sdk_version`, `owner_id`, `description`, `settings`, `deleted`) VALUES (1, ?, ?, ?, 1, 1, ?, 1, ?, ?, 0)',
			[
				'默认监控项目',
				'monitor-demo',
				'web',
				'0.2.0',
				'可在项目管理中修改项目名称、采样与留存配置。',
				JSON.stringify({
					errorSampleRate: 1,
					performanceSampleRate: 0.1,
					analyticsSampleRate: 1,
					traceSampleRate: 0.1,
					replaySessionSampleRate: 0.01,
					replayErrorSampleRate: 1,
					retentionDays: 90,
					replayRetentionDays: 30,
				}),
			],
		)
		await queryRunner.query(
			"INSERT INTO `monitor_project_key` (`project_id`, `key_type`, `key_value`, `status`) VALUES (1, 'browser', ?, 1), (1, 'server', ?, 1)",
			[`mk_${randomBytes(18).toString('hex')}`, `mk_${randomBytes(18).toString('hex')}`],
		)
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query('DELETE FROM `monitor_project_key` WHERE `project_id` = 1')
		await queryRunner.query('DELETE FROM `monitor_project` WHERE `id` = 1')
	}
}
