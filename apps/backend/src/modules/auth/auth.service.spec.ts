import {
	BadGatewayException,
	ServiceUnavailableException,
	UnauthorizedException,
	type HttpException,
} from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RedisService } from '../../redis/redis.service'
import { AuthService } from './auth.service'

/** Vitest mock 函数类型。 */
type MockFn = ReturnType<typeof vi.fn>

/** 断言 Promise 以指定 HTTP 异常失败。 */
async function expectHttpFailure(
	operation: Promise<unknown>,
	exception: new (message: string) => HttpException,
	status: number,
	message: string,
): Promise<void> {
	try {
		await operation
	} catch (error) {
		expect(error).toBeInstanceOf(exception)
		const httpError = error as HttpException
		expect(httpError.getStatus()).toBe(status)
		const response = httpError.getResponse()
		const actualMessage =
			typeof response === 'string' ? response : (response as { message?: string }).message
		expect(actualMessage).toBe(message)
		return
	}
	throw new Error('Expected operation to reject')
}

describe('AuthService', () => {
	let service: AuthService
	let redisService: { delRaw: MockFn }
	let fetchMock: MockFn

	beforeEach(() => {
		redisService = { delRaw: vi.fn().mockResolvedValue(undefined) }
		fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)
		const configService = {
			get: vi.fn((key: string) =>
				key === 'authServer'
					? { url: 'http://localhost:3010/api', timeout: 1000 }
					: undefined,
			),
		}
		service = new AuthService(
			configService as unknown as ConfigService,
			redisService as unknown as RedisService,
		)
	})

	it('代理认证中心刷新并返回新令牌', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				code: 0,
				data: { accessToken: 'next-access', refreshToken: 'next-refresh' },
				message: 'ok',
			}),
		} as unknown as Response)

		await expect(service.refresh('refresh-token')).resolves.toEqual({
			accessToken: 'next-access',
			refreshToken: 'next-refresh',
		})
		expect(fetchMock).toHaveBeenCalledWith(
			'http://localhost:3010/api/auth/refresh',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({ refreshToken: 'refresh-token' }),
			}),
		)
	})

	it('认证中心返回 401 时映射为未授权', async () => {
		fetchMock.mockResolvedValue({
			ok: false,
			status: 401,
			json: async () => ({ code: 401, message: '刷新令牌已被撤销' }),
		} as unknown as Response)

		await expectHttpFailure(
			service.refresh('refresh-token'),
			UnauthorizedException,
			401,
			'刷新令牌已被撤销',
		)
	})

	it('认证中心 5xx 映射为网关错误', async () => {
		fetchMock.mockResolvedValue({
			ok: false,
			status: 500,
			json: async () => ({ code: 500, message: '认证服务内部错误' }),
		} as unknown as Response)

		await expectHttpFailure(
			service.refresh('refresh-token'),
			BadGatewayException,
			502,
			'认证服务内部错误',
		)
	})

	it('认证中心不可达时返回服务不可用', async () => {
		fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'))

		await expectHttpFailure(
			service.refresh('refresh-token'),
			ServiceUnavailableException,
			503,
			'认证服务不可用',
		)
	})

	it('认证中心未返回完整令牌时拒绝', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ code: 0, data: { accessToken: 'next-access' } }),
		} as unknown as Response)

		await expectHttpFailure(
			service.refresh('refresh-token'),
			UnauthorizedException,
			401,
			'认证服务未返回完整令牌',
		)
	})

	it('登出清理共享在线会话与 monitor 刷新键', async () => {
		await service.logout(1, 'jti-1')
		expect(redisService.delRaw).toHaveBeenCalledWith('dt-frame:auth:refresh:monitor:1')
		expect(redisService.delRaw).toHaveBeenCalledWith('dt-frame:monitor:online:jti-1')
	})
})
