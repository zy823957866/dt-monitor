import { Body, Controller, Headers, HttpCode, Param, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { Public } from '../../common/decorators/public.decorator'
import { ReplayIngestService } from './replay-ingest.service'

/** Session Replay gzip 分片上传接口。 */
@Public()
@ApiTags('ingest')
@Controller('replay/v1')
export class ReplayController {
	constructor(private readonly replayIngestService: ReplayIngestService) {}

	/**
	 * 接收一个带校验和的 gzip rrweb 分片。
	 * @param projectId 项目 ID
	 * @param replayId Replay ID
	 * @param sequence 分片序号
	 * @param key browser key
	 * @param sessionId 浏览器会话 ID
	 * @param checksum 压缩字节 FNV-1a 校验和
	 * @param body gzip 二进制内容
	 * @param contentType 内容类型
	 * @param contentEncoding 内容编码
	 */
	@Post(':projectId/:replayId/chunks/:sequence')
	@HttpCode(204)
	@ApiOperation({ summary: 'Replay gzip 分片上传' })
	async upload(
		@Param('projectId') projectId: string,
		@Param('replayId') replayId: string,
		@Param('sequence') sequence: string,
		@Query('key') key: string,
		@Query('sessionId') sessionId: string,
		@Query('checksum') checksum: string,
		@Body() body: unknown,
		@Headers('content-type') contentType?: string,
		@Headers('content-encoding') contentEncoding?: string,
	): Promise<void> {
		await this.replayIngestService.upload(
			Number(projectId),
			decodeURIComponent(replayId),
			Number(sequence),
			{ key, sessionId, checksum },
			body,
			contentType,
			contentEncoding,
		)
	}
}
