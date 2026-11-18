import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { ofPage, type PageResult } from '../../common/dto/page-result.dto'
import { ProjectsService } from '../projects/projects.service'
import { AlertHistory } from './alert-history.entity'
import { AlertRule } from './alert-rule.entity'
import {
	CreateAlertRuleDto,
	QueryAlertHistoryDto,
	QueryAlertRuleDto,
	UpdateAlertRuleDto,
} from './dto/alert.dto'

/** 告警规则视图。 */
export interface AlertRuleVO {
	id: number
	projectId: number
	name: string
	metric: string
	comparator: string
	threshold: number
	windowMinutes: number
	cooldownMinutes: number
	channel: string
	status: string
	triggerStatus: 'active' | 'recovered' | 'paused'
	conditionSummary: string
	lastTriggeredAt?: Date
}

/** 告警中心汇总。 */
export interface AlertSummaryVO {
	activeRuleCount: number
	activeRuleNames: string[]
	historyCount: number
}

/** 告警历史视图。 */
export interface AlertHistoryVO {
	id: number
	projectId: number
	ruleId: number
	ruleName: string
	status: string
	message: string
	triggeredAt: Date
	resolvedAt?: Date
}

/** 告警服务。 */
@Injectable()
export class AlertsService {
	constructor(
		@InjectRepository(AlertRule) private readonly ruleRepo: Repository<AlertRule>,
		@InjectRepository(AlertHistory) private readonly historyRepo: Repository<AlertHistory>,
		private readonly projectsService: ProjectsService,
	) {}

	/** 规则分页列表。 @param query 查询参数 @returns 分页规则 */
	async page(query: QueryAlertRuleDto): Promise<PageResult<AlertRuleVO>> {
		const project = await this.projectsService.resolveProject(query.projectId)
		const qb = this.ruleRepo
			.createQueryBuilder('rule')
			.where('rule.projectId = :projectId', { projectId: project.id })
			.andWhere('rule.deleted = 0')
			.orderBy('rule.lastTriggeredAt', 'DESC')
			.skip((query.pageNum - 1) * query.pageSize)
			.take(query.pageSize)
		if (query.status) qb.andWhere('rule.status = :status', { status: query.status })
		if (query.metric) qb.andWhere('rule.metric = :metric', { metric: query.metric })
		if (query.channel) qb.andWhere('rule.channel = :channel', { channel: query.channel })
		if (query.keyword) qb.andWhere('rule.name LIKE :keyword', { keyword: `%${query.keyword}%` })
		const [rows, total] = await qb.getManyAndCount()
		return ofPage(query.pageNum, query.pageSize, total, rows.map((row) => this.toVO(row)))
	}

	/** 告警中心汇总。 @param projectId 项目 ID @returns 汇总 */
	async summary(projectId?: number): Promise<AlertSummaryVO> {
		const project = await this.projectsService.resolveProject(projectId)
		const rules = await this.ruleRepo.find({ where: { projectId: project.id, deleted: 0 } })
		const active = rules.filter(
			(rule) => rule.status === 'active' && rule.lastTriggeredAt && this.inRecentWindow(rule),
		)
		const historyCount = await this.historyRepo.count({ where: { projectId: project.id } })
		return {
			activeRuleCount: active.length,
			activeRuleNames: active.map((rule) => rule.name),
			historyCount,
		}
	}

	/** 创建规则。 @param dto 创建参数 @returns 规则 */
	async create(dto: CreateAlertRuleDto): Promise<AlertRuleVO> {
		await this.projectsService.resolveProject(dto.projectId)
		const rule = await this.ruleRepo.save(
			this.ruleRepo.create({
				...dto,
				comparator: dto.comparator ?? '>',
				windowMinutes: dto.windowMinutes ?? 10,
				cooldownMinutes: dto.cooldownMinutes ?? 30,
				channel: dto.channel ?? 'webhook',
				status: 'active',
				conditionSummary:
					dto.conditionSummary ??
					`${dto.metric} ${dto.comparator ?? '>'} ${dto.threshold} · ${dto.windowMinutes ?? 10} 分钟`,
			}),
		)
		return this.toVO(rule)
	}

