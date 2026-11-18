<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ElButton, ElOption, ElSelect } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { storeToRefs } from 'pinia'
import { useMonitorStore, type MonitorRange } from '@/stores/monitor'

/** 筛选栏事件。 */
const emit = defineEmits<{
	/** 查询条件变化或点击刷新 */
	refresh: []
	/** 项目切换 */
	projectChange: [projectId: number]
}>()

const store = useMonitorStore()
const { projectId, range, activeProjects, projectLoading } = storeToRefs(store)

const rangeOptions: Array<{ label: string; value: MonitorRange }> = [
	{ label: '最近 1 小时', value: '1h' },
	{ label: '最近 24 小时', value: '24h' },
	{ label: '最近 7 天', value: '7d' },
	{ label: '最近 30 天', value: '30d' },
]

const projectOptions = computed(() =>
	activeProjects.value.map((project) => ({
		label: project.name,
		value: project.id,
	})),
)

/** 触发刷新。 */
const refresh = (): void => emit('refresh')

/** 项目切换后刷新。 */
const onProjectChange = (value: number): void => {
	store.setProjectId(value)
	emit('projectChange', value)
	emit('refresh')
}

onMounted(() => {
	void store.ensureProject()
})
</script>

<template>
	<ElSelect
		:model-value="projectId"
		:loading="projectLoading"
		placeholder="选择项目"
		class="w-[150px]"
		@update:model-value="onProjectChange"
	>
		<ElOption
			v-for="item in projectOptions"
			:key="item.value"
			:label="item.label"
			:value="item.value"
		/>
	</ElSelect>
	<ElSelect
		v-model="range"
		class="w-[128px]"
		@change="refresh"
	>
		<ElOption
			v-for="item in rangeOptions"
			:key="item.value"
			:label="item.label"
			:value="item.value"
		/>
	</ElSelect>
	<ElButton :icon="Refresh" circle title="刷新数据" @click="refresh" />
</template>
