<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElTag } from 'element-plus'
import type { EChartsOption } from 'echarts'
import MonitorChart from '@/components/monitor/MonitorChart.vue'
import MonitorFilterBar from '@/components/monitor/MonitorFilterBar.vue'
import MonitorPageHeader from '@/components/monitor/MonitorPageHeader.vue'
import MonitorSection from '@/components/monitor/MonitorSection.vue'
import {
	getLongTasks,
	getPerformanceSummary,
	getPerformanceTrend,
	getSlowPages,
	type LongTaskVO,
	type PerformanceMetricVO,
	type SlowPageVO,
	type TrendPoint,
} from '@/api/monitor'
import { useMonitorStore } from '@/stores/monitor'
import {
	formatDuration,
	formatNumber,
	formatTrendLabel,
	formatVital,
	ratingTagType,
	ratingText,
} from '@/utils/monitor'

const store = useMonitorStore()
const loading = ref(false)
const summaryLoading = ref(false)
const slowLoading = ref(false)
const longTaskLoading = ref(false)
const metrics = ref<PerformanceMetricVO[]>([])
const lcpTrend = ref<TrendPoint[]>([])
const inpTrend = ref<TrendPoint[]>([])
const slowPages = ref<SlowPageVO[]>([])
const longTasks = ref<LongTaskVO[]>([])

const metricCards = computed(() =>
	['LCP', 'FCP', 'INP', 'CLS'].map((name) => ({
		name,
		item: metrics.value.find((item) => item.metric === name),
	})),
)
const lcp = computed(() => metrics.value.find((item) => item.metric === 'LCP'))
const inp = computed(() => metrics.value.find((item) => item.metric === 'INP'))
const longTaskTotal = computed(() =>
	longTasks.value.reduce((sum, item) => sum + item.totalDuration, 0),
)
const longTaskMax = computed(() =>
	longTasks.value.reduce((max, item) => Math.max(max, item.maxDuration), 0),
)

/**
 * 构建指标趋势图配置。
 * @param points 趋势点
 * @param color 柱状颜色
 * @returns ECharts 配置
 */
function metricOption(points: TrendPoint[], color: string): EChartsOption {
	return {
		animationDuration: 500,
		tooltip: { trigger: 'axis' },
		grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
		xAxis: {
			type: 'category',
			data: points.map((item) => formatTrendLabel(item.label)),
			axisLabel: { color: '#9ca3af' },
			axisLine: { lineStyle: { color: '#e5e7eb' } },
			axisTick: { show: false },
		},
		yAxis: {
			type: 'value',
			axisLabel: { color: '#9ca3af' },
			splitLine: { lineStyle: { color: '#f1f5f9' } },
		},
		series: [
			{
				name: '平均值',
				type: 'bar',
				data: points.map((item) => item.value),
				barMaxWidth: 20,
				itemStyle: { color, borderRadius: [4, 4, 0, 0] },
			},
		],
	}
}

const lcpOption = computed<EChartsOption>(() => metricOption(lcpTrend.value, '#1677ff'))
const inpOption = computed<EChartsOption>(() => metricOption(inpTrend.value, '#f59e0b'))

/**
 * 加载性能数据。
 * @returns Promise<void>
 */
async function load(): Promise<void> {
	loading.value = true
	summaryLoading.value = true
	slowLoading.value = true
	longTaskLoading.value = true
	try {
		const query = await store.resolveQuery()
		const [summaryResult, lcpResult, inpResult, pagesResult, longTaskResult] = await Promise.all([
			getPerformanceSummary(query),
			getPerformanceTrend({ ...query, metric: 'LCP' }),
			getPerformanceTrend({ ...query, metric: 'INP' }),
			getSlowPages({ ...query, metric: 'LCP', limit: 10 }),
			getLongTasks(query),
		])
		metrics.value = summaryResult
		lcpTrend.value = lcpResult.points
		inpTrend.value = inpResult.points
		slowPages.value = pagesResult
		longTasks.value = longTaskResult
	} finally {
		loading.value = false
		summaryLoading.value = false
		slowLoading.value = false
		longTaskLoading.value = false
	}
}

onMounted(load)
</script>

