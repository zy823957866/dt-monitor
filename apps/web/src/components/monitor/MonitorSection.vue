<script setup lang="ts">
/** 内容区卡片属性。 */
interface Props {
	/** 卡片标题 */
	title: string
	/** 辅助说明 */
	description?: string
	/** 内容区 class */
	contentClass?: string
}

withDefaults(defineProps<Props>(), {
	description: '',
	contentClass: '',
})
</script>

<template>
	<section class="page-card flex min-h-0 flex-col">
		<header class="mb-3 flex flex-wrap items-center justify-between gap-2">
			<div class="min-w-0">
				<h2 class="m-0 text-[15px] font-semibold text-[#1f2937]">{{ title }}</h2>
				<p v-if="description" class="m-0 mt-1 text-xs text-[#9ca3af]">
					{{ description }}
				</p>
			</div>
			<div class="flex shrink-0 items-center gap-2">
				<slot name="extra" />
			</div>
		</header>
		<div class="min-h-0 flex-1" :class="contentClass">
			<slot />
		</div>
	</section>
</template>
