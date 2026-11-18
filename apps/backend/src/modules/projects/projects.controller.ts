import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { type AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { CreateProjectDto } from './dto/create-project.dto'
import { QueryProjectDto } from './dto/query-project.dto'
import { UpdateProjectDto } from './dto/update-project.dto'
import { UpdateProjectSettingsDto } from './dto/update-project-settings.dto'
import { ProjectsService, type ProjectKeyVO, type ProjectVO } from './projects.service'

/** 项目管理接口。 */
@ApiTags('monitor-projects')
@ApiBearerAuth()
@Controller('monitor/projects')
export class ProjectsController {
	constructor(private readonly projectsService: ProjectsService) {}

	@Get()
	@RequirePermission('monitor:project:list')
	@ApiOperation({ summary: '项目分页列表' })
	page(@Query() query: QueryProjectDto) {
		return this.projectsService.page(query)
	}

	@Get('active')
	@ApiOperation({ summary: '启用项目下拉' })
	listActive(): Promise<ProjectVO[]> {
		return this.projectsService.listActive()
	}

	@Post()
	@RequirePermission('monitor:project:create')
	@ApiOperation({ summary: '创建项目' })
	create(@Body() dto: CreateProjectDto, @CurrentUser() user: AuthUser): Promise<ProjectVO> {
		return this.projectsService.create(dto, user.id)
	}

	@Get(':id')
	@RequirePermission('monitor:project:list')
	@ApiOperation({ summary: '项目详情' })
	findOne(@Param('id') id: string): Promise<ProjectVO> {
		return this.projectsService.findOne(Number(id))
	}

	@Patch(':id')
	@RequirePermission('monitor:project:update')
	@ApiOperation({ summary: '更新项目' })
	update(@Param('id') id: string, @Body() dto: UpdateProjectDto): Promise<ProjectVO> {
		return this.projectsService.update(Number(id), dto)
	}

	@Patch(':id/settings')
	@RequirePermission('monitor:project:update')
	@ApiOperation({ summary: '更新项目采样、留存与隐私设置' })
	updateSettings(
		@Param('id') id: string,
		@Body() dto: UpdateProjectSettingsDto,
	): Promise<ProjectVO> {
		return this.projectsService.updateSettings(Number(id), dto)
	}

	@Delete(':id')
	@RequirePermission('monitor:project:delete')
	@ApiOperation({ summary: '删除项目' })
	async remove(@Param('id') id: string): Promise<{ success: boolean }> {
		await this.projectsService.remove(Number(id))
		return { success: true }
	}

	@Post(':id/archive')
	@RequirePermission('monitor:project:update')
	@ApiOperation({ summary: '归档项目' })
	archive(@Param('id') id: string): Promise<ProjectVO> {
		return this.projectsService.archive(Number(id))
	}

	@Get(':id/keys')
	@RequirePermission('monitor:project:list')
	@ApiOperation({ summary: '项目 key 列表' })
	listKeys(@Param('id') id: string): Promise<ProjectKeyVO[]> {
		return this.projectsService.listKeys(Number(id))
	}

	@Post(':id/keys')
	@RequirePermission('monitor:project:rotate-key')
	@ApiOperation({ summary: '轮换项目 key' })
	rotateKey(
		@Param('id') id: string,
		@Body() body: { keyType: 'browser' | 'server' },
	): Promise<ProjectKeyVO> {
		return this.projectsService.rotateKey(Number(id), body.keyType)
	}

	@Post(':id/keys/:keyId/revoke')
	@RequirePermission('monitor:project:rotate-key')
	@ApiOperation({ summary: '吊销项目 key' })
	async revokeKey(
		@Param('id') id: string,
		@Param('keyId') keyId: string,
	): Promise<{ success: boolean }> {
		await this.projectsService.revokeKey(Number(id), Number(keyId))
		return { success: true }
	}

	@Get(':id/dsn')
	@RequirePermission('monitor:project:list')
	@ApiOperation({ summary: '项目 DSN' })
	getDsn(@Param('id') id: string) {
		return this.projectsService.getDsn(Number(id))
	}
}
