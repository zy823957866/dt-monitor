import { Controller, Get, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import {
	AnalyticsQueryDto,
	QueryAnalyticsEventsDto,
	QueryEventExploreDto,
} from './dto/query-analytics.dto'
import { AnalyticsService } from './analytics.service'

/** 埋点分析接口。 */
@ApiTags('monitor-analytics')
@ApiBearerAuth()
@Controller('monitor')
export class AnalyticsController {
	constructor(private readonly analyticsService: AnalyticsService) {}

	@Get('analytics/summary')
	@RequirePermission('monitor:analytics:view')
	@ApiOperation({ summary: '埋点汇总' })
	summary(@Query() query: AnalyticsQueryDto) {
		return this.analyticsService.summary(query)
	}

	@Get('analytics/trend')
	@RequirePermission('monitor:analytics:view')
	@ApiOperation({ summary: '埋点事件趋势' })
	trend(@Query() query: AnalyticsQueryDto) {
		return this.analyticsService.trend(query)
	}

	@Get('analytics/events')
	@RequirePermission('monitor:analytics:view')
	@ApiOperation({ summary: '聚合事件分页' })
	events(@Query() query: QueryAnalyticsEventsDto) {
		return this.analyticsService.events(query)
	}

	@Get('analytics/funnel')
	@RequirePermission('monitor:analytics:view')
	@ApiOperation({ summary: '转化漏斗' })
	funnel(@Query() query: AnalyticsQueryDto) {
		return this.analyticsService.funnel(query)
	}

	@Get('analytics/filters')
	@RequirePermission('monitor:analytics:view')
	@ApiOperation({ summary: '埋点筛选元数据' })
	filters(@Query('projectId') projectId?: string) {
		return this.analyticsService.filters(projectId ? Number(projectId) : undefined)
	}

	@Get('events/explore')
	@RequirePermission('monitor:event:explore')
	@ApiOperation({ summary: '原始事件探索' })
	explore(@Query() query: QueryEventExploreDto) {
		return this.analyticsService.explore(query)
	}
}
