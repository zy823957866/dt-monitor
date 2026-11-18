import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AnalyticsEvent } from '../analytics/analytics-event.entity'
import { ErrorEvent } from '../errors/error-event.entity'
import { ProjectsModule } from '../projects/projects.module'
import { ReplaySession } from './replay-session.entity'
import { ReplaysController } from './replays.controller'
import { ReplaysService } from './replays.service'

/** Replay 查询模块。 */
@Module({
	imports: [TypeOrmModule.forFeature([ReplaySession, AnalyticsEvent, ErrorEvent]), ProjectsModule],
	controllers: [ReplaysController],
	providers: [ReplaysService],
	exports: [ReplaysService],
})
export class ReplaysModule {}
