import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { TypeOrmModule } from '@nestjs/typeorm'
import configuration, { type DatabaseConfig, toTypeOrmOptions } from './config/configuration'
import { JwtAuthGuard } from './common/guards/jwt-auth.guard'
import { PermissionGuard } from './common/guards/permission.guard'
import { AuthDbModule } from './database/auth-db.module'
import { RedisModule } from './redis/redis.module'
import { AlertsModule } from './modules/alerts/alerts.module'
import { AnalyticsModule } from './modules/analytics/analytics.module'
import { AuthModule } from './modules/auth/auth.module'
import { ErrorsModule } from './modules/errors/errors.module'
import { HealthModule } from './modules/health/health.module'
import { IngestModule } from './modules/ingest/ingest.module'
import { OverviewModule } from './modules/overview/overview.module'
import { PerformanceModule } from './modules/performance/performance.module'
import { ProjectsModule } from './modules/projects/projects.module'
import { ReplaysModule } from './modules/replays/replays.module'
import { TracingModule } from './modules/tracing/tracing.module'
import { UserEndpointModule } from './modules/user-endpoint/user-endpoint.module'
import { UsersModule } from './modules/users/users.module'

/** 后端根模块：配置、数据库、Redis、认证、限流及监控业务模块。 */
@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			load: [configuration],
			envFilePath: ['.env.local', '.env'],
		}),
		TypeOrmModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => {
				const database = configService.get<DatabaseConfig>('database')
				if (!database) throw new Error('数据库配置缺失')
				return toTypeOrmOptions({ database })
			},
		}),
		AuthDbModule,
		ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
		RedisModule,
		UsersModule,
		AuthModule,
		UserEndpointModule,
		HealthModule,
		ProjectsModule,
		IngestModule,
		ErrorsModule,
		PerformanceModule,
		TracingModule,
		ReplaysModule,
		AnalyticsModule,
		AlertsModule,
		OverviewModule,
	],
	providers: [
		{ provide: APP_GUARD, useClass: ThrottlerGuard },
		{ provide: APP_GUARD, useClass: JwtAuthGuard },
		{ provide: APP_GUARD, useClass: PermissionGuard },
	],
})
export class AppModule {}
