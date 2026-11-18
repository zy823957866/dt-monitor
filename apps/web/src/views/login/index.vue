<script setup lang="ts">
	/**
	 * 登录跳板页：清理本地登录态后自动跳转统一认证中心。
	 * 页面仅展示跳转状态或错误重试，不再提供账号密码输入。
	 */
	import { onMounted, ref } from 'vue'
	import { useRoute } from 'vue-router'
	import LogoUrl from '@/assets/imgs/login/logo-1.png'
	import { buildSsoLogoutUrl, sanitizeRedirectTarget } from '@/api/sso'

	const LogoBg = ref<string>('')
	const isBgLoaded = ref(false)
	const redirecting = ref(true)
	const errorMessage = ref('')
	const route = useRoute()

	/** 读取并清洗登录成功后的回跳目标。 @returns 应用内路径 */
	const resolveRedirect = (): string => {
		const raw = typeof route.query.redirect === 'string' ? route.query.redirect : ''
		return sanitizeRedirectTarget(raw, '/')
	}

	/** 发起统一登录跳转。 */
	const redirectToSso = async (): Promise<void> => {
		redirecting.value = true
		errorMessage.value = ''
		try {
			const url = await buildSsoLogoutUrl(resolveRedirect())
			window.location.replace(url)
		} catch (error) {
			redirecting.value = false
			errorMessage.value =
				error instanceof Error ? error.message : '无法连接统一登录服务，请稍后重试'
		}
	}

	onMounted(() => {
		import('@/assets/imgs/login/login-bg.webp?url').then((module) => {
			LogoBg.value = module.default
			isBgLoaded.value = true
		})
		void redirectToSso()
	})
</script>

<template>
	<div
		class="login-page relative h-full w-full overflow-hidden"
		:style="{
			'--el-color-primary': '#269ac1',
			'--el-color-primary-dark-2': '#17769c',
			'--el-color-primary-light-3': '#4ab2cf',
			'--el-border-radius-base': '4px',
		}"
	>
		<div class="absolute inset-0 bg-[#eef2f6]"></div>

		<div v-if="isBgLoaded && LogoBg" class="login-bg-anim absolute inset-0">
			<img
				:src="LogoBg"
				alt=""
				class="h-full w-full object-cover"
				loading="lazy"
				fetchpriority="low"
			/>
		</div>

		<div class="relative flex h-full min-h-0">
			<div
				class="hidden flex-1 flex-col justify-start px-12 pt-[60px] md:flex lg:px-16 xl:px-20"
			>
				<h1 class="text-3xl font-bold tracking-wide text-[#1a3a5c] lg:text-4xl">
					让数据驱动业务增长
				</h1>
				<p class="mt-4 text-xl flex items-center gap-3 text-[#627293]">
					<span>安全</span>
					<span>·</span>
					<span>稳定</span>
					<span>·</span>
					<span>高效</span>
					<span>·</span>
					<span>智能</span>
				</p>
			</div>

			<div
				class="flex w-full shrink-0 items-center justify-center px-10 py-8 md:w-auto md:justify-end md:pr-20"
			>
				<div
					class="login-card w-full max-w-[440px] md:w-[440px] md:shrink-0 overflow-hidden bg-white p-8"
				>
					<div class="flex justify-center gap-3 mb-10">
						<img :src="LogoUrl" alt="深迪科技" class="h-12 object-contain" />
					</div>

					<h2 class="text-xl font-bold tracking-widest text-[#303133]">统一登录</h2>
					<div
						class="mark-bar-content mb-6 mt-1 h-0 w-11 border-r-4 border-solid border-opacity-0"
					></div>

					<div v-if="redirecting" class="py-6 text-sm text-[#606266]">
						正在跳转统一认证中心…
					</div>
					<div v-else class="py-2">
						<p class="mb-5 text-sm text-[#606266]">{{ errorMessage }}</p>
						<ElButton type="primary" class="w-full" @click="redirectToSso">
							重新跳转
						</ElButton>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<style lang="css" scoped>
	.login-bg-anim img {
		animation: login-bg-drift 20s ease-in-out infinite alternate;
		will-change: transform;
	}

	@keyframes login-bg-drift {
		0% {
			transform: scale(1) translate(0, 0);
		}
		100% {
			transform: scale(1.03) translate(-1%, -0.5%);
		}
	}

	.mark-bar-content {
		border-color: transparent;
		border-top-color: var(--el-color-primary) !important;
		border-top-width: 6px;
		border-top-style: solid;
	}

	.login-card {
		border-radius: 16px;
		box-shadow:
			0 12px 30px -10px rgba(15, 23, 42, 0.18),
			0 6px 16px -6px rgba(15, 23, 42, 0.12);
	}
</style>
