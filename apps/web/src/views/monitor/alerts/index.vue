<script lang="tsx" setup>
import { onMounted, ref } from 'vue'
import { DtForm, DtVxeTable, useCurd, useForm, useSource, useVxeTable } from '@dt-frames/ui'
import { ElButton, ElDialog, ElMessage, ElMessageBox, ElTag } from 'element-plus'
import MonitorFilterBar from '@/components/monitor/MonitorFilterBar.vue'
import MonitorPageHeader from '@/components/monitor/MonitorPageHeader.vue'
import {
	createAlertRule,
	deleteAlertRule,
	getAlertSummary,
	pageAlertHistory,
	pageAlertRules,
	testAlertRule,
	updateAlertRule,
	type AlertHistoryVO,
	type AlertRuleVO,
} from '@/api/monitor'
import { useMonitorStore } from '@/stores/monitor'
import { formatDateTime, formatRelativeTime } from '@/utils/monitor'

const store = useMonitorStore()
const summary = ref<{ activeRuleCount: number; activeRuleNames: string[]; historyCount: number }>({
	activeRuleCount: 0,
	activeRuleNames: [],
	historyCount: 0,
})
const ruleCache = new Map<number, AlertRuleVO>()

/** 指标文案。 */
const metricLabels: Record<string, string> = {
	error_rate: '错误率',
	lcp: 'LCP',
	inp: 'INP',
	long_task: '长任务',
	availability: '可用性',
}

/** 渠道文案。 */
const channelLabels: Record<string, string> = {
	webhook: 'Webhook',
	email: '邮件',
	wecom: '企业微信',
	dingtalk: '钉钉',
	sms: '短信',
}

/**
 * 加载告警汇总。
 * @param projectId 项目 ID
 * @returns Promise<void>
 */
async function loadSummary(projectId: number): Promise<void> {
	summary.value = await getAlertSummary(projectId)
}

const { source } = useSource({
	pageKey: 'pageNum',
	pageName: '告警规则',
	authPrefix: 'monitor:alert',
	api: {
		queryPage: async (params: Record<string, any>) => {
			const projectId = (await store.ensureProject()) as number
			void loadSummary(projectId)
			const result = await pageAlertRules({ ...params, projectId })
			for (const item of result.list) ruleCache.set(item.id, item)
			return result
		},
		queryById: async ({ id }: { id: number }) => ruleCache.get(id),
		add: async (model: Record<string, any>) => {
			const projectId = (await store.ensureProject()) as number
			return createAlertRule({
				projectId,
				name: model.name,
				metric: model.metric,
				comparator: model.comparator,
				threshold: Number(model.threshold),
				windowMinutes: Number(model.windowMinutes),
				cooldownMinutes: Number(model.cooldownMinutes),
				channel: model.channel,
				conditionSummary: model.conditionSummary || undefined,
			})
		},
		update: ({ id, ...rest }: Record<string, any>) =>
			updateAlertRule(id, {
				name: rest.name,
				metric: rest.metric,
				comparator: rest.comparator,
				threshold: Number(rest.threshold),
				windowMinutes: Number(rest.windowMinutes),
				cooldownMinutes: Number(rest.cooldownMinutes),
				channel: rest.channel,
				status: rest.status,
				conditionSummary: rest.conditionSummary,
			}),
		deletes: (ids: number[]) => Promise.all(ids.map((id) => deleteAlertRule(id))),
	},
})

const [registerForm] = useForm({
	...source,
	mode: 'filter',
	compact: true,
	schemas: [
		{
			component: 'Select',
			name: 'status',
			label: '状态',
			props: {
				clearable: true,
				placeholder: '全部状态',
				options: [
					{ label: '启用', value: 'active' },
					{ label: '暂停', value: 'paused' },
				],
			},
		},
		{
			component: 'Select',
			name: 'metric',
			label: '指标',
			props: {
				clearable: true,
				placeholder: '全部指标',
				options: Object.entries(metricLabels).map(([value, label]) => ({ label, value })),
			},
		},
		{
			component: 'Select',
			name: 'channel',
			label: '通知渠道',
			props: {
				clearable: true,
				placeholder: '全部渠道',
				options: Object.entries(channelLabels).map(([value, label]) => ({ label, value })),
			},
		},
		{
			component: 'Input',
			name: 'keyword',
			label: '关键词',
			props: { clearable: true, placeholder: '规则名称' },
		},
	],
})

