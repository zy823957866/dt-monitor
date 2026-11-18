import {
	Injectable,
	type CallHandler,
	type ExecutionContext,
	type NestInterceptor,
} from '@nestjs/common'
import type { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

/** 统一成功响应结构。 */
export interface ApiResponse<T> {
	code: number
	data: T
	message: string
}

/** 全局响应拦截器：包装 `{ code: 0, data, message: 'ok' }`。 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
	intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
		return next.handle().pipe(map((data) => ({ code: 0, data, message: 'ok' })))
	}
}
