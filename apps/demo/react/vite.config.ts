import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** React Demo 的 Vite 配置。 */
export default defineConfig({
	plugins: [react()],
	server: {
		port: 5182,
		proxy: {
			'/api': {
				target: 'http://localhost:3001',
				changeOrigin: true,
			},
		},
	},
})
