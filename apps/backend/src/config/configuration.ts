import type { TypeOrmModuleOptions } from '@nestjs/typeorm'
import { AlertHistory } from '../modules/alerts/alert-history.entity'
import { AlertRule } from '../modules/alerts/alert-rule.entity'
import { AnalyticsEvent } from '../modules/analytics/analytics-event.entity'
import { SsoMenu } from '../modules/auth-db/entities/sso-menu.entity'
import { SsoRole } from '../modules/auth-db/entities/sso-role.entity'
import { SsoUser } from '../modules/auth-db/entities/sso-user.entity'
import { SsoApp } from '../modules/auth-db/entities/sso-app.entity'
import { ErrorEvent } from '../modules/errors/error-event.entity'
import { Issue } from '../modules/errors/issue.entity'
import { PerformanceMetric } from '../modules/performance/performance-metric.entity'
import { ReplayChunk } from '../modules/ingest/replay-chunk.entity'
import { ProjectKey } from '../modules/projects/project-key.entity'
import { Project } from '../modules/projects/project.entity'
import { ReplaySession } from '../modules/replays/replay-session.entity'
import { TraceSpan } from '../modules/tracing/trace-span.entity'

/** MySQL / SQLite 数据库配置。 */
export interface DatabaseConfig {
	type: 'mysql' | 'better-sqlite3'
	host: string
	port: number
	username: string
	password: string
	database: string
	charset: string
	timezone: string
	synchronize: boolean
	entities: Array<new (...args: never[]) => object>
}

/** Redis 连接配置。 */
export interface RedisConfig {
	host: string
	port: number
	connectTimeout: number
	ttl: number
}

/** JWT 配置。 */
export interface JwtConfig {
	accessSecret: string
	accessExpiresIn: string
	refreshSecret: string
	refreshExpiresIn: string
	/** 统一认证中心 RSA 公钥 PEM，用于校验 SSO 访问令牌 */
	publicKey?: string
}

/** 统一认证服务配置。 */
export interface AuthServerConfig {
	/** auth-server 内部访问地址（含 /api 前缀） */
	url: string
	/** 请求超时毫秒数 */
	timeout: number
}

/** 应用总配置。 */
export interface AppConfig {
	port: number
	corsOrigins: string[]
	database: DatabaseConfig
	authDatabase: DatabaseConfig
	redis: RedisConfig
	jwt: JwtConfig
	authServer: AuthServerConfig
	dsnOrigin: string
	replayStorageDir: string
}

/**
 * 解析允许访问后端的浏览器来源。
 * @param value CORS_ORIGINS 环境变量
 * @param nodeEnv 当前运行环境
 * @returns 允许的 Origin 列表；生产环境未配置时默认禁止跨域
 */
export function parseCorsOrigins(value?: string, nodeEnv = process.env.NODE_ENV): string[] {
	const configured = value
		?.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean)
	if (configured?.length) return configured
	if (nodeEnv === 'production') return []
	return ['http://localhost:5173', 'http://localhost:5181', 'http://localhost:5182']
}

/** TypeORM 实体清单。 */
export const entities = [
	Project,
	ProjectKey,
	Issue,
	ErrorEvent,
	PerformanceMetric,
	TraceSpan,
	ReplaySession,
	AnalyticsEvent,
	AlertRule,
	AlertHistory,
	ReplayChunk,
]

/** 统一认证库实体清单（连接 dt_frames）。 */
export const authEntities = [SsoUser, SsoRole, SsoMenu, SsoApp]

/**
 * 读取环境变量生成应用配置。
 * @returns 归一化配置对象
 */
export default (): AppConfig => {
	const databaseType = (process.env.DB_TYPE ?? 'mysql') as DatabaseConfig['type']
	const authDatabaseType = (process.env.AUTH_DB_TYPE ?? databaseType) as DatabaseConfig['type']
	return {
		port: Number(process.env.PORT ?? 3001),
		corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),
		database: {
			type: databaseType,
			host: process.env.DB_HOST ?? 'localhost',
			port: Number(process.env.DB_PORT ?? 3306),
			username: process.env.DB_USERNAME ?? 'root',
			password: process.env.DB_PASSWORD ?? '',
			database: process.env.DB_DATABASE ?? 'dt_monitor',
			charset: process.env.DB_CHARSET ?? 'utf8mb4',
			timezone: process.env.DB_TIMEZONE ?? '+08:00',
			synchronize: process.env.DB_SYNCHRONIZE === 'true',
			entities,
		},
		authDatabase: {
			type: authDatabaseType,
			host: process.env.AUTH_DB_HOST ?? process.env.DB_HOST ?? 'localhost',
			port: Number(process.env.AUTH_DB_PORT ?? process.env.DB_PORT ?? 3306),
			username: process.env.AUTH_DB_USERNAME ?? process.env.DB_USERNAME ?? 'root',
			password: process.env.AUTH_DB_PASSWORD ?? process.env.DB_PASSWORD ?? '',
			database:
				process.env.AUTH_DB_DATABASE ??
				(authDatabaseType === 'better-sqlite3' ? ':memory:' : 'dt_frames'),
			charset: process.env.AUTH_DB_CHARSET ?? process.env.DB_CHARSET ?? 'utf8mb4',
			timezone: process.env.AUTH_DB_TIMEZONE ?? process.env.DB_TIMEZONE ?? '+08:00',
			synchronize:
				process.env.AUTH_DB_SYNCHRONIZE === 'true' ||
				(authDatabaseType === 'better-sqlite3' &&
					process.env.DB_SYNCHRONIZE === 'true'),
			entities: authEntities,
		},
		redis: {
			host: process.env.REDIS_HOST ?? 'localhost',
			port: Number(process.env.REDIS_PORT ?? 6379),
			connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT ?? 5000),
			ttl: Number(process.env.REDIS_TTL ?? 3600),
		},
		jwt: {
			accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dt-monitor-dev-access-secret',
			accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
			refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dt-monitor-dev-refresh-secret',
			refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
			publicKey: process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, '\n'),
		},
		authServer: {
			url: process.env.AUTH_SERVER_URL ?? 'http://localhost:3010/api',
			timeout: Number(process.env.AUTH_SERVER_TIMEOUT ?? 10_000),
		},
		dsnOrigin: process.env.MONITOR_DSN_ORIGIN ?? 'http://localhost:3001/api',
		replayStorageDir: process.env.REPLAY_STORAGE_DIR ?? './data/replays',
	}
}

/**
 * 根据配置生成 TypeORM 模块选项。
 * @param config 应用配置
 * @returns TypeORM 模块选项
 */
export function toTypeOrmOptions(config: { database: DatabaseConfig }): TypeOrmModuleOptions {
	const database = config.database
	if (database.type === 'better-sqlite3') {
		return {
			type: 'better-sqlite3',
			database: database.database || ':memory:',
			synchronize: database.synchronize,
			entities: database.entities,
		}
	}
	return {
		type: 'mysql',
		host: database.host,
		port: database.port,
		username: database.username,
		password: database.password,
		database: database.database,
		charset: database.charset,
		timezone: database.timezone,
		synchronize: database.synchronize,
		entities: database.entities,
	}
}
