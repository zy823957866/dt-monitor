import { defineConfig } from 'vitest/config'
import swc from 'unplugin-swc'

/** 后端 e2e 配置：使用内存 SQLite 与已运行 Redis，覆盖管理主链路。 */
export default defineConfig({
	plugins: [swc.vite()],
	test: {
		env: {
			CAPTCHA_ENABLED: 'false',
			NODE_ENV: 'test',
			DB_TYPE: 'better-sqlite3',
			DB_DATABASE: ':memory:',
			DB_SYNCHRONIZE: 'true',
		},
		globals: true,
		include: ['test/**/*.e2e-spec.ts'],
		testTimeout: 30000,
		hookTimeout: 60000,
	},
})
