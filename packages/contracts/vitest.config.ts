import { defineConfig } from 'vitest/config'

/** contracts 纯函数单元测试配置。 */
export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/*.spec.ts'],
		restoreMocks: true,
	},
})
