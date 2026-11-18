import { gunzipSync } from 'node:zlib'
import {
	BadRequestException,
	ConflictException,
	Injectable,
	PayloadTooLargeException,
	ServiceUnavailableException,
	UnauthorizedException,
	UnsupportedMediaTypeException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ProjectKey } from '../projects/project-key.entity'
import { Project } from '../projects/project.entity'
import { ReplaySession } from '../replays/replay-session.entity'
import { ReplayChunk } from './replay-chunk.entity'
import { ReplayStorageService } from './replay-storage.service'

const MAX_COMPRESSED_BYTES = 300 * 1_024
const MAX_RAW_BYTES = 5 * 1_024 * 1_024

/** Replay gzip 分片上传服务。 */
@Injectable()
export class ReplayIngestService {
	constructor(
		@InjectRepository(Project)
		private readonly projectRepo: Repository<Project>,
		@InjectRepository(ProjectKey)
		private readonly keyRepo: Repository<ProjectKey>,
		@InjectRepository(ReplayChunk)
		private readonly chunkRepo: Repository<ReplayChunk>,
		@InjectRepository(ReplaySession)
		private readonly sessionRepo: Repository<ReplaySession>,
		private readonly storage: ReplayStorageService,
	) {}

	/**
	 * 校验并持久化一个 Replay gzip 分片。
	 * @param projectId 项目 ID
	 * @param replayId Replay ID
	 * @param sequence 分片序号
	 * @param query 分片查询参数
	 * @param body gzip 请求体
	 * @param contentType 请求内容类型
	 * @param contentEncoding 内容编码
	 */
	async upload(
		projectId: number,
		replayId: string,
		sequence: number,
		query: { key?: string; sessionId?: string; checksum?: string },
		body: unknown,
		contentType?: string,
		contentEncoding?: string,
	): Promise<void> {
		const project = await this.authenticate(projectId, query.key)
		if (!/^[\w-]{1,64}$/.test(replayId))
			throw new BadRequestException('replayId 非法')
		if (!Number.isInteger(sequence) || sequence < 0)
			throw new BadRequestException('sequence 非法')
		if (!query.sessionId || !/^[\w-]{1,64}$/.test(query.sessionId))
			throw new BadRequestException('sessionId 非法')
		if (!query.checksum || !/^[0-9a-f]{8,64}$/.test(query.checksum))
			throw new BadRequestException('checksum 非法')
		if (contentType !== 'application/octet-stream')
			throw new UnsupportedMediaTypeException(
				'Content-Type 必须是 application/octet-stream',
			)
		if (contentEncoding !== 'gzip')
			throw new UnsupportedMediaTypeException(
				'Content-Encoding 必须是 gzip',
			)
		if (!Buffer.isBuffer(body) || body.length === 0)
			throw new BadRequestException('分片内容缺失')
		if (body.length > MAX_COMPRESSED_BYTES)
			throw new PayloadTooLargeException('Replay 分片过大')
		const actualChecksum = fnv1aHex(body)

		const existing = await this.chunkRepo.findOne({
			where: { projectId: project.id, replayId, sequence },
		})
		if (existing) {
			if (
				existing.checksum === query.checksum &&
				actualChecksum === query.checksum
			)
				return
			if (actualChecksum !== query.checksum)
				throw new BadRequestException('checksum 不匹配')
			throw new ConflictException('同一序号分片已存在且 checksum 不一致')
		}
		if (actualChecksum !== query.checksum)
			throw new BadRequestException('checksum 不匹配')

		let raw: Buffer
		let events: unknown
		try {
			raw = gunzipSync(body, { maxOutputLength: MAX_RAW_BYTES })
			events = JSON.parse(raw.toString('utf8'))
		} catch {
			throw new BadRequestException('gzip 分片不是合法的 rrweb JSON 数组')
		}
		if (
			!Array.isArray(events) ||
			events.length === 0 ||
			!events.every(isRecorderEvent)
		) {
			throw new BadRequestException('分片必须是非空 rrweb 事件数组')
		}
		const timestamps = events
			.map((event) => Number(event.timestamp))
			.filter(Number.isFinite)
		const capturedFrom = new Date(Math.min(...timestamps))
		const capturedTo = new Date(Math.max(...timestamps))
		const pagePath = readPagePath(events)

		const storageKey = await this.storage.put(
			project.id,
			replayId,
			sequence,
			body,
		)
		const chunk = this.chunkRepo.create({
			projectId: project.id,
			replayId,
			sequence,
			sessionId: query.sessionId,
			storageKey,
			rawSize: raw.length,
			compressedSize: body.length,
			eventCount: events.length,
			checksum: query.checksum,
			maskVersion: '1.0.0',
			truncated: 0,
			capturedFrom,
			capturedTo,
		})
		try {
			await this.chunkRepo.save(chunk)
			await this.upsertSession(
				project.id,
				replayId,
				query.sessionId,
				pagePath,
			)
		} catch (error) {
			await this.storage.remove(storageKey)
			throw new ServiceUnavailableException(
				`Replay 索引写入失败: ${error instanceof Error ? error.message : 'unknown'}`,
			)
		}
	}

