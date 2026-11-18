<script setup lang="ts">
import { ref } from 'vue'
import { flushAll, monitor, tracing } from './monitor'

const result = ref('等待操作')
const sensitive = ref('')

function trackEvent() {
	monitor?.track('demo_button_click', { framework: 'vue', scene: 'e2e' })
	result.value = '已发送业务埋点'
}

function throwGlobalError() {
	setTimeout(() => {
		throw new Error('Vue Demo 全局错误')
	}, 0)
}

function throwComponentError() {
	throw new Error('Vue Demo 组件错误')
}

async function runTracing() {
	const handle = tracing()
	await handle?.withSpan('demo.fetch.health', async (span) => {
		span.setAttribute('demo.framework', 'vue')
		await fetch('/api/health')
	})
	result.value = 'Trace 已上报'
}

async function flush() {
	await flushAll()
	result.value = '队列与 Replay 分片已 flush'
}
</script>

<template>
	<main class="page">
		<section class="panel hero">
			<p class="eyebrow">dt-monitor</p>
			<h1>Vue 端到端上报 Demo</h1>
			<p class="lead">覆盖错误、埋点、Web Vitals、浏览器 Trace 与采样 Replay；服务端 OTLP 使用 Node 脚本验证。</p>
			<p v-if="!monitor" class="warning">未配置 VITE_MONITOR_DSN，当前只展示界面，不会发起上报。</p>
		</section>

		<section class="panel grid">
			<button @click="trackEvent">发送业务埋点</button>
			<button @click="throwGlobalError">触发全局错误</button>
			<button @click="throwComponentError">触发 Vue 组件错误</button>
			<button @click="runTracing">执行同源 Trace 请求</button>
			<button class="primary" @click="flush">立即 Flush</button>
		</section>

		<section class="panel">
			<p class="hint">服务端 OTLP 请先设置 <code>MONITOR_SERVER_KEY</code>，再运行 <code>pnpm otlp</code>；server key 不会进入浏览器包。</p>
		</section>

		<section class="panel">
			<label for="sensitive">敏感输入遮罩验证</label>
			<input id="sensitive" v-model="sensitive" data-dt-monitor-block placeholder="输入内容应在 Replay 中遮罩" />
			<p class="result">{{ result }}</p>
		</section>
	</main>
</template>
