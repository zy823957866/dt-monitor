import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ProjectsModule } from '../projects/projects.module'
import { ReplaySession } from '../replays/replay-session.entity'
import { TraceSpan } from '../tracing/trace-span.entity'
import { ErrorEvent } from './error-event.entity'
import { Issue } from './issue.entity'
import { ErrorsController } from './errors.controller'
import { ErrorsService } from './errors.service'

/** 错误监控模块。 */
@Module({
	imports: [
		TypeOrmModule.forFeature([Issue, ErrorEvent, TraceSpan, ReplaySession]),
		ProjectsModule,
	],
	controllers: [ErrorsController],
	providers: [ErrorsService],
	exports: [ErrorsService],
})
export class ErrorsModule {}