	/** 更新规则。 @param id 规则 ID @param dto 更新参数 @returns 规则 */
	async update(id: number, dto: UpdateAlertRuleDto): Promise<AlertRuleVO> {
		const rule = await this.requireRule(id)
		Object.assign(rule, dto)
		await this.ruleRepo.save(rule)
		return this.toVO(rule)
	}

	/** 删除规则。 @param id 规则 ID */
	async remove(id: number): Promise<void> {
		const rule = await this.requireRule(id)
		rule.deleted = 1
		await this.ruleRepo.save(rule)
	}

	/** 测试发送规则。 @param id 规则 ID @returns 发送结果 */
	async test(id: number): Promise<{ delivered: boolean; message: string }> {
		const rule = await this.requireRule(id)
		const webhook = process.env.ALERT_WEBHOOK_URL
		if (!webhook) return { delivered: false, message: '未配置 ALERT_WEBHOOK_URL，无法发送测试消息' }
		const response = await fetch(webhook, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				type: 'dt-monitor.alert.test',
				ruleId: rule.id,
				ruleName: rule.name,
				condition: rule.conditionSummary,
				timestamp: new Date().toISOString(),
			}),
		})
		return response.ok
			? { delivered: true, message: '测试消息已发送' }
			: { delivered: false, message: `Webhook 返回 ${response.status}` }
	}

	/** 告警历史分页。 @param query 查询参数 @returns 分页历史 */
	async history(query: QueryAlertHistoryDto): Promise<PageResult<AlertHistoryVO>> {
		const project = await this.projectsService.resolveProject(query.projectId)
		const qb = this.historyRepo
			.createQueryBuilder('history')
			.where('history.projectId = :projectId', { projectId: project.id })
			.orderBy('history.triggeredAt', 'DESC')
			.skip((query.pageNum - 1) * query.pageSize)
			.take(query.pageSize)
		if (query.ruleId) qb.andWhere('history.ruleId = :ruleId', { ruleId: query.ruleId })
		const [rows, total] = await qb.getManyAndCount()
		const ruleIds = [...new Set(rows.map((row) => row.ruleId))]
		const rules = ruleIds.length
			? await this.ruleRepo.find({ where: { id: In(ruleIds) }, withDeleted: false })
			: []
		const ruleMap = new Map(rules.map((rule) => [rule.id, rule.name]))
		return ofPage(
			query.pageNum,
			query.pageSize,
			total,
			rows.map((row) => ({
				...row,
				ruleName: ruleMap.get(row.ruleId) ?? '告警规则',
			})),
		)
	}

	private async requireRule(id: number): Promise<AlertRule> {
		const rule = await this.ruleRepo.findOne({ where: { id, deleted: 0 } })
		if (!rule) throw new NotFoundException('告警规则不存在')
		return rule
	}

	private inRecentWindow(rule: AlertRule): boolean {
		if (!rule.lastTriggeredAt) return false
		return new Date(rule.lastTriggeredAt).getTime() >= Date.now() - rule.windowMinutes * 60_000
	}

	private toVO(rule: AlertRule): AlertRuleVO {
		return {
			id: rule.id,
			projectId: rule.projectId,
			name: rule.name,
			metric: rule.metric,
			comparator: rule.comparator,
			threshold: Number(rule.threshold),
			windowMinutes: rule.windowMinutes,
			cooldownMinutes: rule.cooldownMinutes,
			channel: rule.channel,
			status: rule.status,
			triggerStatus:
				rule.status === 'paused'
					? 'paused'
					: this.inRecentWindow(rule)
						? 'active'
						: 'recovered',
			conditionSummary: rule.conditionSummary,
			lastTriggeredAt: rule.lastTriggeredAt,
		}
	}
}
