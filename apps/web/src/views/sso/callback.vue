<script setup lang="ts">
	import { onMounted, ref } from 'vue'
	import { useRoute } from 'vue-router'
	import { useAccessStore, useAuthStore } from '@dt-frames/layout'
	import {
		SSO_NONCE_KEY,
		SSO_PKCE_VERIFIER_KEY,
		SSO_REDIRECT_KEY,
		SSO_STATE_KEY,
		buildSsoCallbackUrl,
		exchangeAuthCode,
		sanitizeRedirectTarget,
		validateIdTokenNonce,
		withAppBase,
	} from '@/api/sso'

	const route = useRoute()
	const exchanging = ref(true)
	const errorMessage = ref('')
	const redirectTarget = ref('/')

	/**
	 * 校验回调 state。
	 * @returns 是否通过
	 */
	const validateState = (): boolean => {
		const returnedState = typeof route.query.state === 'string' ? route.query.state : ''
		const expectedState = sessionStorage.getItem(SSO_STATE_KEY) ?? ''
		sessionStorage.removeItem(SSO_STATE_KEY)
		return Boolean(expectedState) && Boolean(returnedState) && returnedState === expectedState
	}

	/** 处理统一登录回调。 */
	const handleCallback = async (): Promise<void> => {
		const code = typeof route.query.code === 'string' ? route.query.code : ''
		const storedRedirect = sessionStorage.getItem(SSO_REDIRECT_KEY)
		if (storedRedirect) {
			sessionStorage.removeItem(SSO_REDIRECT_KEY)
			redirectTarget.value = sanitizeRedirectTarget(storedRedirect, '/')
		}

		if (!validateState()) {
			errorMessage.value = 'SSO 状态校验失败，请重新登录'
			return
		}
		if (!code) {
			errorMessage.value = '缺少授权码，登录失败，请重新登录'
			return
		}

		const codeVerifier = sessionStorage.getItem(SSO_PKCE_VERIFIER_KEY) ?? ''
		const nonce = sessionStorage.getItem(SSO_NONCE_KEY) ?? ''
		sessionStorage.removeItem(SSO_PKCE_VERIFIER_KEY)
		sessionStorage.removeItem(SSO_NONCE_KEY)
		if (!codeVerifier || !nonce) {
			errorMessage.value = '缺少 PKCE 校验参数，请重新登录'
			return
		}

		try {
			const result = await exchangeAuthCode({
				code,
				redirectUri: buildSsoCallbackUrl(),
				clientId:
					(import.meta.env.VITE_OIDC_CLIENT_ID as string | undefined) || 'monitor',
				codeVerifier,
			})
			if (!validateIdTokenNonce(result.id_token, nonce)) {
				errorMessage.value = 'SSO 令牌校验失败，请重新登录'
				return
			}

			const accessStore = useAccessStore()
			accessStore.setAccessToken(result.access_token)
			accessStore.setRefreshToken(result.refresh_token)

			let target = redirectTarget.value
			if (!storedRedirect) {
				const { firstPath } = await useAuthStore().authLogin(result.access_token)
				target = firstPath || target
			}
			window.location.href = withAppBase(target || '/')
		} catch (error) {
			errorMessage.value =
				error instanceof Error ? error.message : 'SSO 登录失败，请重试'
		} finally {
			exchanging.value = false
		}
	}

	onMounted(() => {
		void handleCallback()
	})
</script>

<template>
	<div class="flex h-full w-full items-center justify-center bg-[#eef2f6] px-6"></div>
</template>