const [Curd, curdInstance] = useCurd({
	source,
	modalProps: { title: '告警规则', width: '760px' },
	formProps: {
		mode: 'modal',
		labelWidth: 100,
		schemas: [
			{
				component: 'Input',
				name: 'name',
				label: '规则名称',
				required: true,
				props: { placeholder: '例如：错误率超过阈值 0.5%', maxlength: 120 },
			},
			{
				component: 'Select',
				name: 'metric',
				label: '指标',
				required: true,
				defaultValue: 'error_rate',
				props: {
					options: Object.entries(metricLabels).map(([value, label]) => ({ label, value })),
				},
			},
			{
				component: 'RadioGroup',
				name: 'comparator',
				label: '比较符',
				defaultValue: '>',
				props: {
					type: 'radio',
					options: ['>', '>=', '<', '<=', '='].map((value) => ({ label: value, value })),
				},
			},
			{
				component: 'InputNumber',
				name: 'threshold',
				label: '阈值',
				required: true,
				defaultValue: 0.5,
				props: { min: 0, step: 0.01, class: 'w-full' },
			},
			{
				component: 'InputNumber',
				name: 'windowMinutes',
				label: '窗口(分钟)',
				defaultValue: 10,
				props: { min: 1, class: 'w-full' },
			},
			{
				component: 'InputNumber',
				name: 'cooldownMinutes',
				label: '冷却(分钟)',
				defaultValue: 30,
				props: { min: 1, class: 'w-full' },
			},
			{
				component: 'Select',
				name: 'channel',
				label: '通知渠道',
				defaultValue: 'webhook',
				props: {
					options: Object.entries(channelLabels).map(([value, label]) => ({ label, value })),
				},
			},
			{
				component: 'RadioGroup',
				name: 'status',
				label: '状态',
				defaultValue: 'active',
				props: {
					type: 'radio',
					options: [
						{ label: '启用', value: 'active' },
						{ label: '暂停', value: 'paused' },
					],
				},
			},
			{
				component: 'Input',
				name: 'conditionSummary',
				label: '条件描述',
				colProps: { span: 24 },
				props: { maxlength: 255, placeholder: '留空则自动生成' },
			},
		],
	},
})

const [register] = useVxeTable({
	...(source as any),
	toolbar: [
		{ label: '新建规则', type: 'primary', onClick: () => curdInstance.openAddDialog() },
	],
	columns: [
		{ type: 'checkbox', width: 48, align: 'center' },
		{
			title: '规则名',
			field: 'name',
			minWidth: 240,
			render: (row: AlertRuleVO) => (
				<div class="min-w-0">
					<div class="truncate text-[14px] font-medium text-[#1f2937]">{row.name}</div>
					<div class="mt-0.5 truncate text-[11px] text-[#9ca3af]">{row.conditionSummary}</div>
				</div>
			),
		},
		{
			title: '指标',
			field: 'metric',
			width: 100,
			align: 'center',
			render: (row: AlertRuleVO) => metricLabels[row.metric] ?? row.metric,
		},
		{
			title: '阈值条件',
			field: 'condition',
			minWidth: 190,
			render: (row: AlertRuleVO) =>
				metricLabels[row.metric] + ' ' + row.comparator + ' ' + row.threshold + ' · ' + row.windowMinutes + ' 分钟',
		},
		{
			title: '通知渠道',
			field: 'channel',
			width: 120,
			align: 'center',
			render: (row: AlertRuleVO) => channelLabels[row.channel] ?? row.channel,
		},
		{
			title: '状态',
			field: 'triggerStatus',
			width: 100,
			align: 'center',
			render: (row: AlertRuleVO) => (
				<ElTag
					size="small"
					effect="light"
					type={row.triggerStatus === 'active' ? 'danger' : row.triggerStatus === 'paused' ? 'info' : 'success'}
				>
					{row.triggerStatus === 'active' ? '触发中' : row.triggerStatus === 'paused' ? '已停用' : '已恢复'}
				</ElTag>
			),
		},
		{
			title: '最近触发',
			field: 'lastTriggeredAt',
			width: 120,
			align: 'center',
			render: (row: AlertRuleVO) => (row.lastTriggeredAt ? formatRelativeTime(row.lastTriggeredAt) : '-'),
		},
		{
			title: '操作',
			field: 'action',
			flag: 'ACTION',
			width: 260,
			align: 'center',
			fixed: 'right',
			render: (row: AlertRuleVO) => (
				<div class="flex items-center justify-center gap-1">
					<ElButton link onClick={() => curdInstance.openEditDialog(row)}>编辑</ElButton>
					<ElButton
						link
						type={row.status === 'active' ? 'warning' : 'success'}
						onClick={() => toggleStatus(row)}
					>
						{row.status === 'active' ? '暂停' : '启用'}
					</ElButton>
					<ElButton link type="primary" onClick={() => sendTest(row)}>测试</ElButton>
					<ElButton link type="primary" onClick={() => openHistory(row)}>历史</ElButton>
					<ElButton link type="danger" onClick={() => curdInstance.del(row)}>删除</ElButton>
				</div>
			),
		},
	],
})

