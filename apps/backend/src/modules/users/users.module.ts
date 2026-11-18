import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SsoRole } from '../auth-db/entities/sso-role.entity'
import { SsoUser } from '../auth-db/entities/sso-user.entity'
import { UsersService } from './users.service'

/** 用户模块：认证与权限守卫共用的 dt_frames 用户、角色、权限查询。 */
@Module({
	imports: [TypeOrmModule.forFeature([SsoUser, SsoRole], 'auth')],
	providers: [UsersService],
	exports: [UsersService],
})
export class UsersModule {}
