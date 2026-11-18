import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ProjectsModule } from '../projects/projects.module'
import { ErrorEvent } from '../errors/error-event.entity'
import { Issue } from '../errors/issue.entity'
import { ReplaySession } from '../replays/replay-session.entity'
import { TraceSpan } from './trace-span.entity'
import { TracingController } from './tracing.controller'
import { TracingService } from './tracing.service'

/** Trace 查询模块。 */
@Module({
	imports: [
		TypeOrmModule.forFeature([TraceSpan, ErrorEvent, Issue, ReplaySession]),
		ProjectsModule,
	],
	controllers: [TracingController],
	providers: [TracingService],
	exports: [TracingService],
})
export class TracingModule {}
