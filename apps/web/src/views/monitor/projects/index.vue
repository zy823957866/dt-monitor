<script lang="tsx" setup>
import { reactive, ref } from 'vue'
import {
	DtForm,
	DtVxeTable,
	useCurd,
	useForm,
	useSource,
	useVxeTable,
} from '@dt-frames/ui'
import {
	ElButton,
	ElDialog,
	ElInput,
	ElInputNumber,
	ElMessage,
	ElMessageBox,
	ElSlider,
	ElSwitch,
	ElTag,
} from 'element-plus'
import {
	createProject,
	deleteProject,
	getProject,
	getProjectDsn,
	listProjectKeys,
	pageProjects,
	revokeProjectKey,
	rotateProjectKey,
	updateProject,
	updateProjectSettings,
	type ProjectDsnVO,
	type ProjectKeyVO,
	type ProjectVO,
} from '@/api/monitor'
import { formatDateTime, formatNumber } from '@/utils/monitor'

/**
 * 后端项目字段转为页面字段。
 * @param item 项目
 * @returns 页面项目
 */
const toView = (item: ProjectVO) => ({
	...item,
	status: String(item.status),
})

const { source } = useSource({
	pageKey: 'pageNum',
	pageName: '项目管理',
	authPrefix: 'monitor:project',
	api: {
		queryPage: async (params: Record<string, any>) =>
			pageProjects({
				pageNum: params.pageNum,
				pageSize: params.pageSize,
				keyword: params.keyword || undefined,
				status: params.status === '' || params.status == null ? undefined : Number(params.status),
			}),
		queryById: async ({ id }: { id: number }) => toView(await getProject(id)),
		deletes: (ids: number[]) => Promise.all(ids.map((id) => deleteProject(id))),
		add: (model: Record<string, any>) =>
			createProject({
				name: model.name,
				appId: model.appId,
				platform: model.platform,
				description: model.description,
			}),
		update: ({ id, ...rest }: Record<string, any>) =>
			updateProject(id, {
				name: rest.name,
				appId: rest.appId,
				status: Number(rest.status),
				description: rest.description,
			}),
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
					{ label: '启用', value: '1' },
					{ label: '暂停', value: '0' },
					{ label: '归档', value: '2' },
				],
			},
		},
		{
			component: 'Input',
			name: 'keyword',
			label: '关键词',
			props: { clearable: true, placeholder: '项目名称 / appId' },
		},
	],
})

const [Curd, curdInstance] = useCurd({
	source,
	modalProps: { title: '项目管理', width: '720px' },
	formProps: {
		mode: 'modal',
		labelWidth: 100,
		schemas: [
			{
				component: 'Input',
				name: 'name',
				label: '项目名称',
				required: true,
				props: { placeholder: '请输入项目名称', maxlength: 80 },
			},
			{
				component: 'Input',
				name: 'appId',
				label: '项目编码',
				required: true,
				props: { placeholder: '3-80 位小写字母、数字或连字符', maxlength: 80 },
			},
			{
				component: 'RadioGroup',
				name: 'platform',
				label: '平台',
				defaultValue: 'web',
				props: {
					type: 'radio',
					options: [
						{ label: 'Web', value: 'web' },
						{ label: 'Vue', value: 'vue' },
						{ label: 'React', value: 'react' },
						{ label: 'UniApp', value: 'uniapp' },
					],
				},
			},
			{
				component: 'RadioGroup',
				name: 'status',
				label: '状态',
				defaultValue: '1',
				props: {
					type: 'radio',
					options: [
						{ label: '启用', value: '1' },
						{ label: '暂停', value: '0' },
						{ label: '归档', value: '2' },
					],
				},
			},
			{
				component: 'Input',
				name: 'description',
				label: '描述',
				colProps: { span: 24 },
				props: {
					type: 'textarea',
					rows: 3,
					maxlength: 500,
					showWordLimit: true,
					placeholder: '项目用途、接入方与负责人',
				},
			},
		],
	},
})

