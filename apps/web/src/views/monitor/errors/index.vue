<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElButton, ElInput, ElOption, ElSelect, ElTag } from 'element-plus'
import { ArrowRight } from '@element-plus/icons-vue'
import type { EChartsOption } from 'echarts'
import MonitorChart from '@/components/monitor/MonitorChart.vue'
import MonitorFilterBar from '@/components/monitor/MonitorFilterBar.vue'
import MonitorPageHeader from '@/components/monitor/MonitorPageHeader.vue'
import MonitorPager from '@/components/monitor/MonitorPager.vue'
import MonitorSection from '@/components/monitor/MonitorSection.vue'
import {
	getErrorFilters,
	getErrorTrend,
	pageIssues,
	type IssueVO,
	type TrendPoint,
} from '@/api/monitor'
import { useMonitorStore } from '@/stores/monitor'
import {
	formatNumber,
	formatRelativeTime,
	formatTrendLabel,
	issueStatusTagType,
	issueStatusText,
	levelTagType,
} from '@/utils/monitor'

const router = useRouter()
const store = useMonitorStore()
const loading = ref(false)
const trendLoading = ref(false)
const issuesLoading = ref(false)
const issues = ref<IssueVO[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = 20
const trend = ref<{ errors: TrendPoint[]; newIssues: TrendPoint[] }>({
	errors: [],
	newIssues: [],
})
const filters = ref<{ environments: string[]; releases: string[]; pages: string[] }>({
	environments: [],
	releases: [],
	pages: [],
})
const filterModel = reactive({
	status: '',
	level: '',
	environment: '',
	release: '',
	pagePath: '',
	keyword: '',
})

/** 错误趋势图表配置。 */
const trendOption = computed<EChartsOption>(() => ({
	animationDuration: 500,
	tooltip: { trigger: 'axis' },
	legend: {
		right: 0,
		top: 0,
		icon: 'circle',
		itemWidth: 8,
		textStyle: { color: '#6b7280' },
	},
	grid: { left: 8, right: 8, top: 40, bottom: 8, containLabel: true },
	xAxis: {
		type: 'category',
		data: trend.value.errors.map((item) => formatTrendLabel(item.label)),
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
			name: '错误数',
			type: 'bar',
			data: trend.value.errors.map((item) => item.value),
			barMaxWidth: 18,
			itemStyle: { color: '#1677ff', borderRadius: [4, 4, 0, 0] },
		},
		{
			name: '新 Issue',
			type: 'bar',
			data: trend.value.newIssues.map((item) => item.value),
			barMaxWidth: 10,
			itemStyle: { color: '#c7dcff', borderRadius: [3, 3, 0, 0] },
		},
	],
}))

/**
 * 生成带筛选条件的查询参数。
 * @returns 查询参数
 */
async function buildQuery() {
	const extra: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(filterModel)) {
		if (value) extra[key] = value
	}
	return store.resolveQuery(extra)
}

/**
 * 加载筛选元数据。
 * @returns Promise<void>
 */
async function loadFilters(): Promise<void> {
	const projectId = await store.ensureProject()
	filters.value = await getErrorFilters(projectId)
}

/**
 * 加载趋势与 Issue 列表。
 * @returns Promise<void>
 */
async function load(): Promise<void> {
	loading.value = true
	trendLoading.value = true
	issuesLoading.value = true
	try {
		const query = await buildQuery()
		const [trendResult, pageResult] = await Promise.all([
			getErrorTrend(query),
			pageIssues({ ...query, pageNum: pageNum.value, pageSize }),
		])
		trend.value = { errors: trendResult.errors, newIssues: trendResult.newIssues }
		issues.value = pageResult.list
		total.value = pageResult.total
	} finally {
		loading.value = false
		trendLoading.value = false
		issuesLoading.value = false
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
		level: '',
		environment: '',
		release: '',
		pagePath: '',
		keyword: '',
	})
	await applyFilters()
}

/**
 * 打开 Issue 详情。
 * @param issue Issue 数据
 */
function openIssue(issue: IssueVO): void {
	void router.push('/monitor/errors/' + issue.id)
}

onMounted(async () => {
	await loadFilters()
	await load()
})
</script>

