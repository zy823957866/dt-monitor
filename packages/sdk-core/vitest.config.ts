import { defineConfig } from 'vitest/config'

/** core 事件管线单元测试配置。 */
export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/*.spec.ts'],
		restoreMocks: true,
	},
})
