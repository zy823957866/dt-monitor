import { Controller, Get, Param, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { QueryTraceDto, TraceSummaryQueryDto } from './dto/query-trace.dto'
import { TracingService } from './tracing.service'

/** Trace 查询接口。 */
@ApiTags('monitor-traces')
@ApiBearerAuth()
@Controller('monitor/traces')
export class TracingController {
	constructor(private readonly tracingService: TracingService) {}

	@Get()
	@RequirePermission('monitor:trace:view')
	@ApiOperation({ summary: 'Trace 分页列表' })
	page(@Query() query: QueryTraceDto) {
		return this.tracingService.page(query)
	}

	@Get('summary')
	@RequirePermission('monitor:trace:view')
	@ApiOperation({ summary: 'Trace 汇总统计' })
	summary(@Query() query: TraceSummaryQueryDto) {
		return this.tracingService.summary(query)
	}

	@Get('filters')
	@RequirePermission('monitor:trace:view')
	@ApiOperation({ summary: 'Trace 筛选元数据' })
	filters(@Query('projectId') projectId?: string) {
		return this.tracingService.filters(projectId ? Number(projectId) : undefined)
	}

	@Get(':traceId')
	@RequirePermission('monitor:trace:read')
	@ApiOperation({ summary: 'Trace 详情' })
	detail(@Param('traceId') traceId: string) {
		return this.tracingService.detail(traceId)
	}

	@Get(':traceId/spans')
	@RequirePermission('monitor:trace:read')
	@ApiOperation({ summary: 'Trace Span 列表' })
	async spans(@Param('traceId') traceId: string) {
		return (await this.tracingService.detail(traceId)).spans
	}
}
