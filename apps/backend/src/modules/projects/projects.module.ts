import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ProjectKey } from './project-key.entity'
import { Project } from './project.entity'
import { ProjectsController } from './projects.controller'
import { ProjectsService } from './projects.service'

/** 项目模块。 */
@Module({
	imports: [TypeOrmModule.forFeature([Project, ProjectKey])],
	controllers: [ProjectsController],
	providers: [ProjectsService],
	exports: [ProjectsService],
})
export class ProjectsModule {}
