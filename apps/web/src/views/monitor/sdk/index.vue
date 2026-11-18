<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElAlert, ElButton, ElIcon, ElInput, ElMessage, ElTag } from 'element-plus'
import { Check, CopyDocument, Warning } from '@element-plus/icons-vue'
import MonitorFilterBar from '@/components/monitor/MonitorFilterBar.vue'
import MonitorPageHeader from '@/components/monitor/MonitorPageHeader.vue'
import MonitorSection from '@/components/monitor/MonitorSection.vue'
import { getProjectDsn, type ProjectDsnVO } from '@/api/monitor'
import { useMonitorStore } from '@/stores/monitor'
import { http } from '@/utils/http'

const store = useMonitorStore()
const loading = ref(false)
const dsn = ref<ProjectDsnVO>()
const projectName = ref('')
const health = ref<{ status: string; database: boolean; redis: boolean }>()
const healthLatency = ref(0)

/** 安装命令。 */
const installCommand = [
	'pnpm add @dt-monitor/sdk-browser @dt-monitor/sdk-tracing @dt-monitor/sdk-replay',
	'pnpm add @dt-monitor/sdk-vue   # Vue 3',
	'pnpm add @dt-monitor/sdk-react # React',
].join('\n')

/** Vue 初始化示例。 */
const vueExample = computed(() =>
	[
		"import { initMonitor, errorsPlugin, performancePlugin, analyticsPlugin } from '@dt-monitor/sdk-browser'",
		"import { tracingPlugin } from '@dt-monitor/sdk-tracing'",
		"import { replayPlugin } from '@dt-monitor/sdk-replay'",
		"import { createMonitorVuePlugin } from '@dt-monitor/sdk-vue'",
		'',
		'const monitor = initMonitor({',
		"  dsn: '" + (dsn.value?.dsn || '<在项目接入信息中获取 DSN>') + "',",
		"  app: { name: 'my-vue-app', version: '1.0.0' },",
		"  environment: 'production',",
		'  plugins: [',
		'    errorsPlugin(),',
		'    performancePlugin(),',
		'    analyticsPlugin({ autoPageView: false, initialPageView: false }),',
		'    tracingPlugin({ tracesSampleRate: 0.1 }),',
		'    replayPlugin({ sessionSampleRate: 0.01, errorSampleRate: 1 }),',
		'  ],',
		'})',
		'',
		'// 路由 pageview 由 Vue 适配器记录，避免 analytics 重复采集',
		'app.use(createMonitorVuePlugin({ client: monitor, router, trackPageView: true }))',
	].join('\n'),
)

/** React 初始化示例。 */
const reactExample = computed(() =>
	[
		"import { initMonitor, errorsPlugin, performancePlugin, analyticsPlugin } from '@dt-monitor/sdk-browser'",
		"import { tracingPlugin } from '@dt-monitor/sdk-tracing'",
		"import { replayPlugin } from '@dt-monitor/sdk-replay'",
		"import { MonitorErrorBoundary, MonitorProvider } from '@dt-monitor/sdk-react'",
		'',
		'const monitor = initMonitor({',
		"  dsn: '" + (dsn.value?.dsn || '<在项目接入信息中获取 DSN>') + "',",
		"  app: { name: 'my-react-app', version: '1.0.0' },",
		"  environment: 'production',",
		'  plugins: [',
		'    errorsPlugin(),',
		'    performancePlugin(),',
		'    analyticsPlugin(),',
		'    tracingPlugin({ tracesSampleRate: 0.1 }),',
		'    replayPlugin({ sessionSampleRate: 0.01, errorSampleRate: 1 }),',
		'  ],',
		'})',
		'',
		'export function Root() {',
		'  return (',
		'    <MonitorProvider client={monitor}>',
		'      <MonitorErrorBoundary componentName="AppRoot" fallback={<ErrorFallback />}>',
		'        <App />',
		'      </MonitorErrorBoundary>',
		'    </MonitorProvider>',
		'  )',
		'}',
	].join('\n'),
)

/** JS 上报示例。 */
const trackExample = [
	"monitor.track('cart_add', {",
	"  skuId: 'SKU-3847',",
	'  price: 1299,',
	"  channel: 'detail',",
	'})',
].join('\n')

