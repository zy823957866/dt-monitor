import { Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { DataSource } from 'typeorm'
import { Public } from '../../common/decorators/public.decorator'
import { RedisService } from '../../redis/redis.service'

/** 健康检查接口。 */
@ApiTags('health')
@Controller('health')
export class HealthController {
	constructor(
		private readonly dataSource: DataSource,
		private readonly redis: RedisService,
	) {}

	@Public()
	@Get()
	@ApiOperation({ summary: '存活与依赖检查' })
	async health(): Promise<{
		status: 'ok' | 'degraded'
		database: boolean
		redis: boolean
		timestamp: string
	}> {
		const database = this.dataSource.isInitialized
		const redis = await this.redis.ping()
		return {
			status: database && redis ? 'ok' : 'degraded',
			database,
			redis,
			timestamp: new Date().toISOString(),
		}
	}
}
