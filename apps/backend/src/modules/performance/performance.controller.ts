import { Controller, Get, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import {
	PerformanceQueryDto,
	PerformanceTrendQueryDto,
	SlowPageQueryDto,
} from './dto/query-performance.dto'
import { PerformanceService } from './performance.service'

/** 性能监控接口。 */
@ApiTags('monitor-performance')
@ApiBearerAuth()
@Controller('monitor/performance')
export class PerformanceController {
	constructor(private readonly performanceService: PerformanceService) {}

	@Get('summary')
	@RequirePermission('monitor:performance:view')
	@ApiOperation({ summary: 'Web Vitals 指标摘要' })
	summary(@Query() query: PerformanceQueryDto) {
		return this.performanceService.summary(query)
	}

	@Get('timeseries')
	@RequirePermission('monitor:performance:view')
	@ApiOperation({ summary: '性能指标趋势' })
	timeseries(@Query() query: PerformanceTrendQueryDto) {
		return this.performanceService.timeseries(query)
	}

	@Get('pages')
	@RequirePermission('monitor:performance:view')
	@ApiOperation({ summary: '慢页面 Top N' })
	pages(@Query() query: SlowPageQueryDto) {
		return this.performanceService.pages(query)
	}

	@Get('long-tasks')
	@RequirePermission('monitor:performance:view')
	@ApiOperation({ summary: '长任务分析' })
	longTasks(@Query() query: PerformanceQueryDto) {
		return this.performanceService.longTasks(query)
	}

	@Get('filters')
	@RequirePermission('monitor:performance:view')
	@ApiOperation({ summary: '性能筛选元数据' })
	filters(@Query('projectId') projectId?: string) {
		return this.performanceService.filters(projectId ? Number(projectId) : undefined)
	}
}
