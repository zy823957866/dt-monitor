import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { configureApp } from './app.setup'

/** 启动 NestJS 服务。 */
async function bootstrap(): Promise<void> {
	const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false })
	configureApp(app)
	const config = app.get(ConfigService)
	const port = config.get<number>('port') ?? 3001
	await app.listen(port)
	Logger.log(`dt-monitor API listening on http://localhost:${port}/api`, 'Bootstrap')
	Logger.log(`Swagger available at http://localhost:${port}/api/docs`, 'Bootstrap')
}

void bootstrap()
