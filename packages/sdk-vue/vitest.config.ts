import { defineConfig } from 'vitest/config'

/** Vue 适配器单元测试配置。 */
export default defineConfig({
	test: {
		environment: 'jsdom',
		include: ['src/**/*.spec.ts'],
		restoreMocks: true,
	},
})
