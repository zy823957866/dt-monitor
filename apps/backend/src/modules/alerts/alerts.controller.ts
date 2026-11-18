import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { AlertsService } from './alerts.service'
import {
	CreateAlertRuleDto,
	QueryAlertHistoryDto,
	QueryAlertRuleDto,
	UpdateAlertRuleDto,
} from './dto/alert.dto'

/** 告警中心接口。 */
@ApiTags('monitor-alerts')
@ApiBearerAuth()
@Controller('monitor/alerts')
export class AlertsController {
	constructor(private readonly alertsService: AlertsService) {}

	@Get('rules')
	@RequirePermission('monitor:alert:list')
	@ApiOperation({ summary: '告警规则分页' })
	rules(@Query() query: QueryAlertRuleDto) {
		return this.alertsService.page(query)
	}

	@Get('summary')
	@RequirePermission('monitor:alert:list')
	@ApiOperation({ summary: '告警中心汇总' })
	summary(@Query('projectId') projectId?: string) {
		return this.alertsService.summary(projectId ? Number(projectId) : undefined)
	}

	@Post('rules')
	@RequirePermission('monitor:alert:create')
	@ApiOperation({ summary: '创建告警规则' })
	create(@Body() dto: CreateAlertRuleDto) {
		return this.alertsService.create(dto)
	}

	@Patch('rules/:id')
	@RequirePermission('monitor:alert:update')
	@ApiOperation({ summary: '更新告警规则' })
	update(@Param('id') id: string, @Body() dto: UpdateAlertRuleDto) {
		return this.alertsService.update(Number(id), dto)
	}

	@Delete('rules/:id')
	@RequirePermission('monitor:alert:delete')
	@ApiOperation({ summary: '删除告警规则' })
	async remove(@Param('id') id: string): Promise<{ success: boolean }> {
		await this.alertsService.remove(Number(id))
		return { success: true }
	}

	@Post('rules/:id/test')
	@RequirePermission('monitor:alert:update')
	@ApiOperation({ summary: '测试发送告警规则' })
	test(@Param('id') id: string) {
		return this.alertsService.test(Number(id))
	}

	@Get('history')
	@RequirePermission('monitor:alert:list')
	@ApiOperation({ summary: '告警历史分页' })
	history(@Query() query: QueryAlertHistoryDto) {
		return this.alertsService.history(query)
	}
}
