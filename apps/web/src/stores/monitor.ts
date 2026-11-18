import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { listActiveProjects, type MonitorQuery, type ProjectVO } from '@/api/monitor'

/** 监控时间范围预设。 */
export type MonitorRange = '1h' | '24h' | '7d' | '30d'

const RANGE_MS: Record<MonitorRange, number> = {
	'1h': 60 * 60 * 1000,
	'24h': 24 * 60 * 60 * 1000,
	'7d': 7 * 24 * 60 * 60 * 1000,
	'30d': 30 * 24 * 60 * 60 * 1000,
}

/** 监控页面共享的项目与时间范围状态。 */
export const useMonitorStore = defineStore('monitor', () => {
	const projectId = ref<number>()
	const range = ref<MonitorRange>('24h')
	const activeProjects = ref<ProjectVO[]>([])
	const projectLoading = ref(false)

	/** 当前时间范围查询参数。 */
	const query = computed(() => {
		const to = new Date()
		const from = new Date(to.getTime() - RANGE_MS[range.value])
		return {
			projectId: projectId.value,
			from: from.toISOString(),
			to: to.toISOString(),
		}
	})

	/**
	 * 加载启用项目，并在未选择时选中首个项目。
	 * @returns 当前项目 ID
	 */
	async function ensureProject(): Promise<number | undefined> {
		if (activeProjects.value.length && projectId.value) return projectId.value
		projectLoading.value = true
		try {
			activeProjects.value = await listActiveProjects()
			if (!projectId.value || !activeProjects.value.some((item) => item.id === projectId.value)) {
				projectId.value = activeProjects.value[0]?.id
			}
			return projectId.value
		} finally {
			projectLoading.value = false
		}
	}

	/**
	 * 设置当前项目。
	 * @param value 项目 ID
	 */
	function setProjectId(value: number): void {
		projectId.value = value
	}

	/**
	 * 生成带项目与时间范围的请求参数。
	 * @param extra 额外筛选参数
	 * @returns 请求参数
	 */
	async function resolveQuery<T extends Record<string, unknown> = Record<string, unknown>>(
		extra: T = {} as T,
	): Promise<MonitorQuery & T> {
		await ensureProject()
		const to = new Date()
		const from = new Date(to.getTime() - RANGE_MS[range.value])
		return {
			projectId: projectId.value,
			from: from.toISOString(),
			to: to.toISOString(),
			...extra,
		}
	}

	return {
		projectId,
		range,
		query,
		activeProjects,
		projectLoading,
		ensureProject,
		setProjectId,
		resolveQuery,
	}
})
