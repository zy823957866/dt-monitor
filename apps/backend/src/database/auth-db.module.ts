import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import type { DatabaseConfig } from '../config/configuration'
import { toTypeOrmOptions } from '../config/configuration'

/** 统一认证库模块：以命名连接 auth 只读访问 dt_frames。 */
@Module({
	imports: [
		TypeOrmModule.forRootAsync({
			name: 'auth',
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => {
				const authDatabase = configService.get<DatabaseConfig>('authDatabase')
				if (!authDatabase) throw new Error('统一认证库配置缺失')
				return {
					name: 'auth',
					...toTypeOrmOptions({ database: authDatabase }),
				}
			},
		}),
	],
})
export class AuthDbModule {}
