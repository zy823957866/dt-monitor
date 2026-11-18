import { defineConfig } from 'vitest/config'

/** tracing SDK 依赖 jsdom 模拟 fetch/XHR。 */
export default defineConfig({
	test: {
		environment: 'jsdom',
		include: ['src/**/*.spec.ts'],
		restoreMocks: true,
	},
})
