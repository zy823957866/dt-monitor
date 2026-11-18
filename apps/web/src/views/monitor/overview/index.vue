<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElTag } from 'element-plus'
import { ArrowRight, Bell, Lightning, VideoPlay } from '@element-plus/icons-vue'
import type { EChartsOption } from 'echarts'
import MonitorChart from '@/components/monitor/MonitorChart.vue'
import MonitorFilterBar from '@/components/monitor/MonitorFilterBar.vue'
import MonitorMetricCard from '@/components/monitor/MonitorMetricCard.vue'
import MonitorPageHeader from '@/components/monitor/MonitorPageHeader.vue'
import MonitorSection from '@/components/monitor/MonitorSection.vue'
import { getOverviewSummary, type OverviewSummary } from '@/api/monitor'
import { useMonitorStore } from '@/stores/monitor'
import {
	formatDuration,
	formatNumber,
	formatTrendLabel,
	formatVital,
	ratingTagType,
	ratingText,
} from '@/utils/monitor'

const router = useRouter()
const store = useMonitorStore()
const loading = ref(false)
const summary = ref<OverviewSummary>()

/** 概览指标配色。 */
const metricColors: Record<string, string> = {
	events: '#1677ff',
	errors: '#ef4444',
	errorRate: '#f59e0b',
	users: '#16a34a',
}

/** 目标展示的 Web Vitals。 */
const vitalNames = ['LCP', 'FCP', 'CLS', 'INP', 'TTFB']

const metrics = computed(() => summary.value?.metrics ?? [])
const vitals = computed(() => {
	const current = new Map((summary.value?.vitals ?? []).map((item) => [item.metric, item]))
	return vitalNames.map((metric) => ({
		metric,
		item: current.get(metric),
	}))
})
const errorTrendPoints = computed(() => summary.value?.errorTrend ?? [])
const newIssueTrendPoints = computed(() => summary.value?.newIssueTrend ?? [])
const eventTrendPoints = computed(() => summary.value?.eventTrend ?? [])

const chartTextStyle = {
	color: '#6b7280',
	fontFamily: 'Segoe UI, PingFang SC, Microsoft YaHei, sans-serif',
}

const errorTrendOption = computed<EChartsOption>(() => ({
	animationDuration: 500,
	tooltip: { trigger: 'axis' },
	legend: {
		right: 0,
		top: 0,
		icon: 'circle',
		itemWidth: 8,
		textStyle: chartTextStyle,
	},
	grid: { left: 8, right: 8, top: 40, bottom: 8, containLabel: true },
	xAxis: {
		type: 'category',
		data: errorTrendPoints.value.map((item) => formatTrendLabel(item.label)),
		axisLabel: { color: '#9ca3af', interval: 'auto' },
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
			name: '错误数',
			type: 'bar',
			data: errorTrendPoints.value.map((item) => item.value),
			barMaxWidth: 18,
			itemStyle: { color: '#1677ff', borderRadius: [4, 4, 0, 0] },
		},
		{
			name: '新 Issue',
			type: 'bar',
			data: newIssueTrendPoints.value.map((item) => item.value),
			barMaxWidth: 10,
			itemStyle: { color: '#dbeafe', borderRadius: [3, 3, 0, 0] },
		},
	],
}))

const eventTrendOption = computed<EChartsOption>(() => ({
	animationDuration: 500,
	tooltip: { trigger: 'axis' },
	grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
	xAxis: {
		type: 'category',
		data: eventTrendPoints.value.map((item) => formatTrendLabel(item.label)),
		axisLabel: { color: '#9ca3af', interval: 'auto' },
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
			data: eventTrendPoints.value.map((item) => item.value),
			barMaxWidth: 18,
			itemStyle: { color: '#16a34a', borderRadius: [4, 4, 0, 0] },
		},
	],
}))

/**
 * 加载概览数据。
 * @returns Promise<void>
 */
async function loadSummary(): Promise<void> {
	loading.value = true
	try {
		const params = await store.resolveQuery()
		summary.value = await getOverviewSummary(params)
	} finally {
		loading.value = false
	}
}

/**
 * 跳转页面。
 * @param path 目标路径
 */
function go(path: string): void {
	void router.push(path)
}

/**
 * 返回相对时间描述。
 * @param value 时间值
 * @returns 相对时间
 */
function relativeTime(value: string | Date): string {
	const time = new Date(value).getTime()
	const diff = Math.max(0, Date.now() - time)
	if (diff < 60_000) return '刚刚'
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
	if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
	return `${Math.floor(diff / 86_400_000)} 天前`
}

/**
 * 告警状态文案。
 * @param status 状态
 * @returns 中文文案
 */
function alertStatusText(status: string): string {
	if (status === 'triggered') return '触发中'
	if (status === 'resolved') return '已恢复'
	return status
}

/**
 * 告警状态标签类型。
 * @param status 状态
 * @returns 标签类型
 */
function alertTagType(status: string): 'success' | 'warning' | 'danger' | 'info' {
	if (status === 'resolved') return 'success'
	if (status === 'triggered') return 'danger'
	return 'info'
}

onMounted(() => {
	void loadSummary()
})
</script>