const [register] = useVxeTable({
	...(source as any),
	toolbar: [
		{ label: '新建项目', type: 'primary', onClick: () => curdInstance.openAddDialog() },
	],
	columns: [
		{ type: 'checkbox', width: 48, align: 'center' },
		{
			title: '项目',
			field: 'name',
			minWidth: 230,
			render: (row: ProjectVO) => (
				<div class="min-w-0">
					<div class="truncate text-[14px] font-medium text-[#1f2937]">{row.name}</div>
					<div class="mt-0.5 truncate font-mono text-[11px] text-[#9ca3af]">appId: {row.appId}</div>
				</div>
			),
		},
		{
			title: '类型',
			field: 'platform',
			width: 100,
			align: 'center',
			render: (row: ProjectVO) => (
				<ElTag size="small" effect="light" type="primary">
					{row.platform}
				</ElTag>
			),
		},
		{ title: '环境数', field: 'environmentCount', width: 80, align: 'center' },
		{ title: 'SDK 版本', field: 'sdkVersion', width: 100, align: 'center' },
		{
			title: '事件总量',
			field: 'eventCount',
			width: 110,
			align: 'right',
			render: (row: ProjectVO) => formatNumber(row.eventCount),
		},
		{
			title: '错误数',
			field: 'errorCount',
			width: 90,
			align: 'right',
			render: (row: ProjectVO) => formatNumber(row.errorCount),
		},
		{
			title: '状态',
			field: 'status',
			width: 90,
			align: 'center',
			render: (row: any) => (
				<ElTag
					size="small"
					effect="light"
					type={row.status === '1' ? 'success' : row.status === '2' ? 'info' : 'warning'}
				>
					{row.status === '1' ? '启用' : row.status === '2' ? '归档' : '暂停'}
				</ElTag>
			),
		},
		{
			title: '创建时间',
			field: 'createTime',
			width: 160,
			align: 'center',
			render: (row: ProjectVO) => formatDateTime(row.createTime),
		},
		{
			title: '操作',
			field: 'action',
			flag: 'ACTION',
			width: 210,
			align: 'center',
			fixed: 'right',
			render: (row: ProjectVO) => (
				<div class="flex items-center justify-center gap-1">
					<ElButton link type="primary" onClick={() => openDsn(row)}>
						接入
					</ElButton>
					<ElButton link onClick={() => curdInstance.openEditDialog(toView(row))}>
						编辑
					</ElButton>
					<ElButton link onClick={() => openSettings(row)}>
						配置
					</ElButton>
					<ElButton link type="danger" onClick={() => curdInstance.del(row)}>
						删除
					</ElButton>
				</div>
			),
		},
	],
})

const dsnDialog = ref(false)
const dsnLoading = ref(false)
const dsn = ref<ProjectDsnVO>()
const keys = ref<ProjectKeyVO[]>([])
const activeProject = ref<ProjectVO>()

const settingsDialog = ref(false)
const settingsSaving = ref(false)
const settingsProject = ref<ProjectVO>()
const settings = reactive({
	errorSampleRate: 1,
	performanceSampleRate: 0.1,
	analyticsSampleRate: 1,
	traceSampleRate: 0.1,
	replaySessionSampleRate: 0.01,
	replayErrorSampleRate: 1,
	retentionDays: 90,
	replayRetentionDays: 30,
	maskSensitiveData: true,
	captureConsole: false,
})

/**
 * 打开项目接入信息。
 * @param row 项目
 * @returns Promise<void>
 */
async function openDsn(row: ProjectVO): Promise<void> {
	activeProject.value = row
	dsnDialog.value = true
	dsnLoading.value = true
	try {
		const [dsnResult, keyResult] = await Promise.all([
			getProjectDsn(row.id),
			listProjectKeys(row.id),
		])
		dsn.value = dsnResult
		keys.value = keyResult
	} finally {
		dsnLoading.value = false
	}
}

