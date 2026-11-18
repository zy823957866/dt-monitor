import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

/** Replay 分片的本地私有对象存储适配；后续可替换为 S3/MinIO 实现。 */
@Injectable()
export class ReplayStorageService {
	constructor(private readonly config: ConfigService) {}

	/**
	 * 原子写入 gzip 分片。
	 * @param projectId 项目 ID
	 * @param replayId Replay ID
	 * @param sequence 分片序号
	 * @param data gzip 字节
	 * @returns 存储 key
	 */
	async put(projectId: number, replayId: string, sequence: number, data: Buffer): Promise<string> {
		const baseDir = path.resolve(this.config.getOrThrow<string>('replayStorageDir'))
		const key = `${projectId}/${replayId}/${sequence}.gz`
		const target = path.join(baseDir, key)
		const relative = path.relative(baseDir, target)
		if (relative.startsWith('..') || path.isAbsolute(relative)) throw new ServiceUnavailableException('Replay 存储路径非法')
		const temp = path.join(baseDir, `${projectId}-${replayId}-${sequence}-${randomBytes(6).toString('hex')}.tmp`)
		try {
			await mkdir(path.dirname(target), { recursive: true })
			await writeFile(temp, data)
			await rename(temp, target)
			return key
		} catch (error) {
			await rm(temp, { force: true })
			throw new ServiceUnavailableException(`Replay 对象存储不可用: ${error instanceof Error ? error.message : 'unknown'}`)
		}
	}

	/**
	 * 删除已写入分片。
	 * @param storageKey 存储 key
	 */
	async remove(storageKey: string): Promise<void> {
		const baseDir = path.resolve(this.config.getOrThrow<string>('replayStorageDir'))
		const target = path.join(baseDir, storageKey)
		if (!target.startsWith(baseDir)) return
		await rm(target, { force: true })
	}
}
