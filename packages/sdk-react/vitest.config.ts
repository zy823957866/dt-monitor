import { defineConfig } from 'vitest/config'

/** React 适配器单元测试配置。 */
export default defineConfig({
	test: {
		environment: 'jsdom',
		include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
		restoreMocks: true,
	},
})
