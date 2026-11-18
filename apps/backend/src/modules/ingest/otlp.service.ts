import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, In, Repository } from 'typeorm'
import { ProjectKey } from '../projects/project-key.entity'
import { Project } from '../projects/project.entity'
import { TraceSpan } from '../tracing/trace-span.entity'
import type { NormalizedOtlpSpan, OtlpIngestResult } from './ingest.types'

const MAX_OTLP_SPANS = 500

/** OTLP/HTTP JSON Traces 接入服务。 */
@Injectable()
export class OtlpService {
	constructor(
		@InjectDataSource() private readonly dataSource: DataSource,
		@InjectRepository(Project) private readonly projectRepo: Repository<Project>,
		@InjectRepository(ProjectKey) private readonly keyRepo: Repository<ProjectKey>,
	) {}

	/**
	 * 校验 server key，归一化并写入 OTLP JSON Span。
	 * @param serverKey 请求头中的服务端 key
	 * @param body OTLP/HTTP JSON 请求体
	 * @returns 接受和拒绝数量
	 */
	async ingest(serverKey: string, body: unknown): Promise<OtlpIngestResult> {
		const keyRow = await this.authenticate(serverKey)
		const resources = readArray(body, 'resourceSpans')
		if (!resources.length) throw new BadRequestException('resourceSpans 缺失或为空')
		let spanIndex = 0
		const normalized: Array<NormalizedOtlpSpan & { projectId: number }> = []
		const errors: OtlpIngestResult['errors'] = []

		for (const resourceSpan of resources) {
			const resourceAttrs = readAttributes(resourceSpan?.['resource'])
			const service = String(resourceAttrs['service.name'] ?? 'unknown').slice(0, 80)
			const environment = asString(resourceAttrs['deployment.environment'])?.slice(0, 30)
			const release = asString(resourceAttrs['service.version'])?.slice(0, 50)
			const resourceProjectId = asProjectId(resourceAttrs['dt.monitor.project_id'] ?? resourceAttrs['project.id'] ?? resourceAttrs['project_id'])
			const projectId = resourceProjectId ?? keyRow.projectId
			if (projectId !== keyRow.projectId) throw new UnauthorizedException('server key 无权写入该项目')
			for (const scopeSpan of readArray(resourceSpan, 'scopeSpans')) {
				for (const rawSpan of readArray(scopeSpan, 'spans')) {
					const currentIndex = spanIndex++
					const parsed = normalizeSpan(rawSpan, service, environment, release)
					if ('error' in parsed) errors.push({ index: currentIndex, code: 'invalid_span', message: parsed.error })
					else normalized.push({ ...parsed, projectId })
				}
			}
		}

		if (spanIndex === 0) throw new BadRequestException('OTLP 批次没有 Span')
		if (spanIndex > MAX_OTLP_SPANS) throw new BadRequestException(`单批最多 ${MAX_OTLP_SPANS} 个 Span`)
		if (!normalized.length) return { accepted: 0, rejected: errors.length, errors }

		const existing = await this.dataSource.getRepository(TraceSpan).find({
			where: {
				projectId: keyRow.projectId,
				spanId: In(normalized.map((span) => span.spanId)),
			},
			select: ['spanId'],
		})
		const existingIds = new Set(existing.map((row) => row.spanId))
		const spans = normalized.filter((span) => !existingIds.has(span.spanId))

		await this.dataSource.transaction(async (manager) => {
			for (const span of spans) await this.saveSpan(manager, span)
			await manager.increment(Project, { id: keyRow.projectId }, 'eventCount', spans.length)
		})
		return { accepted: spans.length, rejected: errors.length, errors }
	}

	/**
	 * 校验 OTLP server key。
	 * @param serverKey 请求头 key
	 * @returns key 记录
	 */
	async authenticate(serverKey: string): Promise<ProjectKey> {
		if (!serverKey || serverKey.length > 100) throw new UnauthorizedException('server key 缺失或非法')
		const keyRow = await this.keyRepo.findOne({
			where: { keyValue: serverKey, keyType: 'server', status: 1 },
		})
		if (!keyRow) throw new UnauthorizedException('server key 无效')
		const project = await this.projectRepo.findOne({ where: { id: keyRow.projectId, deleted: 0 } })
		if (!project || project.status !== 1) throw new UnauthorizedException('项目不可用')
		return keyRow
	}

	/** @param manager 事务管理器 @param span 归一化 Span */
	private async saveSpan(
		manager: EntityManager,
		span: NormalizedOtlpSpan & { projectId: number },
	): Promise<void> {
		await manager.getRepository(TraceSpan).save(
			manager.getRepository(TraceSpan).create({
				projectId: span.projectId,
				traceId: span.traceId,
				spanId: span.spanId,
				parentSpanId: span.parentSpanId,
				service: span.service,
				operation: span.operation,
				spanType: span.spanType,
				startTime: span.startTime,
				durationMs: span.durationMs,
				status: span.status,
				environment: span.environment,
				release: span.release,
				isRoot: span.isRoot ? 1 : 0,
				attributes: span.attributes,
			}),
		)
	}
}

