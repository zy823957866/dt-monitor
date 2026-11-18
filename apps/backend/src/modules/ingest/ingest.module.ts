import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AnalyticsEvent } from '../analytics/analytics-event.entity'
import { ErrorEvent } from '../errors/error-event.entity'
import { Issue } from '../errors/issue.entity'
import { PerformanceMetric } from '../performance/performance-metric.entity'
import { ProjectKey } from '../projects/project-key.entity'
import { Project } from '../projects/project.entity'
import { ReplaySession } from '../replays/replay-session.entity'
import { TraceSpan } from '../tracing/trace-span.entity'
import { IngestController } from './ingest.controller'
import { IngestService } from './ingest.service'
import { OtlpController } from './otlp.controller'
import { OtlpService } from './otlp.service'
import { ReplayChunk } from './replay-chunk.entity'
import { ReplayController } from './replay.controller'
import { ReplayIngestService } from './replay-ingest.service'
import { ReplayStorageService } from './replay-storage.service'

/** 公开数据面：浏览器事件、OTLP traces 与 Replay 分片。 */
@Module({
	imports: [
		TypeOrmModule.forFeature([
			Project,
			ProjectKey,
			Issue,
			ErrorEvent,
			PerformanceMetric,
			TraceSpan,
			AnalyticsEvent,
			ReplaySession,
			ReplayChunk,
		]),
	],
	controllers: [IngestController, OtlpController, ReplayController],
	providers: [IngestService, OtlpService, ReplayIngestService, ReplayStorageService],
})
export class IngestModule {}
