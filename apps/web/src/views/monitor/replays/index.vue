<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElButton, ElDrawer, ElIcon, ElInput, ElOption, ElSelect, ElTag, ElTimeline, ElTimelineItem } from 'element-plus'
import { VideoPlay } from '@element-plus/icons-vue'
import MonitorFilterBar from '@/components/monitor/MonitorFilterBar.vue'
import MonitorMetricCard from '@/components/monitor/MonitorMetricCard.vue'
import MonitorPageHeader from '@/components/monitor/MonitorPageHeader.vue'
import MonitorPager from '@/components/monitor/MonitorPager.vue'
import {
	getReplayDetail,
	getReplayFilters,
	getReplaySummary,
	pageReplays,
	type ReplayListItemVO,
	type ReplaySummaryVO,
	type ReplayTimelineItemVO,
} from '@/api/monitor'
import { useMonitorStore } from '@/stores/monitor'
import { formatDuration, formatNumber, formatRelativeTime } from '@/utils/monitor'

const route = useRoute()
const router = useRouter()
const store = useMonitorStore()
const loading = ref(false)
const summaryLoading = ref(false)
const listLoading = ref(false)
const detailLoading = ref(false)
const rows = ref<ReplayListItemVO[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = 20
const summary = ref<ReplaySummaryVO>({
	total: 0,
	averageDurationMs: 0,
	coverageRate: 0,
	errorReplayCount: 0,
})
const filters = ref<{ environments: string[]; pages: string[] }>({ environments: [], pages: [] })
const drawerOpen = ref(false)
const detail = ref<{ replay: ReplayListItemVO; timeline: ReplayTimelineItemVO[] }>()
const filterModel = reactive({
	environment: '',
	pagePath: '',
	durationRange: '',
	errorOnly: '',
	keyword: '',
})

/** 时长筛选区间。 */
const durationOptions = [
	{ label: '30 秒内', value: 'lt30s', min: 0, max: 30_000 },
	{ label: '30 秒 - 2 分钟', value: '30s-2m', min: 30_000, max: 120_000 },
	{ label: '2 - 5 分钟', value: '2m-5m', min: 120_000, max: 300_000 },
	{ label: '5 分钟以上', value: 'gt5m', min: 300_000, max: undefined },
]

/** 详情时间线按时间升序。 */
const sortedTimeline = computed(() =>
	[...(detail.value?.timeline ?? [])].sort(
		(a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
	),
)

/**
 * 构建查询参数。
 * @returns 查询参数
 */
async function buildQuery() {
	const extra: Record<string, unknown> = {}
	if (filterModel.environment) extra.environment = filterModel.environment
	if (filterModel.pagePath) extra.pagePath = filterModel.pagePath
	if (filterModel.errorOnly) extra.errorOnly = filterModel.errorOnly
	if (filterModel.keyword) extra.keyword = filterModel.keyword
	const duration = durationOptions.find((item) => item.value === filterModel.durationRange)
	if (duration) {
		extra.minDurationMs = duration.min
		if (duration.max !== undefined) extra.maxDurationMs = duration.max
	}
	return store.resolveQuery(extra)
}

/**
 * 加载筛选元数据。
 * @returns Promise<void>
 */
async function loadFilters(): Promise<void> {
	const projectId = await store.ensureProject()
	filters.value = await getReplayFilters(projectId)
}

/**
 * 加载 Replay 汇总与列表。
 * @returns Promise<void>
 */
async function load(): Promise<void> {
	loading.value = true
	summaryLoading.value = true
	listLoading.value = true
	try {
		const query = await buildQuery()
		const summaryQuery = await store.resolveQuery()
		const [summaryResult, pageResult] = await Promise.all([
			getReplaySummary(summaryQuery),
			pageReplays({ ...query, pageNum: pageNum.value, pageSize }),
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
 * 应用筛选。
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
		environment: '',
		pagePath: '',
		durationRange: '',
		errorOnly: '',
        keyword: '',
	})
	await applyFilters()
}

/**
 * 打开 Replay 详情抽屉。
 * @param replayId Replay ID
 * @returns Promise<void>
 */
async function openDetail(replayId: string): Promise<void> {
	detailLoading.value = true
	try {
		detail.value = await getReplayDetail(replayId)
		drawerOpen.value = true
	} finally {
		detailLoading.value = false
	}
}

/** 跳转 SDK 接入页。 */
function goSdk(): void {
	void router.push('/monitor/sdk')
}

onMounted(async () => {
	await loadFilters()
	await load()
	const queryReplayId = typeof route.query.replayId === 'string' ? route.query.replayId : ''
	if (queryReplayId) await openDetail(queryReplayId)
})
</script>

<template>
	<div class="box-border flex min-h-[var(--dt-content-height,100vh)] w-full flex-col gap-4 overflow-auto p-5">
		<MonitorPageHeader title="Replay 列表" description="检索用户会话，定位错误发生前后的真实操作路径。">
			<MonitorFilterBar @refresh="load" @project-change="loadFilters" />
		</MonitorPageHeader>

		<section class="page-card flex flex-wrap items-center gap-3">
			<ElSelect v-model="filterModel.environment" class="w-[130px]" clearable placeholder="环境: 全部" @change="applyFilters">
				<ElOption v-for="item in filters.environments" :key="item" :label="item" :value="item" />
			</ElSelect>
			<ElSelect v-model="filterModel.pagePath" class="w-[170px]" clearable placeholder="页面: 全部" @change="applyFilters">
				<ElOption v-for="item in filters.pages" :key="item" :label="item" :value="item" />
			</ElSelect>
			<ElSelect v-model="filterModel.durationRange" class="w-[150px]" clearable placeholder="时长: 全部" @change="applyFilters">
				<ElOption v-for="item in durationOptions" :key="item.value" :label="item.label" :value="item.value" />
			</ElSelect>
			<ElSelect v-model="filterModel.errorOnly" class="w-[140px]" clearable placeholder="含错误: 全部" @change="applyFilters">
				<ElOption label="含错误" value="true" />
				<ElOption label="无错误" value="false" />
			</ElSelect>
			<ElInput
				v-model="filterModel.keyword"
				class="max-w-[280px] flex-1"
				clearable
				placeholder="搜索会话 ID / 用户 / 页面"
				@keyup.enter="applyFilters"
			/>
			<ElButton type="primary" @click="applyFilters">查询</ElButton>
			<ElButton text @click="resetFilters">重置</ElButton>
			<ElButton type="primary" plain :icon="VideoPlay" @click="goSdk">接入录制</ElButton>
		</section>

		<section v-loading="summaryLoading" class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
			<MonitorMetricCard label="录制会话" :value="formatNumber(summary.total)" accent="#1677ff" :show-change="false" hint="当前时间范围内已索引会话" />
			<MonitorMetricCard label="平均时长" :value="formatDuration(summary.averageDurationMs)" accent="#16a34a" :show-change="false" hint="已录制会话平均时长" />
			<MonitorMetricCard label="覆盖率" :value="summary.coverageRate.toFixed(1) + '%'" accent="#f59e0b" :show-change="false" hint="录制会话 / 总会话" />
			<MonitorMetricCard label="含错误会话" :value="formatNumber(summary.errorReplayCount)" accent="#ef4444" :show-change="false" hint="errorCount > 0 的会话" />
		</section>

		<section class="page-card flex min-h-0 flex-1 flex-col overflow-hidden">
			<header class="hidden grid-cols-[180px_120px_minmax(0,1fr)_90px_90px_80px_110px_60px] gap-4 pb-3 text-[13px] text-[#8c8c8c] lg:grid">
				<span>会话</span>
				<span>用户</span>
				<span>页面</span>
				<span class="text-right">时长</span>
				<span class="text-right">事件数</span>
				<span class="text-right">错误数</span>
				<span class="text-right">时间</span>
				<span class="text-right">操作</span>
			</header>
			<div v-loading="listLoading" class="min-h-[280px] flex-1 divide-y divide-[#f1f5f9]">
				<button
					v-for="row in rows"
					:key="row.replayId"
					type="button"
					class="grid w-full grid-cols-1 cursor-pointer gap-2 border-0 bg-transparent px-0 py-3 text-left transition hover:bg-[#f8fafc] lg:grid-cols-[180px_120px_minmax(0,1fr)_90px_90px_80px_110px_60px] lg:items-center lg:gap-4"
					@click="openDetail(row.replayId)"
				>
					<code class="truncate text-[13px] text-[#7c3aed]" :title="row.replayId">{{ row.replayId.slice(0, 13) }}</code>
					<span class="truncate text-[13px] text-[#6b7280]">{{ row.distinctId || '-' }}</span>
					<span class="min-w-0 truncate text-[14px] text-[#1f2937]" :title="row.pagePath">{{ row.pagePath }}</span>
					<div class="flex flex-wrap items-center gap-2 lg:contents">
						<span class="text-right text-[13px] text-[#374151]">{{ formatDuration(row.durationMs) }}</span>
						<span class="text-right text-[13px] text-[#6b7280]">{{ formatNumber(row.eventCount) }}</span>
						<span class="text-right text-[13px]" :class="row.errorCount ? 'font-medium text-[#ef4444]' : 'text-[#6b7280]'">{{ row.errorCount }}</span>
						<span class="text-right text-[12px] text-[#9ca3af]">{{ formatRelativeTime(row.startedAt) }}</span>
						<span class="flex justify-end">
							<ElTag size="small" type="primary" effect="plain" @click.stop="openDetail(row.replayId)">
								<ElIcon><VideoPlay /></ElIcon>
							</ElTag>
						</span>
					</div>
				</button>
				<div v-if="!listLoading && !rows.length" class="flex h-[240px] items-center justify-center text-sm text-[#c0c4cc]">
					当前筛选条件下暂无 Replay 会话
				</div>
			</div>
			<MonitorPager v-model:page-num="pageNum" :page-size="pageSize" :total="total" label="个会话" @update:page-num="changePage" />
		</section>

		<ElDrawer v-model="drawerOpen" title="Replay 会话详情" size="520px">
			<div v-loading="detailLoading" class="flex h-full flex-col gap-4">
				<template v-if="detail">
					<div class="rounded-md bg-[#f8fafc] p-4 text-[13px] text-[#374151]">
						<div class="font-mono text-[#7c3aed]">{{ detail.replay.replayId }}</div>
						<div class="mt-2 text-[#6b7280]">
							{{ detail.replay.pagePath }} · {{ formatDuration(detail.replay.durationMs) }} · 事件 {{ formatNumber(detail.replay.eventCount) }} · 错误 {{ detail.replay.errorCount }}
						</div>
						<div class="mt-1 text-[12px] text-[#9ca3af]">开始于 {{ new Date(detail.replay.startedAt).toLocaleString('zh-CN') }}</div>
					</div>
					<div class="rounded-md border border-dashed border-[#d9e1ec] bg-white p-4 text-[12px] leading-5 text-[#8c8c8c]">
						Replay 播放器依赖 rrweb 分片、对象存储与签名播放地址，当前数据面尚未接入。本抽屉展示的是真实的错误与埋点时间线。
					</div>
					<div class="min-h-0 flex-1 overflow-auto">
						<ElTimeline>
							<ElTimelineItem
								v-for="item in sortedTimeline"
								:key="item.type + item.occurredAt + item.name"
								:type="item.type === 'error' ? 'danger' : 'primary'"
								:timestamp="new Date(item.occurredAt).toLocaleTimeString('zh-CN')"
							>
								<div class="text-[13px]" :class="item.type === 'error' ? 'text-[#ef4444]' : 'text-[#374151]'">{{ item.name }}</div>
								<div class="text-[11px] text-[#9ca3af]">{{ item.type === 'error' ? '错误' : '埋点' }} · {{ item.pagePath }}</div>
							</ElTimelineItem>
						</ElTimeline>
						<div v-if="!sortedTimeline.length" class="flex h-[120px] items-center justify-center text-sm text-[#c0c4cc]">
							该会话暂无时间线事件
						</div>
					</div>
				</template>
			</div>
		</ElDrawer>
	</div>
</template>