<template>
	<div class="box-border flex min-h-[var(--dt-content-height,100vh)] w-full flex-col gap-4 overflow-auto p-5">
		<MonitorPageHeader title="错误列表" description="按级别、状态与版本聚合线上错误，快速进入 Issue 详情。">
			<MonitorFilterBar @refresh="load" @project-change="loadFilters" />
		</MonitorPageHeader>

		<section class="page-card flex flex-wrap items-center gap-3">
			<ElSelect v-model="filterModel.status" class="w-[130px]" clearable placeholder="状态: 全部" @change="applyFilters">
				<ElOption label="待处理" value="open" />
				<ElOption label="进行中" value="in_progress" />
				<ElOption label="已解决" value="resolved" />
				<ElOption label="已忽略" value="ignored" />
			</ElSelect>
			<ElSelect v-model="filterModel.level" class="w-[120px]" clearable placeholder="级别: 全部" @change="applyFilters">
				<ElOption label="错误" value="error" />
				<ElOption label="警告" value="warning" />
				<ElOption label="信息" value="info" />
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
			<ElInput
				v-model="filterModel.keyword"
				class="max-w-[300px] flex-1"
				clearable
				placeholder="搜索错误消息 / 指纹 / 路径"
				@keyup.enter="applyFilters"
			/>
			<ElButton type="primary" @click="applyFilters">查询</ElButton>
			<ElButton text @click="resetFilters">重置</ElButton>
		</section>

		<MonitorSection title="错误趋势 · 当前时间范围" description="蓝色为错误事件，浅色为新增 Issue">
			<MonitorChart :option="trendOption" :loading="trendLoading" height="240px" />
		</MonitorSection>

		<section class="page-card flex min-h-0 flex-1 flex-col overflow-hidden">
			<header class="hidden grid-cols-[minmax(0,1fr)_90px_110px_90px_90px_100px_110px] gap-4 pb-3 text-[13px] text-[#8c8c8c] lg:grid">
				<span>Issue</span>
				<span>级别</span>
				<span>状态</span>
				<span class="text-right">事件数</span>
				<span class="text-right">影响用户</span>
				<span>版本</span>
				<span class="text-right">最后发生</span>
			</header>
			<div v-loading="issuesLoading" class="min-h-[200px] flex-1 divide-y divide-[#f1f5f9]">
				<button
					v-for="issue in issues"
					:key="issue.id"
					type="button"
					class="grid w-full grid-cols-1 cursor-pointer gap-2 border-0 bg-transparent px-0 py-3 text-left transition hover:bg-[#f8fafc] lg:grid-cols-[minmax(0,1fr)_90px_110px_90px_90px_100px_110px] lg:items-center lg:gap-4"
					@click="openIssue(issue)"
				>
					<div class="min-w-0">
						<div class="truncate text-[15px] font-medium text-[#1f2937]" :title="issue.message">
							{{ issue.message }}
						</div>
						<div class="mt-1 truncate text-[12px] text-[#9ca3af]">
							{{ issue.culprit || issue.pagePath || issue.environment || '未知位置' }}
							<span v-if="issue.pagePath && issue.culprit"> · {{ issue.pagePath }}</span>
						</div>
					</div>
					<div class="flex flex-wrap items-center gap-2 lg:contents">
						<ElTag size="small" effect="light" :type="levelTagType(issue.level)">
							{{ issue.level === 'warning' ? '警告' : issue.level === 'info' ? '信息' : '错误' }}
						</ElTag>
						<ElTag size="small" effect="light" :type="issueStatusTagType(issue.status)">
							{{ issueStatusText(issue.status) }}
						</ElTag>
						<span class="text-[13px] text-[#374151] lg:text-right">{{ formatNumber(issue.eventCount) }}</span>
						<span class="text-[13px] text-[#6b7280] lg:text-right">{{ formatNumber(issue.userCount) }}</span>
						<span class="truncate text-[12px] text-[#6b7280]">{{ issue.release || '-' }}</span>
						<span class="flex items-center justify-end gap-1 text-[12px] text-[#9ca3af]">
							{{ formatRelativeTime(issue.lastSeen) }}
							<ElIcon class="lg:hidden"><ArrowRight /></ElIcon>
						</span>
					</div>
				</button>
				<div v-if="!issuesLoading && !issues.length" class="flex h-[240px] items-center justify-center text-sm text-[#c0c4cc]">
					当前筛选条件下暂无 Issue
				</div>
			</div>
			<MonitorPager v-model:page-num="pageNum" :page-size="pageSize" :total="total" label="个 Issue" @update:page-num="changePage" />
		</section>
	</div>
</template>
