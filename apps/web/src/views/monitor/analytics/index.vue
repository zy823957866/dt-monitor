<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElButton, ElInput, ElOption, ElSelect, ElTag } from 'element-plus'
import type { EChartsOption } from 'echarts'
import MonitorChart from '@/components/monitor/MonitorChart.vue'
import MonitorFilterBar from '@/components/monitor/MonitorFilterBar.vue'
import MonitorMetricCard from '@/components/monitor/MonitorMetricCard.vue'
import MonitorPageHeader from '@/components/monitor/MonitorPageHeader.vue'
import MonitorPager from '@/components/monitor/MonitorPager.vue'
import MonitorSection from '@/components/monitor/MonitorSection.vue'
import {
	getAnalyticsFilters,
	getAnalyticsFunnel,
	getAnalyticsSummary,
	getAnalyticsTrend,
	pageAnalyticsEvents,
	type AnalyticsEventVO,
	type AnalyticsSummaryVO,
	type FunnelStepVO,
	type TrendPoint,
} from '@/api/monitor'
import { useMonitorStore } from '@/stores/monitor'
import { formatNumber, formatPercent, formatTrendLabel } from '@/utils/monitor'

const store = useMonitorStore()
const loading = ref(false)
const summaryLoading = ref(false)
const listLoading = ref(false)
const summary = ref<AnalyticsSummaryVO>({
	eventTotal: 0,
	uniqueUsers: 0,
	uniqueSessions: 0,
	conversionRate: 0,
})
const points = ref<TrendPoint[]>([])
const funnel = ref<FunnelStepVO[]>([])
const rows = ref<AnalyticsEventVO[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = 20
const filters = ref<{ events: string[]; pages: string[]; environments: string[]; releases: string[] }>({
	events: [],
	pages: [],
	environments: [],
	releases: [],
})
const filterModel = reactive({
	environment: '',
	release: '',
	pagePath: '',
})
const listFilter = reactive({ eventType: '', keyword: '' })

/** 事件趋势图配置。 */
const trendOption = computed<EChartsOption>(() => ({
	animationDuration: 500,
	tooltip: { trigger: 'axis' },
	grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
	xAxis: {
		type: 'category',
		data: points.value.map((item) => formatTrendLabel(item.label)),
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
			name: '事件数',
			type: 'bar',
			data: points.value.map((item) => item.value),
			barMaxWidth: 22,
			itemStyle: { color: '#16a34a', borderRadius: [4, 4, 0, 0] },
		},
	],
}))

/** 漏斗最大计数。 */
const funnelMax = computed(() => Math.max(1, ...funnel.value.map((item) => item.count)))

/**
 * 生成基础筛选参数。
 * @returns 查询参数
 */
async function baseQuery() {
	const extra: Record<string, unknown> = {}
	if (filterModel.environment) extra.environment = filterModel.environment
	if (filterModel.release) extra.release = filterModel.release
	if (filterModel.pagePath) extra.pagePath = filterModel.pagePath
	return store.resolveQuery(extra)
}

/**
 * 加载筛选元数据。
 * @returns Promise<void>
 */
async function loadFilters(): Promise<void> {
	const projectId = await store.ensureProject()
	filters.value = await getAnalyticsFilters(projectId)
}

/**
 * 加载概览、趋势、漏斗与事件列表。
 * @returns Promise<void>
 */
async function load(): Promise<void> {
	loading.value = true
	summaryLoading.value = true
	listLoading.value = true
	try {
		const query = await baseQuery()
		const listQuery: Record<string, unknown> = {}
		if (listFilter.eventType) listQuery.eventType = listFilter.eventType
		if (listFilter.keyword) listQuery.keyword = listFilter.keyword
		const [summaryResult, trendResult, funnelResult, pageResult] = await Promise.all([
			getAnalyticsSummary(query),
			getAnalyticsTrend(query),
			getAnalyticsFunnel(query),
			pageAnalyticsEvents({
				...query,
				...listQuery,
				pageNum: pageNum.value,
				pageSize,
			}),
		])
		summary.value = summaryResult
		points.value = trendResult.points
		funnel.value = funnelResult
		rows.value = pageResult.list
		total.value = pageResult.total
	} finally {
		loading.value = false
		summaryLoading.value = false
		listLoading.value = false
	}
}

