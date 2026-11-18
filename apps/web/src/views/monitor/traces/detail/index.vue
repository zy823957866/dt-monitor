<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElButton, ElIcon, ElMessage, ElResult, ElTag } from 'element-plus'
import { ArrowLeft, CopyDocument, VideoPlay } from '@element-plus/icons-vue'
import MonitorPageHeader from '@/components/monitor/MonitorPageHeader.vue'
import MonitorSection from '@/components/monitor/MonitorSection.vue'
import { getTraceDetail, type SpanVO, type TraceDetailVO } from '@/api/monitor'
import { formatDateTime, formatDuration, formatNumber } from '@/utils/monitor'

interface WaterfallSpan extends SpanVO {
	depth: number
	offsetPercent: number
	widthPercent: number
	color: string
}

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const loadError = ref('')
const trace = ref<TraceDetailVO>()

const serviceColors = ['#1677ff', '#16a34a', '#f59e0b', '#7c3aed', '#06b6d4', '#ef4444', '#64748b']

/** 按服务分配稳定颜色。 */
const serviceColorMap = computed(() => {
	const map = new Map<string, string>()
	for (const span of trace.value?.spans ?? []) {
		if (!map.has(span.service)) map.set(span.service, serviceColors[map.size % serviceColors.length]!)
	}
	return map
})

/** 瀑布图 Span 列表。 */
const waterfall = computed<WaterfallSpan[]>(() => {
	const detail = trace.value
	if (!detail) return []
	const rootStart = new Date(detail.startTime).getTime()
	const total = detail.durationMs || 1
	const spanMap = new Map(detail.spans.map((span) => [span.spanId, span]))
	const depthOf = (span: SpanVO): number => {
		let depth = 0
		let parentId = span.parentSpanId
		while (parentId && spanMap.has(parentId) && depth < 20) {
			depth += 1
			parentId = spanMap.get(parentId)?.parentSpanId
		}
		return depth
	}
	return [...detail.spans]
		.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
		.map((span) => {
			const offsetMs = Math.max(0, new Date(span.startTime).getTime() - rootStart)
			return {
				...span,
				depth: depthOf(span),
				offsetPercent: Math.min(100, (offsetMs / total) * 100),
				widthPercent: Math.max(0.5, Math.min(100, (span.durationMs / total) * 100)),
				color: serviceColorMap.value.get(span.service) ?? '#1677ff',
			}
		})
})

/** 时间轴刻度。 */
const axisTicks = computed(() => {
	const total = trace.value?.durationMs ?? 0
	return [0, 25, 50, 75, 100].map((percent) => ({
		percent,
		label: formatDuration((total * percent) / 100),
	}))
})

/**
 * 加载 Trace 详情。
 * @returns Promise<void>
 */
async function load(): Promise<void> {
	const traceId = String(route.params.traceId ?? '')
	if (!traceId) {
		loadError.value = '无效的 Trace ID'
		loading.value = false
		return
	}
	loadError.value = ''
	loading.value = true
	try {
		trace.value = await getTraceDetail(traceId)
	} catch (error) {
		trace.value = undefined
		loadError.value = error instanceof Error ? error.message : '加载 Trace 失败'
	} finally {
		loading.value = false
	}
}

/** 返回列表。 */
function back(): void {
	void router.push('/monitor/traces')
}

/**
 * 复制 Trace ID。
 * @returns Promise<void>
 */
async function copyTraceId(): Promise<void> {
	if (!trace.value) return
	await navigator.clipboard.writeText(trace.value.traceId)
	ElMessage.success('Trace ID 已复制')
}

/**
 * 打开关联错误。
 * @param id Issue ID
 */
function openIssue(id: number): void {
	void router.push('/monitor/errors/' + id)
}

/**
 * 打开关联 Replay。
 * @param replayId Replay ID
 */
function openReplay(replayId: string): void {
	void router.push({ path: '/monitor/replays', query: { replayId } })
}

onMounted(load)
watch(
	() => route.params.traceId,
	() => {
		void load()
	},
)
</script>

