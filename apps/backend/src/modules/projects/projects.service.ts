import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { randomBytes } from 'node:crypto'
import { Repository } from 'typeorm'
import { ofPage, type PageResult } from '../../common/dto/page-result.dto'
import { CreateProjectDto } from './dto/create-project.dto'
import { QueryProjectDto } from './dto/query-project.dto'
import { UpdateProjectDto } from './dto/update-project.dto'
import { UpdateProjectSettingsDto } from './dto/update-project-settings.dto'
import { ProjectKey } from './project-key.entity'
import { Project } from './project.entity'

/** 项目列表视图。 */
export interface ProjectVO {
	id: number
	name: string
	appId: string
	platform: string
	status: number
	environmentCount: number
	sdkVersion: string
	eventCount: number
	errorCount: number
	description?: string
	settings?: Record<string, unknown>
	createTime: Date
}

/** 项目 key 视图。 */
export interface ProjectKeyVO {
	id: number
	keyType: 'browser' | 'server'
	keyValue: string
	status: number
	createTime: Date
}

/** 项目服务。 */
@Injectable()
export class ProjectsService {
	constructor(
		@InjectRepository(Project) private readonly projectRepo: Repository<Project>,
		@InjectRepository(ProjectKey) private readonly keyRepo: Repository<ProjectKey>,
		private readonly config: ConfigService,
	) {}

	/** 分页查询项目。 @param query 查询参数 @returns 分页项目 */
	async page(query: QueryProjectDto): Promise<PageResult<ProjectVO>> {
		const qb = this.projectRepo
			.createQueryBuilder('project')
			.where('project.deleted = 0')
			.orderBy('project.createTime', 'DESC')
			.skip((query.pageNum - 1) * query.pageSize)
			.take(query.pageSize)
		if (query.keyword) {
			qb.andWhere('(project.name LIKE :keyword OR project.appId LIKE :keyword)', {
				keyword: `%${query.keyword}%`,
			})
		}
		if (query.status !== undefined) qb.andWhere('project.status = :status', { status: query.status })
		const [rows, total] = await qb.getManyAndCount()
		return ofPage(query.pageNum, query.pageSize, total, rows.map((row) => this.toVO(row)))
	}

	/** 查询全部启用项目。 @returns 项目数组 */
	async listActive(): Promise<ProjectVO[]> {
		const rows = await this.projectRepo.find({
			where: { deleted: 0, status: 1 },
			order: { createTime: 'DESC' },
		})
		return rows.map((row) => this.toVO(row))
	}

	/** 按 ID 查询项目。 @param id 项目 ID @returns 项目视图 */
	async findOne(id: number): Promise<ProjectVO> {
		return this.toVO(await this.requireProject(id))
	}

	/** 创建项目并签发 key。 @param dto 创建参数 @param ownerId 创建人 @returns 项目 */
	async create(dto: CreateProjectDto, ownerId: number): Promise<ProjectVO> {
		const exists = await this.projectRepo.findOne({ where: { appId: dto.appId } })
		if (exists) throw new ConflictException('项目编码已存在')
		const project = this.projectRepo.create({
			name: dto.name,
			appId: dto.appId,
			platform: dto.platform ?? 'web',
			status: 1,
			ownerId,
			description: dto.description,
			settings: {
				errorSampleRate: 1,
				performanceSampleRate: 0.1,
				analyticsSampleRate: 1,
				traceSampleRate: 0.1,
				replaySessionSampleRate: 0.01,
				replayErrorSampleRate: 1,
				retentionDays: 90,
				replayRetentionDays: 30,
			},
		})
		await this.projectRepo.save(project)
		await this.createKey(project.id, 'browser')
		await this.createKey(project.id, 'server')
		return this.toVO(project)
	}

	/** 更新项目。 @param id 项目 ID @param dto 更新参数 @returns 项目 */
	async update(id: number, dto: UpdateProjectDto): Promise<ProjectVO> {
		const project = await this.requireProject(id)
		if (dto.appId && dto.appId !== project.appId) {
			const exists = await this.projectRepo.findOne({ where: { appId: dto.appId } })
			if (exists) throw new ConflictException('项目编码已存在')
		}
		Object.assign(project, dto)
		await this.projectRepo.save(project)
		return this.toVO(project)
	}

	/** 更新项目采样、留存与隐私设置。 @param id 项目 ID @param dto 设置参数 @returns 项目 */
	async updateSettings(id: number, dto: UpdateProjectSettingsDto): Promise<ProjectVO> {
		const project = await this.requireProject(id)
		project.settings = { ...(project.settings ?? {}), ...dto }
		await this.projectRepo.save(project)
		return this.toVO(project)
	}