/**
 * 应用页面级筛选。
 * @returns Promise<void>
 */
async function applyFilters(): Promise<void> {
	pageNum.value = 1
	await load()
}

/**
 * 应用事件列表筛选。
 * @returns Promise<void>
 */
async function applyListFilters(): Promise<void> {
	pageNum.value = 1
	await load()
}

/**
 * 切换页码。
 * @param value 页码
 */
async function changePage(value: number): Promise<void> {
	pageNum.value = value
	await load()
}

/**
 * 重置全部筛选。
 * @returns Promise<void>
 */
async function resetFilters(): Promise<void> {
	Object.assign(filterModel, { environment: '', release: '', pagePath: '' })
	Object.assign(listFilter, { eventType: '', keyword: '' })
	await applyFilters()
}

onMounted(async () => {
	await loadFilters()
	await load()
})
</script>

<template>
	<div class="box-border flex min-h-[var(--dt-content-height,100vh)] w-full flex-col gap-4 overflow-auto p-5">
		<MonitorPageHeader title="埋点分析" description="查看事件规模、用户覆盖、转化漏斗与高频事件。">
			<MonitorFilterBar @refresh="load" @project-change="loadFilters" />
		</MonitorPageHeader>

		<section class="page-card flex flex-wrap items-center gap-3">
			<ElSelect v-model="filterModel.environment" class="w-[130px]" clearable placeholder="环境: 全部" @change="applyFilters">
				<ElOption v-for="item in filters.environments" :key="item" :label="item" :value="item" />
			</ElSelect>
			<ElSelect v-model="filterModel.release" class="w-[130px]" clearable placeholder="版本: 全部" @change="applyFilters">
				<ElOption v-for="item in filters.releases" :key="item" :label="item" :value="item" />
			</ElSelect>
			<ElSelect v-model="filterModel.pagePath" class="w-[180px]" clearable placeholder="页面: 全部" @change="applyFilters">
				<ElOption v-for="item in filters.pages" :key="item" :label="item" :value="item" />
			</ElSelect>
			<ElButton type="primary" @click="applyFilters">查询</ElButton>
			<ElButton text @click="resetFilters">重置</ElButton>
			<span class="ml-auto text-[12px] text-[#9ca3af]">环境、版本来自当前项目埋点数据</span>
		</section>

		<section v-loading="summaryLoading" class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
			<MonitorMetricCard label="事件总量" :value="formatNumber(summary.eventTotal)" accent="#16a34a" :show-change="false" hint="当前时间范围内全部事件" />
			<MonitorMetricCard label="独立用户" :value="formatNumber(summary.uniqueUsers)" accent="#1677ff" :show-change="false" hint="按 distinctId 去重" />
			<MonitorMetricCard label="独立会话" :value="formatNumber(summary.uniqueSessions)" accent="#7c3aed" :show-change="false" hint="按 sessionId 去重" />
			<MonitorMetricCard label="转化率" :value="summary.conversionRate.toFixed(1) + '%'" accent="#f59e0b" :show-change="false" hint="支付成功 / 访问首页" />
		</section>

		<section class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,1fr)]">
			<MonitorSection title="事件量趋势" description="当前时间范围内的埋点事件量">
				<MonitorChart :option="trendOption" :loading="loading" height="230px" />
			</MonitorSection>
			<MonitorSection title="购买转化漏斗" description="固定业务事件链路">
				<div class="flex flex-col gap-3">
					<div v-for="(step, index) in funnel" :key="step.name" class="flex items-center gap-3">
						<span class="w-[76px] shrink-0 text-right text-[13px] text-[#374151]">{{ step.name }}</span>
						<div class="h-7 min-w-0 flex-1 overflow-hidden rounded bg-[#f1f5f9]">
							<div
								class="h-full rounded transition-all"
								:style="{
									width: Math.max(3, (step.count / funnelMax) * 100) + '%',
									backgroundColor: index === funnel.length - 1 ? '#16a34a' : '#1677ff',
								}"
							></div>
						</div>
						<span class="w-[68px] shrink-0 text-right text-[12px] font-medium text-[#374151]">{{ formatNumber(step.count) }}</span>
						<span class="w-[52px] shrink-0 text-right text-[12px] text-[#6b7280]">{{ formatPercent(step.rate, 1) }}</span>
					</div>
					<div v-if="!funnel.length" class="flex h-[160px] items-center justify-center text-sm text-[#c0c4cc]">
						暂无漏斗数据
					</div>
				</div>
			</MonitorSection>
		</section>

		<section class="page-card flex min-h-0 flex-1 flex-col overflow-hidden">
			<header class="mb-3 flex flex-wrap items-center justify-between gap-3">
				<h2 class="m-0 text-[15px] font-semibold text-[#1f2937]">事件明细</h2>
				<div class="flex flex-wrap items-center gap-2">
					<ElSelect v-model="listFilter.eventType" class="w-[130px]" clearable placeholder="类型: 全部" @change="applyListFilters">
						<ElOption label="page_view" value="page_view" />
						<ElOption label="view" value="view" />
						<ElOption label="click" value="click" />
						<ElOption label="custom" value="custom" />
					</ElSelect>
					<ElInput v-model="listFilter.keyword" class="w-[200px]" clearable placeholder="事件名关键词" @keyup.enter="applyListFilters" />
					<ElButton type="primary" @click="applyListFilters">查询</ElButton>
				</div>
			</header>
			<div class="hidden grid-cols-[minmax(0,1.4fr)_90px_110px_100px_minmax(180px,1fr)] gap-4 pb-2 text-[13px] text-[#8c8c8c] lg:grid">
				<span>事件名</span>
				<span>类型</span>
				<span class="text-right">触发次数</span>
				<span class="text-right">独立用户</span>
				<span>频率占比</span>
			</div>
			<div v-loading="listLoading" class="min-h-[260px] flex-1 divide-y divide-[#f1f5f9]">
				<div
					v-for="row in rows"
					:key="row.eventName + row.eventType"
					class="grid grid-cols-1 gap-2 py-3 lg:grid-cols-[minmax(0,1.4fr)_90px_110px_100px_minmax(180px,1fr)] lg:items-center lg:gap-4"
				>
					<div class="min-w-0">
						<div class="truncate text-[14px] font-medium text-[#1f2937]">{{ row.eventName }}</div>
						<div class="mt-0.5 text-[11px] text-[#9ca3af]">埋点事件 · {{ row.eventName }}</div>
					</div>
					<ElTag size="small" effect="light" type="info">{{ row.eventType }}</ElTag>
					<span class="text-[13px] text-[#374151] lg:text-right">{{ formatNumber(row.triggerCount) }}</span>
					<span class="text-[13px] text-[#6b7280] lg:text-right">{{ formatNumber(row.uniqueUsers) }}</span>
					<div class="flex items-center gap-3">
						<div class="h-2 min-w-0 flex-1 overflow-hidden rounded bg-[#f1f5f9]">
							<div class="h-full rounded bg-[#16a34a]" :style="{ width: Math.min(100, row.frequencyRate) + '%' }"></div>
						</div>
						<span class="w-[52px] shrink-0 text-right text-[12px] text-[#6b7280]">{{ formatPercent(row.frequencyRate, 1) }}</span>
					</div>
				</div>
				<div v-if="!listLoading && !rows.length" class="flex h-[220px] items-center justify-center text-sm text-[#c0c4cc]">
					当前筛选条件下暂无事件
				</div>
			</div>
			<MonitorPager v-model:page-num="pageNum" :page-size="pageSize" :total="total" label="个事件" @update:page-num="changePage" />
		</section>
	</div>
</template>
