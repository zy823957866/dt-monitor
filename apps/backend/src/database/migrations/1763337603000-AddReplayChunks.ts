import type { MigrationInterface, QueryRunner } from 'typeorm'

const CREATE_TABLE = `CREATE TABLE \`monitor_replay_chunk\` (
	\`id\` bigint NOT NULL AUTO_INCREMENT,
	\`project_id\` int NOT NULL,
	\`replay_id\` varchar(64) NOT NULL,
	\`sequence\` int NOT NULL,
	\`session_id\` varchar(64) NOT NULL,
	\`storage_key\` varchar(500) NOT NULL,
	\`raw_size\` int NOT NULL,
	\`compressed_size\` int NOT NULL,
	\`event_count\` int NOT NULL DEFAULT 0,
	\`checksum\` varchar(64) NOT NULL,
	\`mask_version\` varchar(30) NOT NULL DEFAULT '1.0.0',
	\`truncated\` tinyint NOT NULL DEFAULT 0,
	\`captured_from\` datetime NOT NULL,
	\`captured_to\` datetime NOT NULL,
	\`received_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	PRIMARY KEY (\`id\`),
	UNIQUE INDEX \`IDX_monitor_replay_chunk_unique\` (\`project_id\`, \`replay_id\`, \`sequence\`),
	INDEX \`IDX_monitor_replay_chunk_replay\` (\`project_id\`, \`replay_id\`, \`sequence\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`

/** Replay 分片索引 migration。 */
export class AddReplayChunks1763337603000 implements MigrationInterface {
	name = 'AddReplayChunks1763337603000'

	/** @param queryRunner 迁移执行器 */
	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(CREATE_TABLE)
	}

	/** @param queryRunner 迁移执行器 */
	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query('DROP TABLE IF EXISTS `monitor_replay_chunk`')
	}
}
