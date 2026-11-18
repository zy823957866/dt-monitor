import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { Public } from '../../common/decorators/public.decorator'
import type { OtlpIngestResult } from './ingest.types'
import { OtlpService } from './otlp.service'

/** OTLP/HTTP JSON Traces 公开接入接口。 */
@Public()
@ApiTags('ingest')
@Controller('otlp/v1')
export class OtlpController {
	constructor(private readonly otlpService: OtlpService) {}

	/**
	 * 接收标准 OTLP/HTTP JSON traces。
	 * @param key 服务端 OTLP key
	 * @param body OTLP ExportTraceServiceRequest JSON
	 * @returns 写入计数
	 */
	@Post('traces')
	@HttpCode(202)
	@ApiOperation({ summary: 'OTLP/HTTP JSON Traces 接入' })
	traces(
		@Headers('x-dt-monitor-key') key: string,
		@Body() body: unknown,
	): Promise<OtlpIngestResult> {
		return this.otlpService.ingest(key, body)
	}
}