	/** 归档项目。 @param id 项目 ID @returns 更新后项目 */
	async archive(id: number): Promise<ProjectVO> {
		const project = await this.requireProject(id)
		project.status = 2
		await this.projectRepo.save(project)
		return this.toVO(project)
	}

	/** 删除项目（软删除并吊销 key）。 @param id 项目 ID */
	async remove(id: number): Promise<void> {
		const project = await this.requireProject(id)
		project.deleted = 1
		project.status = 0
		await this.projectRepo.save(project)
		await this.keyRepo.update({ projectId: id }, { status: 0 })
	}

	/** 查询项目 key。 @param projectId 项目 ID @returns key 数组 */
	async listKeys(projectId: number): Promise<ProjectKeyVO[]> {
		await this.requireProject(projectId)
		const rows = await this.keyRepo.find({
			where: { projectId },
			order: { createTime: 'DESC' },
		})
		return rows.map((row) => ({ ...row, keyType: row.keyType }))
	}

	/** 轮换项目 key。 @param projectId 项目 ID @param keyType key 类型 @returns 新 key */
	async rotateKey(projectId: number, keyType: 'browser' | 'server'): Promise<ProjectKeyVO> {
		await this.requireProject(projectId)
		await this.keyRepo.update({ projectId, keyType, status: 1 }, { status: 0 })
		return this.createKey(projectId, keyType)
	}

	/** 吊销 key。 @param projectId 项目 ID @param keyId key ID */
	async revokeKey(projectId: number, keyId: number): Promise<void> {
		const key = await this.keyRepo.findOne({ where: { id: keyId, projectId } })
		if (!key) throw new NotFoundException('项目 key 不存在')
		key.status = 0
		await this.keyRepo.save(key)
	}

	/** 获取项目 DSN 信息。 @param projectId 项目 ID @returns DSN 与 key */
	async getDsn(projectId: number): Promise<{
		dsn: string
		browserKey: string
		serverKey: string
		origin: string
	}> {
		const project = await this.requireProject(projectId)
		const [browser, server] = await Promise.all([
			this.activeKey(projectId, 'browser'),
			this.activeKey(projectId, 'server'),
		])
		const origin = this.config.getOrThrow<string>('dsnOrigin').replace(/\/$/, '')
		return {
			dsn: `${origin}/ingest/v1/${project.id}?key=${browser}`,
			browserKey: browser,
			serverKey: server,
			origin,
		}
	}

	/**
	 * 解析请求中的项目 ID；未传入时使用首个启用项目。
	 * @param projectId 可选项目 ID
	 * @returns 项目
	 */
	async resolveProject(projectId?: number): Promise<Project> {
		if (projectId) return this.requireProject(projectId)
		const first = await this.projectRepo.findOne({
			where: { deleted: 0, status: 1 },
			order: { id: 'ASC' },
		})
		if (!first) throw new BadRequestException('暂无可用项目')
		return first
	}

	private async requireProject(id: number): Promise<Project> {
		const project = await this.projectRepo.findOne({ where: { id, deleted: 0 } })
		if (!project) throw new NotFoundException('项目不存在')
		return project
	}

	private async activeKey(projectId: number, keyType: 'browser' | 'server'): Promise<string> {
		const key = await this.keyRepo.findOne({
			where: { projectId, keyType, status: 1 },
			order: { createTime: 'DESC' },
		})
		if (!key) throw new NotFoundException(`${keyType} key 不存在`)
		return key.keyValue
	}

	private async createKey(projectId: number, keyType: 'browser' | 'server'): Promise<ProjectKeyVO> {
		const key = await this.keyRepo.save(
			this.keyRepo.create({
				projectId,
				keyType,
				keyValue: `mk_${randomBytes(18).toString('hex')}`,
				status: 1,
			}),
		)
		return { ...key, keyType: key.keyType as 'browser' | 'server' }
	}

	private toVO(project: Project): ProjectVO {
		return {
			id: project.id,
			name: project.name,
			appId: project.appId,
			platform: project.platform,
			status: project.status,
			environmentCount: project.environmentCount,
			sdkVersion: project.sdkVersion,
			eventCount: Number(project.eventCount),
			errorCount: Number(project.errorCount),
			description: project.description,
			settings: project.settings,
			createTime: project.createTime,
		}
	}
}
