<script setup lang="ts">
import { ElPagination } from 'element-plus'

/** 分页器属性。 */
interface Props {
	/** 当前页 */
	pageNum: number
	/** 每页数量 */
	pageSize: number
	/** 总条数 */
	total: number
	/** 条目单位 */
	label?: string
}

const props = withDefaults(defineProps<Props>(), { label: '条' })
const emit = defineEmits<{
	/** 页码变化 */
	'update:pageNum': [pageNum: number]
}>()

/**
 * 处理页码变化。
 * @param pageNum 新页码
 */
function onChange(pageNum: number): void {
	emit('update:pageNum', pageNum)
}
</script>

<template>
	<div class="flex flex-wrap items-center justify-between gap-3 pt-3 text-[13px] text-[#8c8c8c]">
		<span>共 {{ props.total.toLocaleString('zh-CN') }} {{ props.label }}</span>
		<ElPagination
			:current-page="props.pageNum"
			:page-size="props.pageSize"
			:total="props.total"
			layout="prev, pager, next"
			background
			@current-change="onChange"
		/>
	</div>
</template>
