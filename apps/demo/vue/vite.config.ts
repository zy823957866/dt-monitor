import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/** Vue Demo 的 Vite 配置。 */
export default defineConfig({
	plugins: [vue()],
	server: {
		port: 5181,
		proxy: {
			'/api': {
				target: 'http://localhost:3001',
				changeOrigin: true,
			},
		},
	},
})
