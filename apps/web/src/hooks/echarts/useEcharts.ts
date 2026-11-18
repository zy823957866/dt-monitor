import type { EChartsOption } from 'echarts'
import {
	computed,
	nextTick,
	onBeforeUnmount,
	unref,
	watch,
	type Ref,
} from 'vue'
import {
	useDebounceFn,
	useResizeObserver,
	useWindowSize,
} from '@vueuse/core'
import echarts from './echarts'
import type EchartsUI from './echarts-ui.vue'

type EchartsUIType = typeof EchartsUI | undefined
type ChartInstance = ReturnType<typeof echarts.init>

/**
 * 管理 ECharts 实例、主题、响应式 resize 与卸载销毁。
 * @param chartRef 图表组件引用
 * @param isDark 是否暗色主题
 * @returns 渲染、更新与实例访问方法
 */
function useEcharts(chartRef: Ref<EchartsUIType>, isDark: boolean | Ref<boolean> = false) {
	let chartInstance: ChartInstance | null = null
	let cacheOptions: EChartsOption = {}
	let retryTimer: ReturnType<typeof setTimeout> | null = null
	const resizeHandler = useDebounceFn(resize, 200)
	const { width, height } = useWindowSize()

	const getChartEl = (): HTMLElement | null => {
		const refValue = chartRef.value as unknown
		if (!refValue) return null
		if (refValue instanceof HTMLElement) return refValue
		const component = refValue as { $el?: HTMLElement }
		return component.$el ?? null
	}

	const isHidden = (el: HTMLElement | null): boolean =>
		!el || el.offsetWidth === 0 || el.offsetHeight === 0

	const themeOptions = computed((): EChartsOption => ({
		backgroundColor: 'transparent',
	}))

	/**
	 * 初始化图表实例。
	 * @returns 图表实例或 null
	 */
	function initChart(): ChartInstance | null {
		const el = getChartEl()
		if (!el) return null
		chartInstance = echarts.init(el, unref(isDark) ? 'dark' : undefined)
		return chartInstance
	}

	/**
	 * 渲染图表；容器暂不可见时短暂重试。
	 * @param options 图表配置
	 * @param clear 是否清空旧配置
	 * @param retry 当前重试次数
	 * @returns 图表实例或 null
	 */
	async function renderEcharts(
		options: EChartsOption,
		clear = true,
		retry = 0,
	): Promise<ChartInstance | null> {
		cacheOptions = options
		await nextTick()
		const el = getChartEl()
		if (isHidden(el)) {
			if (retry >= 10) return null
			if (retryTimer) clearTimeout(retryTimer)
			retryTimer = setTimeout(() => {
				void renderEcharts(cacheOptions, clear, retry + 1)
			}, 50)
			return null
		}
		if (!chartInstance || chartInstance.getDom() !== el) {
			chartInstance?.dispose()
			if (!initChart()) return null
		}
		if (clear) chartInstance?.clear()
		chartInstance?.setOption({ ...options, ...themeOptions.value })
		chartInstance?.resize()
		return chartInstance
	}

	/**
	 * 增量更新图表数据。
	 * @param option 新配置
	 * @param notMerge 是否完全替换
	 * @param lazyUpdate 是否延迟重绘
	 * @returns 图表实例
	 */
	function updateData(
		option: EChartsOption,
		notMerge = false,
		lazyUpdate = false,
	): Promise<ChartInstance | null> {
		cacheOptions = option
		return nextTick().then(() => {
			if (!chartInstance) return renderEcharts(option)
			chartInstance.setOption({ ...option, ...themeOptions.value }, { notMerge, lazyUpdate })
			return chartInstance
		})
	}

	/** 根据容器尺寸重绘图表。 */
	function resize(): void {
		if (isHidden(getChartEl())) return
		chartInstance?.resize({ animation: { duration: 300, easing: 'quadraticIn' } })
	}

	watch([width, height], () => resizeHandler())
	useResizeObserver(chartRef as never, resizeHandler)
	watch(
		() => unref(isDark),
		() => {
			if (!chartInstance) return
			chartInstance.dispose()
			initChart()
			void renderEcharts(cacheOptions)
		},
	)
	onBeforeUnmount(() => {
		if (retryTimer) clearTimeout(retryTimer)
		chartInstance?.dispose()
		chartInstance = null
	})

	return {
		renderEcharts,
		updateData,
		resize,
		getChartInstance: (): ChartInstance | null => chartInstance,
	}
}

export { echarts, useEcharts }
export type { EchartsUIType }