<template>
	<div
		class="monitor-page box-border flex min-h-[var(--dt-content-height,100vh)] w-full flex-col gap-4 overflow-auto p-5"
	>
		<MonitorPageHeader
			title="监控概览"
			description="聚合关键指标、错误、性能、Trace、Replay 与告警，快速定位线上问题。"
		>
			<MonitorFilterBar @refresh="loadSummary" />
		</MonitorPageHeader>

		<section class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
			<MonitorMetricCard
				v-for="metric in metrics"
				:key="metric.key"
				:label="metric.label"
				:value="metric.unit === '%' ? metric.value.toFixed(2) : formatNumber(metric.value)"
				:unit="metric.unit"
				:change="metric.change"
				:accent="metricColors[metric.key] ?? '#1677ff'"
			/>
		</section>

		<section class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
			<div
				v-for="vital in vitals"
				:key="vital.metric"
				class="page-card min-h-[116px]"
			>
				<div class="flex items-center justify-between">
					<span class="text-[13px] font-medium text-[#6b7280]">{{ vital.metric }}</span>
					<ElTag
						v-if="vital.item"
						size="small"
						:type="ratingTagType(vital.item.rating)"
						effect="light"
					>
						{{ ratingText(vital.item.rating) }}
					</ElTag>
				</div>
				<template v-if="vital.item">
					<div class="mt-2 text-[28px] font-semibold leading-none text-[#111827]">
						{{ formatVital(vital.metric, vital.item.value) }}
					</div>
					<div class="mt-3 text-[11px] text-[#9ca3af]">
						p75 {{ formatVital(vital.metric, vital.item.p75) }} · p95
						{{ formatVital(vital.metric, vital.item.p95) }}
					</div>
				</template>
				<div v-else class="mt-6 text-sm text-[#c0c4cc]">暂无数据</div>
			</div>
		</section>

		<section class="grid grid-cols-1 gap-4 xl:grid-cols-2">
			<MonitorSection
				title="错误趋势"
				description="按时间范围统计错误事件与新增 Issue"
			>
				<MonitorChart :option="errorTrendOption" :loading="loading" height="245px" />
			</MonitorSection>
			<MonitorSection title="事件趋势" description="页面访问与自定义埋点事件量">
				<MonitorChart :option="eventTrendOption" :loading="loading" height="245px" />
			</MonitorSection>
		</section>

		<section class="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
			<MonitorSection title="慢 Trace Top 5" content-class="overflow-hidden">
				<template #extra>
					<ElButton text type="primary" @click="go('/monitor/traces')">
						查看全部
						<ElIcon class="ml-1"><ArrowRight /></ElIcon>
					</ElButton>
				</template>
				<div v-if="summary?.slowTraces.length" class="divide-y divide-[#f1f5f9]">
					<button
						v-for="trace in summary.slowTraces"
						:key="trace.traceId"
						type="button"
						class="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-0 py-2.5 text-left transition hover:bg-[#f8fafc]"
						@click="go(`/monitor/traces/${trace.traceId}`)"
					>
						<ElIcon class="text-[#f59e0b]"><Lightning /></ElIcon>
						<span class="min-w-0 flex-1 truncate text-[13px] text-[#374151]">
							{{ trace.operation }}
						</span>
						<ElTag size="small" effect="plain" class="shrink-0">
							{{ trace.service }}
						</ElTag>
						<span class="w-[52px] text-right text-[13px] font-medium text-[#ef4444]">
							{{ formatDuration(trace.durationMs) }}
						</span>
					</button>
				</div>
				<div v-else class="flex h-[220px] items-center justify-center text-sm text-[#c0c4cc]">
					暂无慢 Trace
				</div>
			</MonitorSection>

			<MonitorSection title="最近 Replay">
				<template #extra>
					<ElButton text type="primary" @click="go('/monitor/replays')">
						查看全部
						<ElIcon class="ml-1"><ArrowRight /></ElIcon>
					</ElButton>
				</template>
				<div v-if="summary?.recentReplays.length" class="divide-y divide-[#f1f5f9]">
					<button
						v-for="replay in summary.recentReplays"
						:key="replay.replayId"
						type="button"
						class="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-0 py-2.5 text-left transition hover:bg-[#f8fafc]"
						@click="go('/monitor/replays')"
					>
						<ElIcon class="text-[#1677ff]"><VideoPlay /></ElIcon>
						<span class="w-[86px] shrink-0 font-mono text-[12px] text-[#6b7280]">
							{{ replay.replayId.slice(0, 8) }}
						</span>
						<span class="min-w-0 flex-1 truncate text-[13px] text-[#374151]">
							{{ replay.pagePath }}
						</span>
						<span class="shrink-0 text-[12px] text-[#6b7280]">
							{{ formatDuration(replay.durationMs) }}
						</span>
						<span class="w-[64px] shrink-0 text-right text-[12px] text-[#9ca3af]">
							{{ relativeTime(replay.startedAt) }}
						</span>
					</button>
				</div>
				<div v-else class="flex h-[220px] items-center justify-center text-sm text-[#c0c4cc]">
					暂无 Replay 会话
				</div>
			</MonitorSection>

			<MonitorSection title="最近告警">
				<template #extra>
					<ElButton text type="primary" @click="go('/monitor/alerts')">
						查看全部
						<ElIcon class="ml-1"><ArrowRight /></ElIcon>
					</ElButton>
				</template>
				<div v-if="summary?.recentAlerts.length" class="divide-y divide-[#f1f5f9]">
					<div
						v-for="alert in summary.recentAlerts"
						:key="alert.id"
						class="flex items-center gap-2 py-2.5"
					>
						<ElIcon class="text-[#ef4444]"><Bell /></ElIcon>
						<span class="min-w-0 flex-1 truncate text-[13px] text-[#374151]">
							{{ alert.name }}
						</span>
						<span class="shrink-0 text-[12px] text-[#9ca3af]">
							{{ relativeTime(alert.triggeredAt) }}
						</span>
						<ElTag size="small" :type="alertTagType(alert.status)" effect="light">
							{{ alertStatusText(alert.status) }}
						</ElTag>
					</div>
				</div>
				<div v-else class="flex h-[220px] items-center justify-center text-sm text-[#c0c4cc]">
					暂无告警记录
				</div>
			</MonitorSection>
		</section>
	</div>
</template>
