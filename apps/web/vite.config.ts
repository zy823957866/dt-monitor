import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { DtFrameResolver } from '@dt-frames/ui/resolver'
import { Dtvite } from '@dt-frames/vite-plugin'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons'
import { loadEnv } from 'vite'

const dtConfig = Dtvite({
	framework: 'app',
	componentResolvers: [DtFrameResolver(), ...ElementPlusResolver()],
})

/** 开发代理目标：显式读取 .env，避免 vite.config 中 process.env 为空导致代理无 target。 */
const env = loadEnv(process.env.NODE_ENV ?? 'development', __dirname, '')
const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:3001'
const authProxyTarget = env.VITE_AUTH_PROXY_TARGET || 'http://localhost:3010'

/**
 * dt-frame-starter 构建配置：基于 @dt-frames/vite-plugin 的 app 模式。
 * 扩展了 SVG 图标雪碧图、路径别名、开发代理。
 */
export default {
	...dtConfig,
	envDir: '.',
	plugins: [
		...(dtConfig.plugins ?? []),
		createSvgIconsPlugin({
			iconDirs: [path.resolve(__dirname, 'src/assets/icons')],
			symbolId: 'icon-[name]',
		}),
	],
	esbuild: {
		jsx: 'automatic',
		jsxImportSource: 'vue',
	},
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
		},
	},
	server: {
		port: Number(env.VITE_DEV_PORT ?? 5173),
		proxy: {
			'/api': {
				target: apiProxyTarget,
				changeOrigin: true,
			},
			'/uploads': {
				target: apiProxyTarget,
				changeOrigin: true,
			},
			'/auth-api': {
				target: authProxyTarget,
				rewrite: (path: string) => path.replace(/^\/auth-api/, '/api'),
				changeOrigin: true,
			},
		},
	},
	preview: {
		proxy: {
			'/api': {
				target: apiProxyTarget,
				changeOrigin: true,
			},
			'/uploads': {
				target: apiProxyTarget,
				changeOrigin: true,
			},
			'/auth-api': {
				target: authProxyTarget,
				rewrite: (path: string) => path.replace(/^\/auth-api/, '/api'),
				changeOrigin: true,
			},
		},
	}
}