/**
 * 将单个 OTLP Span 转为本地模型。
 * @param raw 原始 Span
 * @param service 服务名
 * @param environment 环境
 * @param release 版本
 * @returns 模型或错误
 */
function normalizeSpan(
	raw: unknown,
	service: string,
	environment?: string,
	release?: string,
): NormalizedOtlpSpan | { error: string } {
	if (!raw || typeof raw !== 'object') return { error: 'Span 必须是对象' }
	const item = raw as Record<string, unknown>
	const traceId = decodeTraceId(item.traceId, 32)
	const spanId = decodeTraceId(item.spanId, 16)
	const parentRaw = item.parentSpanId
	const parentSpanId = parentRaw ? decodeTraceId(parentRaw, 16) : undefined
	const operation = asString(item.name)
	const startNanos = asNanos(item.startTimeUnixNano)
	const endNanos = item.endTimeUnixNano ? asNanos(item.endTimeUnixNano) : startNanos
	if (!traceId || !spanId) return { error: 'traceId 或 spanId 非法' }
	if (!operation) return { error: 'name 缺失' }
	if (!Number.isFinite(startNanos) || !Number.isFinite(endNanos) || endNanos < startNanos) return { error: '时间范围非法' }
	const attributes = readAttributes(item)
	const method = asString(attributes['http.request.method'] ?? attributes['http.method'])
	const statusCode = Number(item.status && typeof item.status === 'object' ? (item.status as Record<string, unknown>).code : 0)
	return {
		traceId,
		spanId,
		parentSpanId,
		service,
		operation: operation.slice(0, 255),
		spanType: method ? 'http' : 'custom',
		startTime: new Date(startNanos / 1_000_000),
		durationMs: Math.max(0, (endNanos - startNanos) / 1_000_000),
		status: statusCode === 2 ? 'error' : 'ok',
		isRoot: !parentSpanId,
		attributes,
		environment,
		release,
	}
}

/**
 * 读取 OTLP 数组字段，兼容 camelCase 与 snake_case。
 * @param value 容器
 * @param key camelCase 字段
 * @returns 数组
 */
function readArray(value: unknown, key: string): Array<Record<string, unknown>> {
	if (!value || typeof value !== 'object') return []
	const record = value as Record<string, unknown>
	const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
	const candidate = record[key] ?? record[snakeKey]
	return Array.isArray(candidate) ? (candidate as Array<Record<string, unknown>>) : []
}

/** @param container OTLP 属性容器 @returns 键值映射 */
function readAttributes(container: unknown): Record<string, string | number | boolean | null> {
	if (!container || typeof container !== 'object') return {}
	{
		const direct = (container as Record<string, unknown>).attributes
		if (Array.isArray(direct)) return Object.fromEntries(direct.map((entry) => [readKeyValue(entry, 'key'), readAnyValue(entry?.['value'])]).filter(([key]) => key))
	}
	const attributes = (container as Record<string, unknown>).attributes
	if (Array.isArray(attributes)) return Object.fromEntries(attributes.map((entry) => [readKeyValue(entry, 'key'), readAnyValue(entry?.['value'])]).filter(([key]) => key))
	return {}
}

/** @param entry 属性项 @param keyField 键字段 @returns 属性键 */
function readKeyValue(entry: unknown, keyField: string): string {
	if (!entry || typeof entry !== 'object') return ''
	const value = (entry as Record<string, unknown>)[keyField]
	return typeof value === 'string' ? value.slice(0, 64) : ''
}

/** @param value OTLP AnyValue @returns 基础值 */
function readAnyValue(value: unknown): string | number | boolean | null {
	if (!value || typeof value !== 'object') return null
	const record = value as Record<string, unknown>
	if ('stringValue' in record) return asString(record.stringValue) ?? ''
	if ('intValue' in record) return Number(record.intValue)
	if ('doubleValue' in record) return Number(record.doubleValue)
	if ('boolValue' in record) return Boolean(record.boolValue)
	return null
}

/** @param value 未知值 @returns 字符串 */
function asString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value : undefined
}

/** @param value 项目 ID 属性 @returns 数字 ID */
function asProjectId(value: unknown): number | undefined {
	const id = Number(value)
	return Number.isInteger(id) && id > 0 ? id : undefined
}

/** @param value 纳秒时间 @returns number 纳秒 */
function asNanos(value: unknown): number {
	if (typeof value === 'number') return value
	if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
	return Number.NaN
}

/**
 * 兼容 OTLP JSON base64 与调试用 hex Trace/Span ID。
 * @param value 原始值
 * @param hexLength 目标 hex 长度
 * @returns hex ID
 */
function decodeTraceId(value: unknown, hexLength: number): string | undefined {
	if (typeof value !== 'string') return undefined
	if (/^[0-9a-f]+$/i.test(value) && value.length === hexLength) return value.toLowerCase()
	const decoded = Buffer.from(value, 'base64url').toString('hex')
	return decoded.length === hexLength ? decoded : undefined
}
