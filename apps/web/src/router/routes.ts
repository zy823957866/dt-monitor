import type { RouteRecordRaw } from 'vue-router'

/**
 * 静态路由表：仅包含登录页。
 * 业务路由由后端 /user/menus 接口返回，通过 @dt-frames/layout 动态注册。
 */
export const routes: RouteRecordRaw[] = [
	{
		path: '/login',
		name: 'login',
		component: () => import('@/views/login/index.vue'),
		meta: { title: '登录' },
	},
	{
		path: '/sso/callback',
		name: 'sso-callback',
		component: () => import('@/views/sso/callback.vue'),
		meta: { title: '统一登录', ignoreAccess: true },
	},
	{
		path: '/monitor/overview',
		name: 'monitor-overview',
		component: () => import('@/views/monitor/overview/index.vue'),
		meta: { title: '监控概览' },
	},
	{
		path: '/monitor/errors',
		name: 'monitor-errors',
		component: () => import('@/views/monitor/errors/index.vue'),
		meta: { title: '错误列表' },
	},
	{
		path: '/monitor/errors/:id',
		name: 'monitor-error-detail',
		component: () => import('@/views/monitor/errors/detail/index.vue'),
		meta: { title: '错误详情' },
	},
	{
		path: '/monitor/performance',
		name: 'monitor-performance',
		component: () => import('@/views/monitor/performance/index.vue'),
		meta: { title: '性能总览' },
	},
	{
		path: '/monitor/traces',
		name: 'monitor-traces',
		component: () => import('@/views/monitor/traces/index.vue'),
		meta: { title: 'Trace 列表' },
	},
	{
		path: '/monitor/traces/:traceId',
		name: 'monitor-trace-detail',
		component: () => import('@/views/monitor/traces/detail/index.vue'),
		meta: { title: 'Trace 详情' },
	},
	{
		path: '/monitor/replays',
		name: 'monitor-replays',
		component: () => import('@/views/monitor/replays/index.vue'),
		meta: { title: 'Replay 列表' },
	},
	{
		path: '/monitor/analytics',
		name: 'monitor-analytics',
		component: () => import('@/views/monitor/analytics/index.vue'),
		meta: { title: '埋点分析' },
	},
	{
		path: '/monitor/projects',
		name: 'monitor-projects',
		component: () => import('@/views/monitor/projects/index.vue'),
		meta: { title: '项目管理' },
	},
	{
		path: '/monitor/sdk',
		name: 'monitor-sdk',
		component: () => import('@/views/monitor/sdk/index.vue'),
		meta: { title: 'SDK 接入' },
	},
	{
		path: '/monitor/alerts',
		name: 'monitor-alerts',
		component: () => import('@/views/monitor/alerts/index.vue'),
		meta: { title: '告警中心' },
	},
]
