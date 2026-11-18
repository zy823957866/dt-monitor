import {
	Catch,
	HttpException,
	HttpStatus,
	Logger,
	type ArgumentsHost,
	type ExceptionFilter,
} from '@nestjs/common'
import type { Request, Response } from 'express'

/** 全局异常过滤器：统一 `{ code, message, timestamp, path }` 结构。 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
	private readonly logger = new Logger(HttpExceptionFilter.name)

	catch(exception: unknown, host: ArgumentsHost): void {
		const ctx = host.switchToHttp()
		const response = ctx.getResponse<Response>()
		const request = ctx.getRequest<Request>()
		const status =
			exception instanceof HttpException
				? exception.getStatus()
				: HttpStatus.INTERNAL_SERVER_ERROR
		const body =
			exception instanceof HttpException ? exception.getResponse() : 'Internal server error'
		const message =
			typeof body === 'string' ? body : (body as { message?: string | string[] }).message
		if (status >= 500) {
			this.logger.error(exception instanceof Error ? exception.stack : String(exception))
		}
		response.status(status).json({
			code: status,
			message: Array.isArray(message)
				? message.join('; ')
				: (message ?? 'Internal server error'),
			timestamp: new Date().toISOString(),
			path: request.url,
		})
	}
}