/**
 * 复制 DSN。
 * @returns Promise<void>
 */
async function copyDsn(): Promise<void> {
	if (!dsn.value) return
	await navigator.clipboard.writeText(dsn.value.dsn)
	ElMessage.success('DSN 已复制')
}

/**
 * 轮换 key。
 * @param keyType key 类型
 * @returns Promise<void>
 */
async function rotateKey(keyType: 'browser' | 'server'): Promise<void> {
	if (!activeProject.value) return
	await ElMessageBox.confirm('轮换后旧 key 将立即失效，确认继续？', '轮换 Key', {
		type: 'warning',
	})
	await rotateProjectKey(activeProject.value.id, keyType)
	if (activeProject.value) await openDsn(activeProject.value)
	ElMessage.success('Key 已轮换')
}

/**
 * 吊销 key。
 * @param key 项目 key
 * @returns Promise<void>
 */
async function revokeKey(key: ProjectKeyVO): Promise<void> {
	if (!activeProject.value) return
	await ElMessageBox.confirm('吊销后该 key 无法再用于上报，确认继续？', '吊销 Key', {
		type: 'warning',
	})
	await revokeProjectKey(activeProject.value.id, key.id)
	await openDsn(activeProject.value)
	ElMessage.success('Key 已吊销')
}

/**
 * 打开项目设置。
 * @param row 项目
 * @returns Promise<void>
 */
async function openSettings(row: ProjectVO): Promise<void> {
	const detail = await getProject(row.id)
	settingsProject.value = detail
	const current = detail.settings ?? {}
	for (const key of Object.keys(settings) as Array<keyof typeof settings>) {
		const value = current[key]
		if (typeof value === 'number' || typeof value === 'boolean') {
			;(settings as Record<string, unknown>)[key] = value
		}
	}
	settingsDialog.value = true
}

/**
 * 保存项目设置。
 * @returns Promise<void>
 */
async function saveSettings(): Promise<void> {
	if (!settingsProject.value) return
	settingsSaving.value = true
	try {
		const updated = await updateProjectSettings(settingsProject.value.id, { ...settings })
		settingsProject.value = updated
		settingsDialog.value = false
		ElMessage.success('项目设置已保存')
	} finally {
		settingsSaving.value = false
	}
}
</script>