<template>
	<div class="box-border flex min-h-[var(--dt-content-height,100vh)] w-full flex-col gap-4 overflow-auto p-5">
		<MonitorPageHeader title="性能总览" description="Web Vitals、慢页面与长任务分析，定位影响真实用户的性能问题。">
			<MonitorFilterBar @refresh="load" />
		</MonitorPageHeader>

		<section v-loading="summaryLoading" class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
			<div v-for="card in metricCards" :key="card.name" class="page-card flex min-h-[132px] flex-col">
				<template v-if="card.item">
					<div class="flex items-center justify-between">
						<span class="text-[14px] font-medium text-[#6b7280]">{{ card.name }}</span>
						<ElTag size="small" effect="light" :type="ratingTagType(card.item.rating)">
							{{ ratingText(card.item.rating) }}
						</ElTag>
					</div>
					<div class="mt-3 text-[32px] font-semibold leading-none text-[#111827]">
						{{ formatVital(card.name, card.item.value) }}
					</div>
					<div class="mt-4 text-[12px] text-[#9ca3af]">
						p75 {{ formatVital(card.name, card.item.p75) }} · p95 {{ formatVital(card.name, card.item.p95) }}
					</div>
				</template>
				<template v-else>
					<span class="text-[14px] font-medium text-[#6b7280]">{{ card.name }}</span>
					<div class="flex flex-1 items-center text-sm text-[#c0c4cc]">暂无数据</div>
				</template>
			</div>
		</section>

		<section class="grid grid-cols-1 gap-4 xl:grid-cols-2">
			<MonitorSection title="LCP 趋势" description="最大内容绘制">
				<template #extra>
					<ElTag v-if="lcp" size="small" effect="light">p75 {{ formatVital('LCP', lcp.p75) }}</ElTag>
				</template>
				<MonitorChart :option="lcpOption" :loading="loading" height="230px" />
			</MonitorSection>
			<MonitorSection title="INP 趋势" description="交互到下一次绘制">
				<template #extra>
					<ElTag v-if="inp" size="small" effect="light">p75 {{ formatVital('INP', inp.p75) }}</ElTag>
				</template>
				<MonitorChart :option="inpOption" :loading="loading" height="230px" />
			</MonitorSection>
		</section>

		<section class="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
			<MonitorSection title="慢页面 Top 10" description="按 LCP p75 排序" content-class="min-h-0 overflow-auto">
				<div v-loading="slowLoading" class="min-h-[300px]">
					<div class="hidden grid-cols-[minmax(0,1fr)_70px_70px_70px_70px] gap-3 pb-2 text-[13px] text-[#8c8c8c] md:grid">
						<span>页面路径</span>
						<span class="text-right">访问量</span>
						<span class="text-right">p75</span>
						<span class="text-right">p95</span>
						<span class="text-right">平均</span>
					</div>
					<div class="divide-y divide-[#f1f5f9]">
						<div
							v-for="page in slowPages"
							:key="page.pagePath"
							class="grid grid-cols-1 gap-2 py-2.5 text-[13px] md:grid-cols-[minmax(0,1fr)_70px_70px_70px_70px] md:items-center md:gap-3"
						>
							<span class="truncate text-[#374151]" :title="page.pagePath">{{ page.pagePath }}</span>
							<span class="text-[#6b7280] md:text-right">{{ formatNumber(page.visits) }}</span>
							<span class="text-[#ef4444] md:text-right">{{ formatDuration(page.p75) }}</span>
							<span class="text-[#f97316] md:text-right">{{ formatDuration(page.p95) }}</span>
							<span class="text-[#6b7280] md:text-right">{{ formatDuration(page.average) }}</span>
						</div>
						<div v-if="!slowLoading && !slowPages.length" class="flex h-[220px] items-center justify-center text-sm text-[#c0c4cc]">
							暂无慢页面数据
						</div>
					</div>
				</div>
			</MonitorSection>

			<MonitorSection title="长任务分析" description="按单次最大耗时排序" content-class="min-h-0 overflow-auto">
				<div v-loading="longTaskLoading" class="flex min-h-[300px] flex-col">
					<div class="grid grid-cols-3 gap-3">
						<div class="rounded-md bg-[#f8fafc] p-3">
							<div class="text-[12px] text-[#8c8c8c]">总耗时</div>
							<div class="mt-1 text-[20px] font-semibold text-[#1f2937]">{{ formatDuration(longTaskTotal) }}</div>
						</div>
						<div class="rounded-md bg-[#f8fafc] p-3">
							<div class="text-[12px] text-[#8c8c8c]">最长任务</div>
							<div class="mt-1 text-[20px] font-semibold text-[#1f2937]">{{ formatDuration(longTaskMax) }}</div>
						</div>
						<div class="rounded-md bg-[#f8fafc] p-3">
							<div class="text-[12px] text-[#8c8c8c]">影响页面</div>
							<div class="mt-1 text-[20px] font-semibold text-[#1f2937]">{{ longTasks.length }} 个</div>
						</div>
					</div>
					<div class="mt-4 divide-y divide-[#f1f5f9]">
						<div v-for="task in longTasks" :key="task.pagePath" class="flex items-center gap-3 py-3">
							<div class="min-w-0 flex-1">
								<div class="truncate text-[13px] text-[#374151]" :title="task.pagePath">{{ task.pagePath }}</div>
								<div class="mt-0.5 truncate text-[11px] text-[#9ca3af]">{{ task.message || '长任务' }}</div>
							</div>
							<span class="shrink-0 text-[12px] text-[#6b7280]">{{ task.count }} 次</span>
							<span class="w-[54px] shrink-0 text-right text-[13px] font-medium text-[#f97316]">
								{{ formatDuration(task.maxDuration) }}
							</span>
						</div>
						<div v-if="!longTaskLoading && !longTasks.length" class="flex h-[160px] items-center justify-center text-sm text-[#c0c4cc]">
							暂无长任务数据
						</div>
					</div>
				</div>
			</MonitorSection>
		</section>
	</div>
</template>
