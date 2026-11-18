import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import type { RedisConfig } from '../config/configuration'

/** Redis 服务：统一封装会话、验证码和刷新令牌读写。 */
@Injectable()
export class RedisService implements OnModuleDestroy {
	private readonly logger = new Logger(RedisService.name)
	private readonly client: Redis
	private readonly ttl: number

	constructor(config: ConfigService) {
		const redis = config.get<RedisConfig>('redis') ?? {
			host: 'localhost',
			port: 6379,
			connectTimeout: 5000,
			ttl: 3600,
		}
		this.ttl = redis.ttl
		this.client = new Redis({
			host: redis.host,
			port: redis.port,
			connectTimeout: redis.connectTimeout,
		})
		this.client.on('error', (error) => this.logger.warn(`Redis 连接异常: ${error.message}`))
	}

	/** 读取带前缀缓存。 @param key 原始 key @returns 字符串或 null */
	async get(key: string): Promise<string | null> {
		return this.client.get(this.buildKey(key))
	}

	/** 写入带前缀缓存。 @param key 原始 key @param value 值 @param ttl 过期秒数 */
	async set(key: string, value: string, ttl?: number): Promise<void> {
		await this.client.set(this.buildKey(key), value, 'EX', ttl ?? this.ttl)
	}

	/** 删除带前缀缓存。 @param key 原始 key */
	async del(key: string): Promise<void> {
		await this.client.del(this.buildKey(key))
	}

	/** 读取完整 key。 @param key 完整 key @returns 字符串或 null */
	async getRaw(key: string): Promise<string | null> {
		return this.client.get(key)
	}

	/** 写入完整 key。 @param key 完整 key @param value 值 @param ttl 过期秒数 */
	async setRaw(key: string, value: string, ttl?: number): Promise<void> {
		await this.client.set(key, value, 'EX', ttl ?? this.ttl)
	}

	/** 删除完整 key。 @param key 完整 key */
	async delRaw(key: string): Promise<void> {
		await this.client.del(key)
	}

	/** 连通性检查。 @returns 是否可用 */
	async ping(): Promise<boolean> {
		try {
			return (await this.client.ping()) === 'PONG'
		} catch {
			return false
		}
	}

	/** 按模式清理完整 key。 @param pattern SCAN 模式 */
	async clearByPattern(pattern: string): Promise<void> {
		let cursor = '0'
		do {
			const [next, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
			cursor = next
			if (keys.length) await this.client.del(...keys)
		} while (cursor !== '0')
	}

	private buildKey(key: string): string {
		return `dt-monitor:${key}`
	}

	async onModuleDestroy(): Promise<void> {
		await this.client.quit()
	}
}
