<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElButton, ElIcon, ElMessage, ElMessageBox, ElResult, ElTag } from 'element-plus'
import { ArrowLeft, CopyDocument, VideoPlay } from '@element-plus/icons-vue'
import type { EChartsOption } from 'echarts'
import MonitorChart from '@/components/monitor/MonitorChart.vue'
import MonitorPageHeader from '@/components/monitor/MonitorPageHeader.vue'
import MonitorSection from '@/components/monitor/MonitorSection.vue'
import {
	getErrorTrend,
	getIssue,
	updateIssue,
	type IssueVO,
	type TrendPoint,
} from '@/api/monitor'
import { useMonitorStore } from '@/stores/monitor'
import {
	formatDateTime,
	formatDuration,
	formatNumber,
	formatRelativeTime,
	formatTrendLabel,
	issueStatusTagType,
	issueStatusText,
	levelTagType,
} from '@/utils/monitor'

interface RelatedTrace {
	traceId: string
	operation: string
	service: string
	status: string
	durationMs: number
	spanCount: number
	startTime: string
}

interface RelatedReplay {
	replayId: string
	sessionId: string
	pagePath: string
	durationMs: number
	errorCount: number
	startedAt: string
}

const route = useRoute()
const router = useRouter()
const store = useMonitorStore()
const loading = ref(false)
const trendLoading = ref(false)
const loadError = ref('')
const issue = ref<IssueVO>()
const stack = ref('')
const context = ref<Record<string, unknown>>()
const traces = ref<RelatedTrace[]>([])
const replay = ref<RelatedReplay>()
const trend = ref<TrendPoint[]>([])

const issueId = computed(() => Number(route.params.id))

/** Issue 事件趋势配置。 */
const trendOption = computed<EChartsOption>(() => ({
	animationDuration: 500,
	tooltip: { trigger: 'axis' },
	grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
	xAxis: {
		type: 'category',
		data: trend.value.map((item) => formatTrendLabel(item.label)),
		axisLabel: { color: '#9ca3af' },
		axisLine: { lineStyle: { color: '#e5e7eb' } },
		axisTick: { show: false },
	},
	yAxis: {
		type: 'value',
		minInterval: 1,
		axisLabel: { color: '#9ca3af' },
		splitLine: { lineStyle: { color: '#f1f5f9' } },
	},
	series: [
		{
			name: '事件数',
			type: 'bar',
			data: trend.value.map((item) => item.value),
			barMaxWidth: 20,
			itemStyle: { color: '#1677ff', borderRadius: [4, 4, 0, 0] },
		},
	],
}))

/**
 * 加载错误详情与趋势。
 * @returns Promise<void>
 */
async function load(): Promise<void> {
	if (!Number.isFinite(issueId.value)) {
		loadError.value = '无效的 Issue ID'
		loading.value = false
		trendLoading.value = false
		return
	}
	loadError.value = ''
	loading.value = true
	trendLoading.value = true
	try {
		const [detail, trendResult] = await Promise.all([
			getIssue(issueId.value),
			getErrorTrend(await store.resolveQuery({ issueId: issueId.value })),
		])
		issue.value = detail.issue
		stack.value = detail.sample?.stack ?? ''
		context.value = detail.sample?.context
		traces.value = detail.traces
		replay.value = detail.replay
		trend.value = trendResult.errors
	} catch (error) {
		issue.value = undefined
		loadError.value = error instanceof Error ? error.message : '加载 Issue 失败'
	} finally {
		loading.value = false
		trendLoading.value = false
	}
}

/**
 * 更新 Issue 状态。
 * @param status 新状态
 * @returns Promise<void>
 */
async function changeStatus(status: string): Promise<void> {
	if (!issue.value) return
	await updateIssue(issue.value.id, { status })
	ElMessage.success('Issue 状态已更新')
	await load()
}

/**
 * 指派 Issue。
 * @returns Promise<void>
 */
async function assign(): Promise<void> {
	if (!issue.value) return
	const result = await ElMessageBox.prompt('请输入负责人用户 ID', '指派 Issue', {
		confirmButtonText: '指派',
		cancelButtonText: '取消',
		inputPattern: /^[1-9]\d*$/,
		inputErrorMessage: '请输入有效的用户 ID',
	})
	await updateIssue(issue.value.id, { assigneeId: Number(result.value) })
	ElMessage.success('指派已保存')
	await load()
}

