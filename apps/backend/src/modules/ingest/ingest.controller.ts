import { Body, Controller, HttpCode, Param, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { Public } from '../../common/decorators/public.decorator'
import { IngestService } from './ingest.service'
import type { IngestResult } from './ingest.types'

/** 浏览器 SDK 公开批量上报接口。 */
@Public()
@ApiTags('ingest')
@Controller('ingest/v1')
export class IngestController {
	constructor(private readonly ingestService: IngestService) {}

	/**
	 * 接收浏览器错误、性能、埋点、页面浏览和 Span 事件。
	 * @param projectId 项目 ID
	 * @param key DSN public key
	 * @param payload 事件批次
	 * @returns 写入计数
	 */
	@Post(':projectId')
	@HttpCode(202)
	@ApiOperation({ summary: '浏览器事件批量上报' })
	ingest(
		@Param('projectId') projectId: string,
		@Query('key') key: string,
		@Body() payload: unknown,
	): Promise<IngestResult> {
		return this.ingestService.ingest(Number(projectId), key, payload)
	}
}
