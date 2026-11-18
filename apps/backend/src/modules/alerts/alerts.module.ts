import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ProjectsModule } from '../projects/projects.module'
import { AlertHistory } from './alert-history.entity'
import { AlertRule } from './alert-rule.entity'
import { AlertsController } from './alerts.controller'
import { AlertsService } from './alerts.service'

/** 告警中心模块。 */
@Module({
	imports: [TypeOrmModule.forFeature([AlertRule, AlertHistory]), ProjectsModule],
	controllers: [AlertsController],
	providers: [AlertsService],
	exports: [AlertsService],
})
export class AlertsModule {}
