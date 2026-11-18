import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SsoMenu } from '../auth-db/entities/sso-menu.entity'
import { SsoRole } from '../auth-db/entities/sso-role.entity'
import { SsoApp } from '../auth-db/entities/sso-app.entity'
import { UsersModule } from '../users/users.module'
import { UserEndpointController } from './user-endpoint.controller'
import { UserEndpointService } from './user-endpoint.service'

/** 用户侧端点模块：菜单与权限来自 dt_frames。 */
@Module({
	imports: [TypeOrmModule.forFeature([SsoMenu, SsoRole, SsoApp], 'auth'), UsersModule],
	controllers: [UserEndpointController],
	providers: [UserEndpointService],
})
export class UserEndpointModule {}
