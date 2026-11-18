import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ProjectsModule } from '../projects/projects.module'
import { PerformanceMetric } from './performance-metric.entity'
import { PerformanceController } from './performance.controller'
import { PerformanceService } from './performance.service'

/** 性能监控模块。 */
@Module({
	imports: [TypeOrmModule.forFeature([PerformanceMetric]), ProjectsModule],
	controllers: [PerformanceController],
	providers: [PerformanceService],
	exports: [PerformanceService],
})
export class PerformanceModule {}
