import { Controller, Get, Param, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { QueryReplayDto, ReplaySummaryQueryDto } from './dto/query-replay.dto'
import { ReplaysService } from './replays.service'

/** Replay 查询接口。 */
@ApiTags('monitor-replays')
@ApiBearerAuth()
@Controller('monitor/replays')
export class ReplaysController {
	constructor(private readonly replaysService: ReplaysService) {}

	@Get()
	@RequirePermission('monitor:replay:view')
	@ApiOperation({ summary: 'Replay 分页列表' })
	page(@Query() query: QueryReplayDto) {
		return this.replaysService.page(query)
	}

	@Get('summary')
	@RequirePermission('monitor:replay:view')
	@ApiOperation({ summary: 'Replay 汇总统计' })
	summary(@Query() query: ReplaySummaryQueryDto) {
		return this.replaysService.summary(query)
	}

	@Get('filters')
	@RequirePermission('monitor:replay:view')
	@ApiOperation({ summary: 'Replay 筛选元数据' })
	filters(@Query('projectId') projectId?: string) {
		return this.replaysService.filters(projectId ? Number(projectId) : undefined)
	}

	@Get(':replayId')
	@RequirePermission('monitor:replay:read')
	@ApiOperation({ summary: 'Replay 详情' })
	detail(@Param('replayId') replayId: string) {
		return this.replaysService.detail(replayId)
	}
}