	/**
	 * 校验 browser key 与项目状态。
	 * @param projectId 项目 ID
	 * @param key browser key
	 * @returns 项目
	 */
	private async authenticate(
		projectId: number,
		key?: string,
	): Promise<Project> {
		if (!Number.isInteger(projectId) || projectId <= 0)
			throw new BadRequestException('项目 ID 非法')
		if (!key || key.length > 100)
			throw new UnauthorizedException('上报 key 缺失或非法')
		const project = await this.projectRepo.findOne({
			where: { id: projectId, deleted: 0 },
		})
		if (!project || project.status !== 1)
			throw new UnauthorizedException('项目不可用')
		const keyRow = await this.keyRepo.findOne({
			where: { projectId, keyValue: key, keyType: 'browser', status: 1 },
		})
		if (!keyRow) throw new UnauthorizedException('browser key 无效')
		return project
	}

	/**
	 * 根据全部分片刷新会话索引。
	 * @param projectId 项目 ID
	 * @param replayId Replay ID
	 * @param sessionId 会话 ID
	 * @param pagePath 当前分片页面路径
	 */
	private async upsertSession(
		projectId: number,
		replayId: string,
		sessionId: string,
		pagePath: string,
	): Promise<void> {
		const chunks = await this.chunkRepo.find({
			where: { projectId, replayId },
		})
		const startedAt = new Date(
			Math.min(...chunks.map((chunk) => chunk.capturedFrom.getTime())),
		)
		const endedAt = Math.max(
			...chunks.map((chunk) => chunk.capturedTo.getTime()),
		)
		let session = await this.sessionRepo.findOne({ where: { replayId } })
		if (!session) {
			session = this.sessionRepo.create({
				replayId,
				projectId,
				sessionId,
				pagePath,
				durationMs: 0,
				sizeBytes: 0,
				eventCount: 0,
				errorCount: 0,
				samplingReason: 'session',
				startedAt,
			})
		}
		session.projectId = projectId
		session.sessionId = sessionId
		session.pagePath =
			session.pagePath === '/' || !session.pagePath
				? pagePath
				: session.pagePath
		session.startedAt = startedAt
		session.durationMs = Math.max(0, endedAt - startedAt.getTime())
		session.sizeBytes = chunks.reduce(
			(total, chunk) => total + chunk.compressedSize,
			0,
		)
		session.eventCount = chunks.reduce(
			(total, chunk) => total + chunk.eventCount,
			0,
		)
		await this.sessionRepo.save(session)
	}
}

/** @param event 未知录制事件 @returns 是否为最小 rrweb 事件 */
function isRecorderEvent(event: unknown): event is { timestamp: number } {
	return Boolean(
		event &&
		typeof event === 'object' &&
		Number.isFinite(Number((event as { timestamp?: unknown }).timestamp)),
	)
}

/** @param events rrweb 事件 @returns 页面路径 */
function readPagePath(events: unknown[]): string {
	for (const event of events) {
		const record = event as { type?: unknown; data?: { href?: unknown } }
		if (record.type === 4 && typeof record.data?.href === 'string') {
			try {
				return new URL(record.data.href).pathname.slice(0, 255) || '/'
			} catch {
				return '/'
			}
		}
	}
	return '/'
}

/**
 * 与 SDK 保持一致的 FNV-1a 校验和。
 * @param data gzip 字节
 * @returns 8 位 hex
 */
function fnv1aHex(data: Buffer): string {
	let hash = 0x811c9dc5
	for (const byte of data) {
		hash ^= byte
		hash = Math.imul(hash, 0x01000193) >>> 0
	}
	return hash.toString(16).padStart(8, '0')
}
