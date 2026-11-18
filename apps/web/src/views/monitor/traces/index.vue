<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElButton, ElInput, ElOption, ElSelect, ElTag } from 'element-plus'
import MonitorFilterBar from '@/components/monitor/MonitorFilterBar.vue'
import MonitorMetricCard from '@/components/monitor/MonitorMetricCard.vue'
import MonitorPageHeader from '@/components/monitor/MonitorPageHeader.vue'
import MonitorPager from '@/components/monitor/MonitorPager.vue'
import {
	getTraceFilters,
	getTraceSummary,
	pageTraces,
	type TraceListItemVO,
	type TraceSummaryVO,
} from '@/api/monitor'
import { useMonitorStore } from '@/stores/monitor'
import { formatDateTime, formatDuration, formatNumber } from '@/utils/monitor'

const router = useRouter()
const store = useMonitorStore()
const loading = ref(false)
const summaryLoading = ref(false)
const listLoading = ref(false)
const rows = ref<TraceListItemVO[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = 20
const summary = ref<TraceSummaryVO>({ total: 0, averageDurationMs: 0, errorCount: 0, slowCount: 0 })
const filters = ref<{ services: string[]; environments: string[]; releases: string[]; pages: string[] }>({
	services: [],
	environments: [],
	releases: [],
	pages: [],
})
const filterModel = reactive({
	status: '',
	service: '',
	environment: '',
	release: '',
	pagePath: '',
	keyword: '',
	minDurationMs: undefined as number | undefined,
})

/**
 * 构建查询参数。
 * @returns 查询参数
 */
async function buildQuery() {
	const extra: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(filterModel)) {
		if (value !== '' && value !== undefined) extra[key] = value
	}
	return store.resolveQuery(extra)
}

/**
 * 加载筛选元数据。
 * @returns Promise<void>
 */
async function loadFilters(): Promise<void> {
	const projectId = await store.ensureProject()
	filters.value = await getTraceFilters(projectId)
}

/**
 * 加载 Trace 汇总与分页列表。
 * @returns Promise<void>
 */
async function load(): Promise<void> {
	loading.value = true
	summaryLoading.value = true
	listLoading.value = true
	try {
		const query = await buildQuery()
		const [summaryResult, pageResult] = await Promise.all([
			getTraceSummary(query),
			pageTraces({ ...query, pageNum: pageNum.value, pageSize }),
		])
		summary.value = summaryResult
		rows.value = pageResult.list
		total.value = pageResult.total
	} finally {
		loading.value = false
		summaryLoading.value = false
		listLoading.value = false
	}
}

/**
 * 应用筛选并回到第一页。
 * @returns Promise<void>
 */
