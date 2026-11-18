import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AlertHistory } from '../alerts/alert-history.entity'
import { AlertRule } from '../alerts/alert-rule.entity'
import { AnalyticsEvent } from '../analytics/analytics-event.entity'
import { ErrorEvent } from '../errors/error-event.entity'
import { Issue } from '../errors/issue.entity'
import { PerformanceMetric } from '../performance/performance-metric.entity'
import { ProjectsModule } from '../projects/projects.module'
import { ReplaySession } from '../replays/replay-session.entity'
import { TraceSpan } from '../tracing/trace-span.entity'
import { OverviewController } from './overview.controller'
import { OverviewService } from './overview.service'

/** 监控概览模块。 */
@Module({
	imports: [
		TypeOrmModule.forFeature([
			AnalyticsEvent,
			ErrorEvent,
			Issue,
			PerformanceMetric,
			TraceSpan,
			ReplaySession,
			AlertHistory,
			AlertRule,
		]),
		ProjectsModule,
	],
	controllers: [OverviewController],
	providers: [OverviewService],
})
export class OverviewModule {}
