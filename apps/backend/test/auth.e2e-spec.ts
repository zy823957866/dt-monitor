import { generateKeyPairSync } from 'node:crypto'
import { INestApplication } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { JwtService } from '@nestjs/jwt'
import { Repository } from 'typeorm'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'
import { SsoMenu } from '../src/modules/auth-db/entities/sso-menu.entity'
import { SsoRole } from '../src/modules/auth-db/entities/sso-role.entity'
import { SsoUser } from '../src/modules/auth-db/entities/sso-user.entity'
import { SsoApp } from '../src/modules/auth-db/entities/sso-app.entity'
import { RedisService } from '../src/redis/redis.service'

describe('SSO auth and dt_frames permissions', () => {
	let app: INestApplication
	let userRepo: Repository<SsoUser>
	let roleRepo: Repository<SsoRole>
	let menuRepo: Repository<SsoMenu>
	let appRepo: Repository<SsoApp>
	let redisService: RedisService
	let privateKey: string
	let systemToken: string
	let normalToken: string

	const signToken = async (sub: number, username: string, jti: string, aud = 'monitor') => {
		return new JwtService().signAsync(
			{ sub, username, roles: [], jti, aud },
			{ privateKey, algorithm: 'RS256', expiresIn: '5m' },
		)
	}

	beforeAll(async () => {
		const keys = generateKeyPairSync('rsa', {
			modulusLength: 2048,
			publicKeyEncoding: { type: 'spki', format: 'pem' },
			privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
		})
		privateKey = keys.privateKey
		process.env.JWT_PUBLIC_KEY = keys.publicKey
		process.env.JWT_ACCESS_SECRET = 'e2e-access-secret'

		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile()
		app = moduleFixture.createNestApplication()
		configureApp(app)
		await app.init()

		userRepo = app.get(getRepositoryToken(SsoUser, 'auth'))
		roleRepo = app.get(getRepositoryToken(SsoRole, 'auth'))
		menuRepo = app.get(getRepositoryToken(SsoMenu, 'auth'))
		appRepo = app.get(getRepositoryToken(SsoApp, 'auth'))
		redisService = app.get(RedisService)

		const overviewMenu = await menuRepo.save(
			menuRepo.create({
				id: 'e2e_monitor_overview',
				appId: 'monitor',
				zhCnName: '概览',
				type: 'menu',
				path: '/monitor/overview',
				order: 1,
				hideInMenu: 0,
				authCode: 'monitor:overview:view',
				deleted: 0,
			}),
		)
		const projectCreateButton = await menuRepo.save(
			menuRepo.create({
				id: 'e2e_monitor_project_create',
				appId: 'monitor',
				zhCnName: '新建项目',
				type: 'button',
				order: 2,
				hideInMenu: 1,
				authCode: 'monitor:project:create',
				deleted: 0,
			}),
		)
		await menuRepo.save(
			menuRepo.create({
				id: 'e2e_frames_menu',
				appId: 'frames',
				zhCnName: '非 monitor 菜单',
				type: 'menu',
				path: '/system/user',
				order: 3,
				hideInMenu: 0,
				authCode: 'system:user:list',
				deleted: 0,
			}),
		)

		const systemRole = await roleRepo.save(
			roleRepo.create({
				id: 1,
				code: 'super_admin',
				name: '超级管理员',
				status: 1,
				isSystem: true,
				deleted: 0,
			}),
		)
		const normalRole = await roleRepo.save(
			roleRepo.create({
				id: 2,
				code: 'monitor_viewer',
				name: '监控查看',
				status: 1,
				isSystem: false,
				deleted: 0,
				menus: [overviewMenu],
			}),
		)
		const monitorApp = await appRepo.save(
			appRepo.create({
				id: 43,
				code: 'monitor',
				name: '监控平台',
				path: '/monitor/overview',
				order: 1,
				status: 1,
				entryType: 'app',
				isBuiltin: 0,
				deleted: 0,
			}),
		)
		await appRepo.save(
			appRepo.create({
				id: 44,
				code: 'frames',
				name: '系统框架',
				path: '/system/user',
				order: 2,
				status: 1,
				entryType: 'app',
				isBuiltin: 0,
				deleted: 0,
			}),
		)
		monitorApp.roles = [normalRole]
		await appRepo.save(monitorApp)
		await userRepo.save([
			userRepo.create({
				id: 100,
				username: 'system',
				nickname: '系统用户',
				status: 1,
				deleted: 0,
				roles: [systemRole],
			}),
			userRepo.create({
				id: 200,
				username: 'viewer',
				nickname: '查看用户',
				status: 1,
				deleted: 0,
				roles: [normalRole],
			}),
		])

		await redisService.setRaw(
			'dt-frame:monitor:online:e2e-system',
			JSON.stringify({ userId: 100, username: 'system' }),
			60,
		)
		await redisService.setRaw(
			'dt-frame:monitor:online:e2e-normal',
			JSON.stringify({ userId: 200, username: 'viewer' }),
			60,
		)
		systemToken = await signToken(100, 'system', 'e2e-system')
		normalToken = await signToken(200, 'viewer', 'e2e-normal')

		// 清理未使用的测试按钮变量，保证菜单已落库供系统角色全量查询
		expect(projectCreateButton.authCode).toBe('monitor:project:create')
	})

	afterAll(async () => {
		await redisService?.delRaw('dt-frame:monitor:online:e2e-system')
		await redisService?.delRaw('dt-frame:monitor:online:e2e-normal')
		await app?.close()
		delete process.env.JWT_PUBLIC_KEY
		delete process.env.JWT_ACCESS_SECRET
	})

	it('rejects requests without a bearer token', async () => {
		await request(app.getHttpServer()).get('/api/user/menus').expect(401)
	})

	it('returns only monitor menus for a system role', async () => {
		const response = await request(app.getHttpServer())
			.get('/api/user/menus')
			.set('Authorization', `Bearer ${systemToken}`)
			.expect(200)
		expect(response.body.data.map((menu: { id: string }) => menu.id)).toEqual([
			'e2e_monitor_overview',
			'e2e_monitor_project_create',
		])
	})

	it('returns only granted monitor menus for a normal role', async () => {
		const response = await request(app.getHttpServer())
			.get('/api/user/menus')
			.set('Authorization', `Bearer ${normalToken}`)
			.expect(200)
		expect(response.body.data).toHaveLength(1)
		expect(response.body.data[0].id).toBe('e2e_monitor_overview')
	})

	it('returns all enabled apps for a system role', async () => {
		const response = await request(app.getHttpServer())
			.get('/api/user/apps')
			.set('Authorization', `Bearer ${systemToken}`)
			.expect(200)
		expect(response.body.data.map((item: { code: string }) => item.code)).toEqual([
			'monitor',
			'frames',
		])
	})

	it('returns only apps granted in sys_app_role for a normal role', async () => {
		const response = await request(app.getHttpServer())
			.get('/api/user/apps')
			.set('Authorization', `Bearer ${normalToken}`)
			.expect(200)
		expect(response.body.data).toHaveLength(1)
		expect(response.body.data[0].code).toBe('monitor')
	})

	it('rejects a token with the wrong audience', async () => {
		const wrongAud = await signToken(100, 'system', 'e2e-system', 'frames')
		await request(app.getHttpServer())
			.get('/api/user/menus')
			.set('Authorization', `Bearer ${wrongAud}`)
			.expect(401)
	})

	it('rejects a token whose shared session was revoked', async () => {
		await redisService.delRaw('dt-frame:monitor:online:e2e-normal')
		const freshToken = await signToken(200, 'viewer', 'e2e-normal')
		await request(app.getHttpServer())
			.get('/api/user/menus')
			.set('Authorization', `Bearer ${freshToken}`)
			.expect(401)
	})

	it('enforces permission codes from dt_frames menus', async () => {
		await redisService.setRaw(
			'dt-frame:monitor:online:e2e-normal',
			JSON.stringify({ userId: 200, username: 'viewer' }),
			60,
		)
		const denied = await request(app.getHttpServer())
			.get('/api/monitor/alerts/summary')
			.set('Authorization', `Bearer ${normalToken}`)
			.expect(403)
		expect(String(denied.body.message)).toContain('monitor:alert:list')
		await request(app.getHttpServer())
			.get('/api/monitor/projects')
			.set('Authorization', `Bearer ${systemToken}`)
			.expect(200)
	})
})
