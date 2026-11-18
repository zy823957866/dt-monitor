import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ProjectsModule } from '../projects/projects.module'
import { AnalyticsEvent } from './analytics-event.entity'
import { AnalyticsController } from './analytics.controller'
import { AnalyticsService } from './analytics.service'

/** 埋点分析模块。 */
@Module({
	imports: [TypeOrmModule.forFeature([AnalyticsEvent]), ProjectsModule],
	controllers: [AnalyticsController],
	providers: [AnalyticsService],
	exports: [AnalyticsService],
})
export class AnalyticsModule {}