async function applyFilters(): Promise<void> {
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
 * 重置筛选。
 * @returns Promise<void>
 */
async function resetFilters(): Promise<void> {
	Object.assign(filterModel, {
		status: '',
		service: '',
		environment: '',
		release: '',
		pagePath: '',
		keyword: '',
		minDurationMs: undefined,
	})
	await applyFilters()
}

/**
 * 打开 Trace 详情。
 * @param traceId Trace ID
 */
function openTrace(traceId: string): void {
	void router.push('/monitor/traces/' + traceId)
}

onMounted(async () => {
	await loadFilters()
	await load()
})
</script>

<template>
	<div class="box-border flex min-h-[var(--dt-content-height,100vh)] w-full flex-col gap-4 overflow-auto p-5">
		<MonitorPageHeader title="Trace 列表" description="检索请求链路，查看耗时、状态与 Span 明细。">
			<MonitorFilterBar @refresh="load" @project-change="loadFilters" />
		</MonitorPageHeader>

		<section class="page-card flex flex-wrap items-center gap-3">
			<ElSelect v-model="filterModel.status" class="w-[120px]" clearable placeholder="状态: 全部" @change="applyFilters">
				<ElOption label="成功" value="ok" />
				<ElOption label="错误" value="error" />
			</ElSelect>
			<ElSelect v-model="filterModel.service" class="w-[150px]" clearable placeholder="服务: 全部" @change="applyFilters">
				<ElOption v-for="item in filters.services" :key="item" :label="item" :value="item" />
			</ElSelect>
			<ElSelect v-model="filterModel.environment" class="w-[130px]" clearable placeholder="环境: 全部" @change="applyFilters">
				<ElOption v-for="item in filters.environments" :key="item" :label="item" :value="item" />
			</ElSelect>
			<ElSelect v-model="filterModel.release" class="w-[130px]" clearable placeholder="版本: 全部" @change="applyFilters">
				<ElOption v-for="item in filters.releases" :key="item" :label="item" :value="item" />
			</ElSelect>
			<ElSelect v-model="filterModel.pagePath" class="w-[160px]" clearable placeholder="页面: 全部" @change="applyFilters">
				<ElOption v-for="item in filters.pages" :key="item" :label="item" :value="item" />
			</ElSelect>
			<ElSelect v-model="filterModel.minDurationMs" class="w-[140px]" clearable placeholder="耗时: 全部" @change="applyFilters">
				<ElOption label="> 500ms" :value="500" />
				<ElOption label="> 1s" :value="1000" />
				<ElOption label="> 2s" :value="2000" />
			</ElSelect>
			<ElInput
				v-model="filterModel.keyword"
				class="max-w-[280px] flex-1"
				clearable
				placeholder="搜索 Trace ID / 请求路径"
				@keyup.enter="applyFilters"
			/>
			<ElButton type="primary" @click="applyFilters">查询</ElButton>
			<ElButton text @click="resetFilters">重置</ElButton>
		</section>

		<section v-loading="summaryLoading" class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
			<MonitorMetricCard label="Trace 总量" :value="formatNumber(summary.total)" accent="#1677ff" :show-change="false" hint="当前时间范围内根 Span 数量" />
			<MonitorMetricCard label="平均耗时" :value="formatDuration(summary.averageDurationMs)" accent="#16a34a" :show-change="false" hint="根 Span 平均耗时" />
			<MonitorMetricCard label="错误 Trace" :value="formatNumber(summary.errorCount)" accent="#ef4444" :show-change="false" hint="根 Span 状态为 error" />
			<MonitorMetricCard label="慢 Trace (>1s)" :value="formatNumber(summary.slowCount)" accent="#f59e0b" :show-change="false" hint="耗时超过 1000ms" />
		</section>

		<section class="page-card flex min-h-0 flex-1 flex-col overflow-hidden">
			<header class="hidden grid-cols-[220px_minmax(0,1fr)_140px_90px_90px_110px] gap-4 pb-3 text-[13px] text-[#8c8c8c] lg:grid">
				<span>Trace ID</span>
				<span>请求</span>
				<span>服务</span>
				<span>状态</span>
				<span class="text-right">耗时</span>
				<span class="text-right">开始时间</span>
			</header>
			<div v-loading="listLoading" class="min-h-[280px] flex-1 divide-y divide-[#f1f5f9]">
				<button
					v-for="row in rows"
					:key="row.traceId"
					type="button"
					class="grid w-full grid-cols-1 cursor-pointer gap-2 border-0 bg-transparent px-0 py-3 text-left transition hover:bg-[#f8fafc] lg:grid-cols-[220px_minmax(0,1fr)_140px_90px_90px_110px] lg:items-center lg:gap-4"
					@click="openTrace(row.traceId)"
				>
					<code class="truncate text-[13px] text-[#1677ff]" :title="row.traceId">{{ row.traceId.slice(0, 13) }}</code>
					<div class="min-w-0 truncate text-[14px] text-[#1f2937]" :title="row.operation">{{ row.operation }}</div>
					<div class="flex items-center gap-2 text-[13px] text-[#374151]">
						<span class="h-2 w-2 shrink-0 rounded-full bg-[#1677ff]"></span>
						<span class="truncate">{{ row.service }}</span>
					</div>
					<div class="flex flex-wrap items-center gap-2 lg:contents">
						<ElTag size="small" :type="row.status === 'error' ? 'danger' : 'success'" effect="light">
							{{ row.status === 'error' ? '错误' : '成功' }}
						</ElTag>
						<span class="text-right text-[13px] font-medium" :class="row.durationMs > 1000 ? 'text-[#ef4444]' : 'text-[#374151]'">
							{{ formatDuration(row.durationMs) }}
						</span>
						<span class="text-right text-[12px] text-[#9ca3af]">{{ formatDateTime(row.startTime).slice(11, 19) }}</span>
					</div>
				</button>
				<div v-if="!listLoading && !rows.length" class="flex h-[240px] items-center justify-center text-sm text-[#c0c4cc]">
					当前筛选条件下暂无 Trace
				</div>
			</div>
			<MonitorPager v-model:page-num="pageNum" :page-size="pageSize" :total="total" label="条 Trace" @update:page-num="changePage" />
		</section>
	</div>
</template>