<template>
	<div class="box-border flex min-h-[var(--dt-content-height,100vh)] w-full flex-col gap-4 overflow-auto p-5">
		<MonitorPageHeader title="Trace 详情" description="查看请求链路瀑布、Span 属性与关联错误。">
			<ElButton :icon="ArrowLeft" @click="back">返回列表</ElButton>
		</MonitorPageHeader>

		<ElResult
			v-if="loadError"
			status="error"
			title="Trace 不存在或已被清理"
			:sub-title="loadError"
			class="page-card"
		>
			<template #extra>
				<ElButton type="primary" @click="back">返回 Trace 列表</ElButton>
			</template>
		</ElResult>

		<section v-else v-loading="loading" class="page-card">
			<div class="flex flex-wrap items-center justify-between gap-4">
				<div class="min-w-0 flex-1">
					<div class="flex flex-wrap items-center gap-3">
						<code class="break-all text-[15px] font-medium text-[#1677ff]">{{ trace?.traceId || '加载中…' }}</code>
						<ElTag v-if="trace" size="small" :type="trace.status === 'error' ? 'danger' : 'success'" effect="light">
							{{ trace.status === 'error' ? '错误' : '成功' }}
						</ElTag>
						<ElTag v-if="trace?.hasError" size="small" type="danger" effect="plain">含错误 Span</ElTag>
					</div>
					<div v-if="trace" class="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-[#6b7280]">
						<span>总耗时 <b class="text-[#1f2937]">{{ formatDuration(trace.durationMs) }}</b></span>
						<span>开始时间 {{ formatDateTime(trace.startTime) }}</span>
						<span>服务数 <b class="text-[#1f2937]">{{ trace.serviceCount }}</b></span>
						<span>Spans <b class="text-[#1f2937]">{{ trace.spanCount }}</b></span>
						<span>环境 {{ trace.environment || '-' }}</span>
						<span>Release {{ trace.release || '-' }}</span>
					</div>
				</div>
				<div class="flex shrink-0 gap-2">
					<ElButton :icon="CopyDocument" @click="copyTraceId">复制 TraceId</ElButton>
					<ElButton v-if="trace?.replay" type="primary" :icon="VideoPlay" @click="openReplay(trace.replay.replayId)">
						查看 Replay
					</ElButton>
				</div>
			</div>
		</section>

		<section v-if="!loadError" class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
			<div class="flex min-w-0 flex-col gap-4">
				<MonitorSection title="Trace 瀑布" :description="trace ? trace.spanCount + ' spans' : ''" content-class="overflow-auto">
					<div class="min-w-[680px]">
						<div class="grid grid-cols-[230px_minmax(0,1fr)_70px] gap-3 pb-2 text-[11px] text-[#9ca3af]">
							<span>Span</span>
							<div class="relative h-5">
								<span
									v-for="tick in axisTicks"
									:key="tick.percent"
									class="absolute top-0 -translate-x-1/2 whitespace-nowrap"
									:style="{ left: tick.percent + '%' }"
								>
									{{ tick.label }}
								</span>
							</div>
							<span class="text-right">耗时</span>
						</div>
						<div class="divide-y divide-[#f1f5f9]">
							<div
								v-for="span in waterfall"
								:key="span.spanId"
								class="grid grid-cols-[230px_minmax(0,1fr)_70px] items-center gap-3 py-2"
							>
								<div class="flex min-w-0 items-center gap-2" :style="{ paddingLeft: span.depth * 12 + 'px' }">
									<span class="h-2.5 w-2.5 shrink-0 rounded-sm" :style="{ backgroundColor: span.color }"></span>
									<span class="min-w-0 truncate text-[13px] text-[#374151]" :title="span.operation">{{ span.operation }}</span>
									<span class="shrink-0 truncate text-[11px] text-[#9ca3af]">{{ span.service }}</span>
								</div>
								<div class="relative h-6 rounded bg-[#f8fafc]">
									<div
										class="absolute h-6 rounded opacity-90"
										:class="span.status === 'error' ? 'bg-[#ef4444]' : ''"
										:style="{
											left: span.offsetPercent + '%',
											width: span.widthPercent + '%',
											backgroundColor: span.status === 'error' ? undefined : span.color,
										}"
										:title="span.service + ' · ' + formatDuration(span.durationMs)"
									></div>
								</div>
								<span class="text-right text-[12px] font-medium" :class="span.durationMs > 1000 || span.status === 'error' ? 'text-[#ef4444]' : 'text-[#374151]'">
									{{ formatDuration(span.durationMs) }}
								</span>
							</div>
						</div>
					</div>
				</MonitorSection>

				<MonitorSection title="Span 明细" content-class="overflow-auto">
					<div class="hidden grid-cols-[130px_minmax(0,1fr)_110px_90px_90px] gap-3 pb-2 text-[12px] text-[#8c8c8c] md:grid">
						<span>Span ID</span>
						<span>名称</span>
						<span>服务</span>
						<span class="text-right">开始</span>
						<span class="text-right">耗时</span>
					</div>
					<div class="divide-y divide-[#f1f5f9]">
						<div
							v-for="span in waterfall"
							:key="'row-' + span.spanId"
							class="grid grid-cols-1 gap-2 py-2 text-[12px] md:grid-cols-[130px_minmax(0,1fr)_110px_90px_90px] md:items-center md:gap-3"
						>
							<code class="text-[#7c3aed]">{{ span.spanId }}</code>
							<span class="truncate text-[#374151]" :title="span.operation">{{ span.operation }}</span>
							<span class="truncate text-[#6b7280]">{{ span.service }}</span>
							<span class="text-[#9ca3af] md:text-right">{{ formatDuration(new Date(span.startTime).getTime() - new Date(trace?.startTime ?? span.startTime).getTime()) }}</span>
							<span class="md:text-right" :class="span.durationMs > 1000 ? 'text-[#ef4444]' : 'text-[#374151]'">{{ formatDuration(span.durationMs) }}</span>
						</div>
					</div>
				</MonitorSection>
			</div>

			<aside class="flex min-w-0 flex-col gap-4">
				<MonitorSection title="Trace 属性">
					<dl class="m-0 grid grid-cols-[88px_minmax(0,1fr)] gap-y-3 text-[13px]">
						<dt class="text-[#8c8c8c]">Trace ID</dt>
						<dd class="m-0 break-all font-mono text-[12px] text-[#374151]">{{ trace?.traceId || '-' }}</dd>
						<dt class="text-[#8c8c8c]">根 Span</dt>
						<dd class="m-0 break-words text-[#374151]">{{ trace?.rootOperation || '-' }}</dd>
						<dt class="text-[#8c8c8c]">服务数</dt>
						<dd class="m-0 text-[#374151]">{{ trace?.serviceCount ?? 0 }} 个服务</dd>
						<dt class="text-[#8c8c8c]">Spans</dt>
						<dd class="m-0 text-[#374151]">{{ trace?.spanCount ?? 0 }} 个</dd>
						<dt class="text-[#8c8c8c]">页面</dt>
						<dd class="m-0 break-all text-[#374151]">{{ trace?.pagePath || '-' }}</dd>
						<dt class="text-[#8c8c8c]">Session</dt>
						<dd class="m-0 break-all font-mono text-[12px] text-[#6b7280]">{{ trace?.sessionId || '-' }}</dd>
					</dl>
				</MonitorSection>

				<MonitorSection title="关联错误">
					<div v-if="trace?.issues.length" class="flex flex-col gap-2">
						<button
							v-for="issue in trace.issues"
							:key="issue.id"
							type="button"
							class="w-full cursor-pointer rounded-md bg-[#fef2f2] p-3 text-left transition hover:bg-[#fee2e2]"
							@click="openIssue(issue.id)"
						>
							<div class="truncate text-[13px] font-medium text-[#991b1b]">{{ issue.message }}</div>
							<div class="mt-1 text-[11px] text-[#b91c1c]">
								{{ issue.culprit || '未知位置' }} · 事件 {{ formatNumber(issue.eventCount) }}
							</div>
						</button>
					</div>
					<div v-else class="text-[13px] text-[#c0c4cc]">该 Trace 暂无关联错误</div>
				</MonitorSection>

				<MonitorSection v-if="trace?.replay" title="关联 Replay">
					<div class="flex items-center gap-3 rounded-md bg-[#f8fafc] p-3 text-[13px]">
						<ElIcon class="text-[#1677ff]"><VideoPlay /></ElIcon>
						<span class="min-w-0 flex-1 truncate font-mono text-[#1677ff]">{{ trace.replay.replayId }}</span>
					</div>
					<div class="mt-2 text-[12px] text-[#9ca3af]">
						{{ trace.replay.pagePath }} · {{ formatDuration(trace.replay.durationMs) }} · 错误 {{ trace.replay.errorCount }} 次
					</div>
					<ElButton class="mt-3 w-full" type="primary" :icon="VideoPlay" @click="openReplay(trace.replay.replayId)">
						查看 Replay
					</ElButton>
				</MonitorSection>
			</aside>
		</section>
	</div>
</template>
