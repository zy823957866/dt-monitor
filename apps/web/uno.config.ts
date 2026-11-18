import { defineConfig, presetAttributify, presetIcons, presetUno } from 'unocss'
import { fileURLToPath } from 'node:url'

/** 需要参与 UnoCSS 扫描的 @dt-frames 包源码目录（npm 包只有编译后 JS）。 */
const dtFramePackageFiles = ['layout', 'ui', 'core', 'icons'].map((name) =>
	fileURLToPath(new URL(`./node_modules/@dt-frames/${name}/es/**/*.js`, import.meta.url)).replaceAll(
		'\\',
		'/',
	),
)

/**
 * UnoCSS 原子化 CSS 配置。
 */
export default defineConfig({
	presets: [presetUno(), presetAttributify(), presetIcons()],
	content: {
		filesystem: dtFramePackageFiles,
		pipeline: {
			include: [
				/\.(vue|svelte|[jt]sx|vine\.ts|mdx?|astro|elm|php|phtml|marko|html)($|\?)/,
				/@dt-frames[\\/](layout|ui|core|icons)[\\/].*\.js$/,
			],
		},
	},
	shortcuts: {
		'flex-center': 'flex items-center justify-center',
		'page-card': 'bg-white rounded-lg p-4 shadow-sm',
	},
})
