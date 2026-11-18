import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { UsersModule } from '../users/users.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwksService } from './jwks.service'
import { JwtStrategy } from './jwt.strategy'

/** 认证模块。 */
@Module({
	imports: [UsersModule, PassportModule],
	controllers: [AuthController],
	providers: [AuthService, JwksService, JwtStrategy],
})
export class AuthModule {}
