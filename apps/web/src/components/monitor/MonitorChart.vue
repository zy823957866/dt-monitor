<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { onMounted, ref, watch } from 'vue'
import { useTheme } from '@dt-frames/layout'
import EchartsUI from '@/hooks/echarts/echarts-ui.vue'
import { useEcharts, type EchartsUIType } from '@/hooks/echarts/useEcharts'

/** 图表组件属性。 */
interface Props {
	/** ECharts 配置 */
	option: EChartsOption
	/** 图表高度 */
	height?: string
	/** 是否加载中 */
	loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
	height: '240px',
	loading: false,
})
const elRef = ref<EchartsUIType>()
const { isDark } = useTheme()
const { renderEcharts } = useEcharts(elRef, isDark)

const render = (): void => {
	void renderEcharts(props.option)
}

watch(() => props.option, render, { deep: true })
onMounted(render)
</script>

<template>
	<div class="relative min-h-0 w-full" :style="{ height }">
		<EchartsUI ref="elRef" :height="height" />
		<div
			v-if="loading"
			class="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-sm text-gray-400"
		>
			正在加载图表…
		</div>
	</div>
</template>
