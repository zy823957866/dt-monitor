import { defineConfig } from 'vitest/config'

/** browser SDK 依赖 jsdom 模拟浏览器全局对象。 */
export default defineConfig({
	test: {
		environment: 'jsdom',
		include: ['src/**/*.spec.ts'],
		restoreMocks: true,
	},
})