/**
 * 复制 Trace ID。
 * @param traceId Trace ID
 */
async function copyTrace(traceId: string): Promise<void> {
	await navigator.clipboard.writeText(traceId)
	ElMessage.success('Trace ID 已复制')
}

/** 返回错误列表。 */
function back(): void {
	void router.push('/monitor/errors')
}

/** 打开关联 Trace。 @param traceId Trace ID */
function openTrace(traceId: string): void {
	void router.push('/monitor/traces/' + traceId)
}

/** 打开关联 Replay。 @param replayId Replay ID */
function openReplay(replayId: string): void {
	void router.push({ path: '/monitor/replays', query: { replayId } })
}

onMounted(load)
watch(issueId, () => {
	void load()
})
</script>

<template>
	<div class="box-border flex min-h-[var(--dt-content-height,100vh)] w-full flex-col gap-4 overflow-auto p-5">
		<MonitorPageHeader title="错误详情" description="定位根因，查看调用栈、关联 Trace 与 Replay。">
			<ElButton :icon="ArrowLeft" @click="back">返回列表</ElButton>
		</MonitorPageHeader>

		<ElResult
			v-if="loadError"
			status="error"
			title="Issue 不存在或已被删除"
			:sub-title="loadError"
			class="page-card"
		>
			<template #extra>
				<ElButton type="primary" @click="back">返回错误列表</ElButton>
			</template>
		</ElResult>

		<section v-else v-loading="loading" class="page-card">
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div class="min-w-0 flex-1">
					<div class="flex flex-wrap items-center gap-2">
						<h2 class="m-0 text-[20px] font-semibold leading-7 text-[#1f2937]">
							{{ issue?.message || '加载中…' }}
						</h2>
						<ElTag v-if="issue" size="small" :type="levelTagType(issue.level)" effect="light">
							{{ issue.level === 'warning' ? '警告' : issue.level === 'info' ? '信息' : '错误' }}
						</ElTag>
						<ElTag v-if="issue" size="small" :type="issueStatusTagType(issue.status)" effect="light">
							{{ issueStatusText(issue.status) }}
						</ElTag>
					</div>
					<div v-if="issue" class="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-[#6b7280]">
						<span>事件数 <b class="font-semibold text-[#1f2937]">{{ formatNumber(issue.eventCount) }}</b></span>
						<span>影响用户 <b class="font-semibold text-[#1f2937]">{{ formatNumber(issue.userCount) }}</b></span>
						<span>首次发生 {{ formatDateTime(issue.firstSeen) }}</span>
						<span>最后发生 {{ formatRelativeTime(issue.lastSeen) }}</span>
						<span>Release {{ issue.release || '-' }}</span>
						<span>环境 {{ issue.environment || '-' }}</span>
					</div>
				</div>
				<div class="flex shrink-0 flex-wrap items-center gap-2">
					<ElButton type="primary" @click="changeStatus('resolved')">标记已解决</ElButton>
					<ElButton @click="changeStatus('ignored')">忽略</ElButton>
					<ElButton @click="assign">指派</ElButton>
				</div>
			</div>
		</section>

		<section v-if="!loadError" class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
			<div class="flex min-w-0 flex-col gap-4">
				<MonitorSection title="事件趋势 · 当前时间范围" description="该 Issue 的事件量变化">
					<MonitorChart :option="trendOption" :loading="trendLoading" height="230px" />
				</MonitorSection>

				<MonitorSection title="调用栈 · 最近样本">
					<template #extra>
						<ElButton text type="primary" :icon="CopyDocument" @click="copyTrace(issue?.traceId || '')" :disabled="!issue?.traceId">
							复制 TraceId
						</ElButton>
					</template>
					<pre v-if="stack" class="m-0 max-h-[330px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#f8fafc] p-4 font-mono text-[12px] leading-6 text-[#374151]">{{ stack }}</pre>
					<div v-else class="flex h-[180px] items-center justify-center text-sm text-[#c0c4cc]">
						该 Issue 暂无堆栈样本
					</div>
				</MonitorSection>

				<MonitorSection title="相关 Trace" content-class="overflow-hidden">
					<div v-if="traces.length" class="divide-y divide-[#f1f5f9]">
						<button
							v-for="trace in traces"
							:key="trace.traceId"
							type="button"
							class="flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-0 py-3 text-left transition hover:bg-[#f8fafc]"
							@click="openTrace(trace.traceId)"
						>
							<code class="min-w-0 flex-1 truncate text-[13px] text-[#1677ff]">{{ trace.traceId }}</code>
							<ElTag size="small" :type="trace.status === 'error' ? 'danger' : 'success'" effect="light">
								{{ trace.status === 'error' ? '错误' : '成功' }}
							</ElTag>
							<span class="w-[74px] text-right text-[12px] text-[#6b7280]">{{ trace.spanCount }} spans</span>
							<span class="w-[62px] text-right text-[12px] font-medium" :class="trace.durationMs > 1000 ? 'text-[#ef4444]' : 'text-[#374151]'">
								{{ formatDuration(trace.durationMs) }}
							</span>
						</button>
					</div>
					<div v-else class="flex h-[120px] items-center justify-center text-sm text-[#c0c4cc]">
						暂无关联 Trace
					</div>
				</MonitorSection>
			</div>

			<aside class="flex min-w-0 flex-col gap-4">
				<MonitorSection title="事件属性">
					<dl class="m-0 grid grid-cols-[88px_minmax(0,1fr)] gap-y-3 text-[13px]">
						<dt class="text-[#8c8c8c]">错误消息</dt>
						<dd class="m-0 break-words text-[#374151]">{{ issue?.message || '-' }}</dd>
						<dt class="text-[#8c8c8c]">错误类型</dt>
						<dd class="m-0 text-[#374151]">{{ issue?.type || '-' }}</dd>
						<dt class="text-[#8c8c8c]">调用位置</dt>
						<dd class="m-0 break-all text-[#374151]">{{ issue?.culprit || '-' }}</dd>
						<dt class="text-[#8c8c8c]">页面</dt>
						<dd class="m-0 break-all text-[#374151]">{{ issue?.pagePath || '-' }}</dd>
						<dt class="text-[#8c8c8c]">环境</dt>
						<dd class="m-0 text-[#374151]">{{ issue?.environment || '-' }}</dd>
						<dt class="text-[#8c8c8c]">版本</dt>
						<dd class="m-0 text-[#374151]">{{ issue?.release || '-' }}</dd>
						<dt class="text-[#8c8c8c]">指纹</dt>
						<dd class="m-0 break-all font-mono text-[12px] text-[#6b7280]">{{ issue?.fingerprint || '-' }}</dd>
					</dl>
				</MonitorSection>

				<MonitorSection v-if="context && Object.keys(context).length" title="样本标签">
					<div class="flex flex-wrap gap-2">
						<ElTag v-for="(value, key) in context" :key="key" size="small" effect="plain" class="max-w-full">
							{{ key }}: {{ value }}
						</ElTag>
					</div>
				</MonitorSection>

				<MonitorSection v-if="replay" title="关联 Replay">
					<div class="flex items-center gap-3 rounded-md bg-[#f8fafc] p-3 text-[13px]">
						<ElIcon class="text-[#1677ff]"><VideoPlay /></ElIcon>
						<span class="min-w-0 flex-1 truncate font-mono text-[#1677ff]">{{ replay.replayId }}</span>
						<span class="shrink-0 text-[12px] text-[#6b7280]">{{ replay.pagePath }}</span>
					</div>
					<div class="mt-2 text-[12px] text-[#9ca3af]">
						时长 {{ formatDuration(replay.durationMs) }} · 错误 {{ replay.errorCount }} 次 · {{ formatRelativeTime(replay.startedAt) }}
					</div>
					<ElButton class="mt-3 w-full" type="primary" :icon="VideoPlay" @click="openReplay(replay.replayId)">
						查看 Replay
					</ElButton>
				</MonitorSection>

				<MonitorSection title="快速操作">
					<div class="flex flex-wrap gap-2">
						<ElButton v-if="issue?.traceId" text type="primary" @click="openTrace(issue.traceId)">查看 Trace 瀑布</ElButton>
						<ElButton v-if="issue?.traceId" text type="primary" :icon="CopyDocument" @click="copyTrace(issue.traceId)">复制 TraceId</ElButton>
					</div>
					<div v-if="!issue?.traceId" class="text-[13px] text-[#c0c4cc]">该 Issue 暂未关联 Trace</div>
				</MonitorSection>
			</aside>
		</section>
	</div>
</template>