const historyDialog = ref(false)
const historyLoading = ref(false)
const historyRule = ref<AlertRuleVO>()
const historyRows = ref<AlertHistoryVO[]>([])

/**
 * 切换规则启用状态。
 * @param row 告警规则
 * @returns Promise<void>
 */
async function toggleStatus(row: AlertRuleVO): Promise<void> {
	await updateAlertRule(row.id, { status: row.status === 'active' ? 'paused' : 'active' })
	ElMessage.success(row.status === 'active' ? '规则已暂停' : '规则已启用')
	await source.onSearch?.({})
}

/**
 * 发送测试告警。
 * @param row 告警规则
 * @returns Promise<void>
 */
async function sendTest(row: AlertRuleVO): Promise<void> {
	const result = await testAlertRule(row.id)
	if (result.delivered) ElMessage.success(result.message)
	else ElMessage.warning(result.message)
}

/**
 * 打开告警历史。
 * @param row 告警规则
 * @returns Promise<void>
 */
async function openHistory(row: AlertRuleVO): Promise<void> {
	historyRule.value = row
	historyDialog.value = true
	historyLoading.value = true
	try {
		const projectId = (await store.ensureProject()) as number
		const result = await pageAlertHistory({ projectId, ruleId: row.id, pageNum: 1, pageSize: 50 })
		historyRows.value = result.list
	} finally {
		historyLoading.value = false
	}
}

/** 打开全部告警历史。 */
async function openAllHistory(): Promise<void> {
	historyRule.value = undefined
	historyDialog.value = true
	historyLoading.value = true
	try {
		const projectId = (await store.ensureProject()) as number
		const result = await pageAlertHistory({ projectId, pageNum: 1, pageSize: 50 })
		historyRows.value = result.list
	} finally {
		historyLoading.value = false
	}
}

/** 刷新规则列表。 */
function refreshList(): void {
	void source.onSearch?.({})
}

/**
 * 关闭历史弹窗。
 * @returns Promise<void>
 */
async function closeHistory(): Promise<void> {
	historyDialog.value = false
	historyRows.value = []
	historyRule.value = undefined
}

onMounted(async () => {
	const projectId = await store.ensureProject()
	if (projectId) await loadSummary(projectId)
})
</script>

<template>
	<div class="box-border flex min-h-[var(--dt-content-height,100vh)] w-full flex-col gap-4 overflow-auto p-5">
		<MonitorPageHeader title="告警中心" description="基于错误率、Web Vitals、长任务与可用性配置告警规则。">
			<MonitorFilterBar @refresh="refreshList" />
			<ElButton type="primary" @click="curdInstance.openAddDialog()">新建规则</ElButton>
		</MonitorPageHeader>

		<div v-if="summary.activeRuleCount" class="flex flex-wrap items-center gap-2 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] text-[#b91c1c]">
			<span class="font-medium">{{ summary.activeRuleCount }} 条告警规则正在触发：</span>
			<span class="min-w-0 flex-1 truncate">{{ summary.activeRuleNames.join(' · ') }}</span>
			<ElButton link type="danger" @click="openAllHistory">查看详情</ElButton>
		</div>

		<DtForm @register="registerForm" />
		<DtVxeTable @register="register"></DtVxeTable>
		<Curd />

		<ElDialog v-model="historyDialog" :title="historyRule ? '告警历史 · ' + historyRule.name : '全部告警历史'" width="860px" @closed="closeHistory">
			<div v-loading="historyLoading" class="max-h-[520px] min-h-[160px] overflow-auto divide-y divide-[#f1f5f9]">
				<div v-for="item in historyRows" :key="item.id" class="py-3">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<span class="text-[13px] font-medium text-[#374151]">{{ item.message }}</span>
						<ElTag size="small" :type="item.status === 'resolved' ? 'success' : 'danger'" effect="light">
							{{ item.status === 'resolved' ? '已恢复' : '触发中' }}
						</ElTag>
					</div>
					<div class="mt-1 text-[12px] text-[#9ca3af]">
						{{ item.ruleName }} · {{ formatDateTime(item.triggeredAt) }}
						<span v-if="item.resolvedAt"> · 恢复于 {{ formatDateTime(item.resolvedAt) }}</span>
					</div>
				</div>
				<div v-if="!historyLoading && !historyRows.length" class="flex h-[160px] items-center justify-center text-sm text-[#c0c4cc]">
					暂无告警历史
				</div>
			</div>
		</ElDialog>
	</div>
</template>
