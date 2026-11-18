<script setup lang="ts">
import { computed } from 'vue'

/** 指标卡属性。 */
interface Props {
	/** 指标名称 */
	label: string
	/** 指标值 */
	value: number | string
	/** 单位 */
	unit?: string
	/** 同比变化 */
	change?: number
	/** 对比文案 */
	changeLabel?: string
	/** 是否显示同比变化 */
	showChange?: boolean
	/** 无同比时展示的辅助说明 */
	hint?: string
	/** 装饰色 */
	accent?: string
}

const props = withDefaults(defineProps<Props>(), {
	unit: '',
	change: 0,
	changeLabel: '较昨日',
	showChange: true,
	hint: '',
	accent: '#1677ff',
})

const isUp = computed(() => props.change >= 0)
const changeText = computed(() => {
	const formatted = Math.abs(Number(props.change)).toFixed(2)
	return `${isUp.value ? '↑' : '↓'} ${formatted}%`
})
</script>

<template>
	<div class="page-card relative overflow-hidden">
		<div
			class="absolute left-0 top-0 h-1 w-full opacity-80"
			:style="{ backgroundColor: accent }"
		></div>
		<div class="text-[14px] text-[#8c8c8c]">{{ label }}</div>
		<div class="mt-2 flex items-end gap-1">
			<span class="text-[30px] font-semibold leading-none tracking-tight text-[#111827]">
				{{ value }}{{ unit }}
			</span>
		</div>
		<div v-if="showChange" class="mt-3 flex items-center gap-1 text-xs">
			<span :class="isUp ? 'text-[#16a34a]' : 'text-[#dc2626]'">{{ changeText }}</span>
			<span class="text-[#9ca3af]">{{ changeLabel }}</span>
		</div>
		<div v-else-if="hint" class="mt-3 truncate text-xs text-[#9ca3af]">
			{{ hint }}
		</div>
	</div>
</template>
