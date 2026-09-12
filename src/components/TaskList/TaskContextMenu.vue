<script setup lang="ts">
import { Calendar, CalendarPlus, CalendarRange } from "lucide-vue-next";
import { useTaskStore } from "../../stores/tasks.ts";

const props = defineProps<{
	visible: boolean;
	x: number;
	y: number;
	taskId: string | null;
}>();

const emit = defineEmits<{
	(e: "close"): void;
}>();

const taskStore = useTaskStore();

async function handleContextMenuPostpone(days: number) {
	if (!props.taskId) return;
	emit("close");
	try {
		await taskStore.postponeTask(props.taskId, days);
	} catch (err) {
		console.error("Failed to postpone task from context menu:", err);
	}
}
</script>

<template>
	<div
		v-if="visible"
		class="fixed z-50 w-48 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl text-xs space-y-0.5"
		:style="{ left: `${x}px`, top: `${y}px` }"
		@click.stop
	>
		<div class="px-3 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
			Postpone
		</div>
		<button
			type="button"
			@click="handleContextMenuPostpone(1)"
			class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
		>
			<Calendar class="w-3.5 h-3.5 text-zinc-400" />
			<span>+1 Day (Tomorrow)</span>
		</button>
		<button
			type="button"
			@click="handleContextMenuPostpone(2)"
			class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
		>
			<CalendarPlus class="w-3.5 h-3.5 text-zinc-400" />
			<span>+2 Days</span>
		</button>
		<button
			type="button"
			@click="handleContextMenuPostpone(7)"
			class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
		>
			<CalendarRange class="w-3.5 h-3.5 text-zinc-400" />
			<span>+1 Week</span>
		</button>
	</div>
</template>
