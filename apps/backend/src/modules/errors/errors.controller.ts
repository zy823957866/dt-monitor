import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { ErrorsService } from './errors.service'
import {
	ErrorQueryDto,
	QueryErrorEventDto,
	QueryIssueDto,
	UpdateIssueDto,
} from './dto/query-errors.dto'

/** 错误监控接口。 */
@ApiTags('monitor-errors')
@ApiBearerAuth()
@Controller('monitor/errors')
export class ErrorsController {
	constructor(private readonly errorsService: ErrorsService) {}

	@Get('trend')
	@RequirePermission('monitor:error:list')
	@ApiOperation({ summary: '错误趋势' })
	trend(@Query() query: ErrorQueryDto) {
		return this.errorsService.trend(query)
	}

	@Get('issues')
	@RequirePermission('monitor:error:list')
	@ApiOperation({ summary: 'Issue 分页列表' })
	issues(@Query() query: QueryIssueDto) {
		return this.errorsService.page(query)
	}

	@Get('issues/:id')
	@RequirePermission('monitor:error:read')
	@ApiOperation({ summary: 'Issue 详情' })
	findOne(@Param('id') id: string) {
		return this.errorsService.findOne(Number(id))
	}

	@Patch('issues/:id')
	@RequirePermission('monitor:error:update')
	@ApiOperation({ summary: '更新 Issue 状态或指派' })
	update(@Param('id') id: string, @Body() dto: UpdateIssueDto) {
		return this.errorsService.update(Number(id), dto)
	}

	@Get('events')
	@RequirePermission('monitor:error:read')
	@ApiOperation({ summary: '错误样本分页列表' })
	events(@Query() query: QueryErrorEventDto) {
		return this.errorsService.events(query)
	}

	@Get('filters')
	@RequirePermission('monitor:error:list')
	@ApiOperation({ summary: '错误筛选元数据' })
	filters(@Query('projectId') projectId?: string) {
		return this.errorsService.filters(projectId ? Number(projectId) : undefined)
	}
}
