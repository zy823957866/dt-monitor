<script setup lang="ts">
/** 页面头部属性。 */
interface Props {
	/** 业务标题 */
	title: string
	/** 功能描述 */
	description: string
}

defineProps<Props>()
</script>

<template>
	<div class="monitor-page-header flex flex-wrap items-center justify-between gap-3">
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<h1 class="m-0 text-[20px] font-semibold leading-7 text-[#1f2937]">
					{{ title }}
				</h1>
				<span class="text-[13px] leading-5 text-[#8c8c8c]">{{ description }}</span>
			</div>
		</div>
		<div class="flex shrink-0 flex-wrap items-center justify-end gap-2">
			<slot />
		</div>
	</div>
</template>
