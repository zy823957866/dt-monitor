import { Controller, Get, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { OverviewQueryDto } from './dto/overview-query.dto'
import { OverviewService } from './overview.service'

/** 监控概览接口。 */
@ApiTags('monitor-overview')
@ApiBearerAuth()
@Controller('monitor/overview')
export class OverviewController {
	constructor(private readonly overviewService: OverviewService) {}

	@Get('summary')
	@RequirePermission('monitor:overview:view')
	@ApiOperation({ summary: '监控概览聚合数据' })
	summary(@Query() query: OverviewQueryDto) {
		return this.overviewService.summary(query)
	}
}