/**
 * 加载 DSN 与健康状态。
 * @returns Promise<void>
 */
async function load(): Promise<void> {
	loading.value = true
	try {
		const projectId = await store.ensureProject()
		if (projectId) {
			projectName.value = store.activeProjects.find((item) => item.id === projectId)?.name ?? ''
			dsn.value = await getProjectDsn(projectId)
		}
		const startedAt = performance.now()
		health.value = await http.get<{
			status: string
			database: boolean
			redis: boolean
		}>('/health')
		healthLatency.value = Math.round(performance.now() - startedAt)
	} finally {
		loading.value = false
	}
}

/**
 * 复制文本。
 * @param text 文本
 * @param label 文案
 * @returns Promise<void>
 */
async function copy(text: string, label: string): Promise<void> {
	await navigator.clipboard.writeText(text)
	ElMessage.success(label + '已复制')
}

onMounted(load)
</script>

<template>
	<div
		class="box-border flex min-h-[var(--dt-content-height,100vh)] w-full flex-col gap-4 overflow-auto p-5"
	>
		<MonitorPageHeader
			title="SDK 接入"
			description="管理项目 DSN，查看接入步骤、配置项与联调状态。"
		>
			<MonitorFilterBar @refresh="load" />
		</MonitorPageHeader>

		<MonitorSection
			title="接入 dt-monitor 前端监控 SDK"
			description="错误、性能、埋点、Tracing 与 Session Replay 的统一接入契约。"
		>
			<ElAlert
				title="SDK 分包已在 workspace 落地"
				type="warning"
				:closable="false"
				show-icon
				description="contracts、sdk-core、sdk-browser、sdk-tracing、sdk-replay、sdk-vue、sdk-react 已实现并通过单测；当前未发布 npm，且后端 /ingest、OTLP 与 Replay 上传入口尚未实现，示例暂不能完成真实端到端上报。"
			/>
			<div class="mt-4 flex flex-wrap gap-2">
				<ElInput :model-value="dsn?.dsn || ''" readonly placeholder="选择项目后生成 DSN" />
				<ElButton
					type="primary"
					:icon="CopyDocument"
					:disabled="!dsn"
					@click="copy(dsn?.dsn || '', 'DSN ')"
				>
					复制 DSN
				</ElButton>
			</div>
			<div class="mt-2 text-[12px] text-[#9ca3af]">
				项目：{{ projectName || '-' }} · 上报主机：{{ dsn?.origin || '-' }}
			</div>
		</MonitorSection>

		<section class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
			<div class="flex min-w-0 flex-col gap-4">
				<MonitorSection title="1. 安装 SDK（按宿主选择适配包）">
					<template #extra><ElTag size="small" type="info">bash</ElTag></template>
					<div class="flex items-center gap-2 rounded-md bg-[#0f172a] p-3">
						<code class="min-w-0 flex-1 overflow-auto whitespace-pre text-[12px] text-[#e2e8f0]">{{
							installCommand
						}}</code>
						<ElButton
							text
							:icon="CopyDocument"
							class="!text-white"
							@click="copy(installCommand, '安装命令')"
						/>
					</div>
				</MonitorSection>

				<MonitorSection title="2. 初始化（Vue 3）">
					<template #extra><ElTag size="small" type="info">vue</ElTag></template>
					<div class="flex items-start gap-2 rounded-md bg-[#0f172a] p-3">
						<code
							class="min-w-0 flex-1 overflow-auto whitespace-pre text-[12px] leading-5 text-[#e2e8f0]"
							>{{ vueExample }}</code
						>
						<ElButton
							text
							:icon="CopyDocument"
							class="!text-white"
							@click="copy(vueExample, '初始化示例')"
						/>
					</div>
				</MonitorSection>

				<MonitorSection title="3. 初始化（React）">
					<template #extra><ElTag size="small" type="info">react</ElTag></template>
					<div class="flex items-start gap-2 rounded-md bg-[#0f172a] p-3">
						<code
							class="min-w-0 flex-1 overflow-auto whitespace-pre text-[12px] leading-5 text-[#e2e8f0]"
							>{{ reactExample }}</code
						>
						<ElButton
							text
							:icon="CopyDocument"
							class="!text-white"
							@click="copy(reactExample, 'React 初始化示例')"
						/>
					</div>
				</MonitorSection>

				<MonitorSection title="4. 自定义业务埋点">
					<template #extra><ElTag size="small" type="info">ts</ElTag></template>
					<div class="flex items-start gap-2 rounded-md bg-[#0f172a] p-3">
						<code
							class="min-w-0 flex-1 overflow-auto whitespace-pre text-[12px] leading-5 text-[#e2e8f0]"
							>{{ trackExample }}</code
						>
						<ElButton
							text
							:icon="CopyDocument"
							class="!text-white"
							@click="copy(trackExample, '埋点示例')"
						/>
					</div>
				</MonitorSection>

				<MonitorSection title="常用配置项">
					<div class="grid grid-cols-[150px_80px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
						<span class="font-mono text-[#1677ff]">dsn</span
						><span class="text-[#8c8c8c]">string</span><span>上报地址（必填）</span>
						<span class="font-mono text-[#1677ff]">app</span
						><span class="text-[#8c8c8c]">object</span><span>应用名称与版本</span>
						<span class="font-mono text-[#1677ff]">environment</span
						><span class="text-[#8c8c8c]">string</span><span>production / staging 等</span>
						<span class="font-mono text-[#1677ff]">plugins</span
						><span class="text-[#8c8c8c]">array</span
						><span>错误、性能、埋点、Tracing、Replay 插件</span>
						<span class="font-mono text-[#1677ff]">beforeSend</span
						><span class="text-[#8c8c8c]">fn</span><span>上报前脱敏与改写</span>
					</div>
				</MonitorSection>
			</div>

			<aside class="flex min-w-0 flex-col gap-4">
				<MonitorSection title="接入状态检查">
					<div v-loading="loading" class="flex flex-col gap-3 text-[13px]">
						<div class="flex items-center justify-between gap-2">
							<span class="flex items-center gap-2 text-[#374151]">
								<ElIcon :class="health?.status === 'ok' ? 'text-[#16a34a]' : 'text-[#f59e0b]'">
									<Check v-if="health?.status === 'ok'" /><Warning v-else />
								</ElIcon>
								服务健康检查
							</span>
							<span class="text-[12px] text-[#6b7280]">{{
								health ? health.status + ' · ' + healthLatency + 'ms' : '未检查'
							}}</span>
						</div>
						<div class="flex items-center justify-between gap-2">
							<span class="flex items-center gap-2 text-[#374151]">
								<ElIcon class="text-[#16a34a]"><Check /></ElIcon>
								数据库 / Redis
							</span>
							<span class="text-[12px] text-[#6b7280]">
								{{
									health
										? (health.database ? 'DB 正常' : 'DB 异常') +
											' · ' +
											(health.redis ? 'Redis 正常' : 'Redis 异常')
										: '未检查'
								}}
							</span>
						</div>
						<div class="flex items-center justify-between gap-2">
							<span class="flex items-center gap-2 text-[#374151]">
								<ElIcon class="text-[#16a34a]"><Check /></ElIcon>
								SDK 包
							</span>
							<ElTag size="small" type="success" effect="light">workspace 已实现</ElTag>
						</div>
						<div class="flex items-center justify-between gap-2">
							<span class="flex items-center gap-2 text-[#374151]">
								<ElIcon class="text-[#f59e0b]"><Warning /></ElIcon>
								上报入口 /ingest
							</span>
							<ElTag size="small" type="warning" effect="light">Phase 3 未实现</ElTag>
						</div>
					</div>
				</MonitorSection>

				<MonitorSection title="接入顺序">
					<ol class="m-0 flex flex-col gap-2 pl-4 text-[13px] leading-6 text-[#6b7280]">
						<li>在项目管理中创建项目并确认 DSN。</li>
						<li>配置采样率、留存与隐私脱敏策略。</li>
						<li>使用 workspace 中的框架适配包完成前端接入与单测验证。</li>
						<li>等待 /ingest、OTLP 与 Replay 上传入口交付后联调真实数据。</li>
					</ol>
				</MonitorSection>
			</aside>
		</section>
	</div>
</template>
