import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import express, { type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'

/**
 * 统一配置 Nest 应用：安全头、CORS、全局前缀、校验、响应壳和 Swagger。
 * @param app Nest 应用实例
 */
export function configureApp(app: INestApplication): void {
	const config = app.get(ConfigService)
	const corsOrigins = config.get<string[]>('corsOrigins') ?? []
	app.use('/api/replay', collectReplayBody)
	app.use(express.json({ limit: '1mb' }))
	app.use(express.text({ type: 'text/plain', limit: '1mb' }))
	app.use(
		helmet({
			contentSecurityPolicy: false,
			crossOriginEmbedderPolicy: false,
		}),
	)
	app.enableCors({
		origin: corsOrigins.length ? corsOrigins : false,
		credentials: true,
		methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
	})
	app.setGlobalPrefix('api')
	app.useGlobalPipes(
		new ValidationPipe({
			transform: true,
			whitelist: true,
			forbidNonWhitelisted: true,
			transformOptions: { enableImplicitConversion: false },
		}),
	)
	app.useGlobalFilters(new HttpExceptionFilter())
	app.useGlobalInterceptors(new TransformInterceptor())
	const swaggerConfig = new DocumentBuilder()
		.setTitle('dt-monitor API')
		.setDescription('dt-monitor 管理端与后续上报接口')
		.setVersion('0.1.0')
		.addBearerAuth()
		.build()
	const document = SwaggerModule.createDocument(app, swaggerConfig)
	SwaggerModule.setup('docs', app, document, {
		useGlobalPrefix: true,
		swaggerOptions: { persistAuthorization: true },
	})
}

/**
 * 保留 Replay gzip 原始字节，禁止 body-parser 自动解压。
 * @param req Express 请求
 * @param res Express 响应
 * @param next 下一个中间件
 */
function collectReplayBody(req: Request, res: Response, next: NextFunction): void {
	if (req.method !== 'POST' || !req.is('application/octet-stream')) {
		next()
		return
	}
	const chunks: Buffer[] = []
	let size = 0
	let rejected = false
	req.on('data', (chunk: Buffer) => {
		size += chunk.length
		if (size > 300 * 1024 && !rejected) {
			rejected = true
			res.status(413).json({
				code: 413,
				message: 'Replay 分片过大',
				timestamp: new Date().toISOString(),
				path: req.path,
			})
			req.destroy()
			return
		}
		chunks.push(chunk)
	})
	req.on('end', () => {
		if (!rejected) {
			req.body = Buffer.concat(chunks)
			next()
		}
	})
	req.on('error', next)
}
