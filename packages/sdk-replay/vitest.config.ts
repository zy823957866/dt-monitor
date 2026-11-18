import { defineConfig } from 'vitest/config'

/** replay SDK 使用 jsdom 并注入假的录制/上传适配器。 */
export default defineConfig({
	test: {
		environment: 'jsdom',
		include: ['src/**/*.spec.ts'],
		restoreMocks: true,
	},
})