<template>
	<div class="dt-page">
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<div>
				<h1 class="m-0 text-[20px] font-semibold text-[#1f2937]">项目管理</h1>
				<p class="m-0 mt-1 text-[13px] text-[#8c8c8c]">管理监控项目、上报 Key、采样与留存配置。</p>
			</div>
		</div>
		<DtForm @register="registerForm" />
		<DtVxeTable @register="register"></DtVxeTable>
		<Curd />

		<ElDialog v-model="dsnDialog" title="项目接入信息" width="760px">
			<div v-loading="dsnLoading" class="flex flex-col gap-4">
				<div>
					<div class="mb-2 text-[13px] text-[#6b7280]">DSN</div>
					<div class="flex gap-2">
						<ElInput :model-value="dsn?.dsn || ''" readonly />
						<ElButton type="primary" @click="copyDsn">复制 DSN</ElButton>
					</div>
				</div>
				<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
					<div class="rounded-md bg-[#f8fafc] p-3">
						<div class="mb-2 flex items-center justify-between text-[13px]">
							<span class="font-medium text-[#374151]">Browser Key</span>
							<ElButton link type="primary" @click="rotateKey('browser')">轮换</ElButton>
						</div>
						<code class="break-all text-[12px] text-[#6b7280]">{{ dsn?.browserKey || '-' }}</code>
					</div>
					<div class="rounded-md bg-[#f8fafc] p-3">
						<div class="mb-2 flex items-center justify-between text-[13px]">
							<span class="font-medium text-[#374151]">Server Key</span>
							<ElButton link type="primary" @click="rotateKey('server')">轮换</ElButton>
						</div>
						<code class="break-all text-[12px] text-[#6b7280]">{{ dsn?.serverKey || '-' }}</code>
					</div>
				</div>
				<div class="text-[12px] text-[#9ca3af]">上报地址：{{ dsn?.origin || '-' }}/ingest/v1/项目ID</div>
				<div>
					<div class="mb-2 text-[13px] text-[#6b7280]">Key 历史</div>
					<div class="max-h-[220px] overflow-auto divide-y divide-[#f1f5f9]">
						<div v-for="key in keys" :key="key.id" class="flex items-center gap-2 py-2 text-[12px]">
							<ElTag size="small" :type="key.status === 1 ? 'success' : 'info'" effect="light">
								{{ key.status === 1 ? '有效' : '已吊销' }}
							</ElTag>
							<span class="w-[62px] shrink-0 text-[#6b7280]">{{ key.keyType }}</span>
							<code class="min-w-0 flex-1 truncate text-[#9ca3af]">{{ key.keyValue }}</code>
							<ElButton v-if="key.status === 1" link type="danger" @click="revokeKey(key)">吊销</ElButton>
						</div>
					</div>
				</div>
			</div>
		</ElDialog>

		<ElDialog v-model="settingsDialog" title="项目设置" width="720px">
			<div v-loading="settingsSaving" class="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
				<label class="flex flex-col gap-1 text-[13px] text-[#6b7280]">
					错误采样率
					<ElSlider v-model="settings.errorSampleRate" :min="0" :max="1" :step="0.01" show-input />
				</label>
				<label class="flex flex-col gap-1 text-[13px] text-[#6b7280]">
					性能采样率
					<ElSlider v-model="settings.performanceSampleRate" :min="0" :max="1" :step="0.01" show-input />
				</label>
				<label class="flex flex-col gap-1 text-[13px] text-[#6b7280]">
					埋点采样率
					<ElSlider v-model="settings.analyticsSampleRate" :min="0" :max="1" :step="0.01" show-input />
				</label>
				<label class="flex flex-col gap-1 text-[13px] text-[#6b7280]">
					Trace 采样率
					<ElSlider v-model="settings.traceSampleRate" :min="0" :max="1" :step="0.01" show-input />
				</label>
				<label class="flex flex-col gap-1 text-[13px] text-[#6b7280]">
					Replay 会话采样率
					<ElSlider v-model="settings.replaySessionSampleRate" :min="0" :max="1" :step="0.01" show-input />
				</label>
				<label class="flex flex-col gap-1 text-[13px] text-[#6b7280]">
					Replay 错误会话采样率
					<ElSlider v-model="settings.replayErrorSampleRate" :min="0" :max="1" :step="0.01" show-input />
				</label>
				<label class="flex items-center justify-between gap-3 text-[13px] text-[#6b7280]">
					数据留存天数
					<ElInputNumber v-model="settings.retentionDays" :min="1" :max="365" />
				</label>
				<label class="flex items-center justify-between gap-3 text-[13px] text-[#6b7280]">
					Replay 留存天数
					<ElInputNumber v-model="settings.replayRetentionDays" :min="1" :max="365" />
				</label>
				<label class="flex items-center justify-between gap-3 text-[13px] text-[#6b7280]">
					脱敏文本与输入
					<ElSwitch v-model="settings.maskSensitiveData" />
				</label>
				<label class="flex items-center justify-between gap-3 text-[13px] text-[#6b7280]">
					采集控制台日志
					<ElSwitch v-model="settings.captureConsole" />
				</label>
			</div>
			<template #footer>
				<ElButton @click="settingsDialog = false">取消</ElButton>
				<ElButton type="primary" :loading="settingsSaving" @click="saveSettings">保存</ElButton>
			</template>
		</ElDialog>
	</div>
</template>
