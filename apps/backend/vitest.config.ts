import { defineConfig } from 'vitest/config'
import swc from 'unplugin-swc'

/** 后端单元测试配置：收集 src 目录下的 spec 文件。 */
export default defineConfig({
	plugins: [swc.vite()],
	test: {
		globals: true,
		include: ['src/**/*.spec.ts'],
	},
})
