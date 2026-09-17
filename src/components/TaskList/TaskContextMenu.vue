<script setup lang="ts">
import {
	Calendar,
	CalendarPlus,
	CalendarRange,
	Check,
	CheckCircle2,
	ChevronRight,
	Circle,
	Flag,
	FolderInput,
	Trash2,
} from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { PRIORITY, type Priority } from "../../models/index.ts";
import { useListStore } from "../../stores/lists.ts";
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
const listStore = useListStore();

const activeSubmenu = ref<"priority" | "list" | "postpone" | null>(null);

watch(
	() => props.visible,
	(vis) => {
		if (!vis) activeSubmenu.value = null;
	},
);

const currentTask = computed(() => {
	if (!props.taskId) return null;
	return (
		taskStore.allTasks.find((t) => t.id === props.taskId) ??
		taskStore.tasks.find((t) => t.id === props.taskId) ??
		null
	);
});

const openLeft = computed(() => {
	if (typeof window === "undefined") return false;
	return props.x + 200 + 180 > window.innerWidth;
});
const isMultiSelected = computed(() => {
	return Boolean(
		props.taskId &&
		taskStore.selectedTaskIds.has(props.taskId) &&
		taskStore.selectedTaskIds.size > 1,
	);
});

const targetIds = computed<string[]>(() => {
	if (isMultiSelected.value) {
		return Array.from(taskStore.selectedTaskIds);
	}
	return props.taskId ? [props.taskId] : [];
});

async function handleToggleComplete() {
	const multi = isMultiSelected.value;
	const ids = targetIds.value;
	if (!ids.length) return;
	emit("close");
	try {
		if (multi) {
			await taskStore.batchUpdate({
				task_ids: ids,
				completed: true,
			});
			taskStore.clearSelection();
		} else {
			await taskStore.toggleTask(ids[0]!);
		}
	} catch (err) {
		console.error("Failed to toggle task from context menu:", err);
	}
}

async function handleSetPriority(priority: Priority | null) {
	const multi = isMultiSelected.value;
	const ids = targetIds.value;
	if (!ids.length) return;
	emit("close");
	try {
		if (multi) {
			await taskStore.batchUpdate({
				task_ids: ids,
				priority,
			});
		} else {
			await taskStore.updateTask({ id: ids[0]!, priority });
		}
	} catch (err) {
		console.error("Failed to update priority from context menu:", err);
	}
}

async function handleMoveToList(listId: string) {
	const multi = isMultiSelected.value;
	const ids = targetIds.value;
	if (!ids.length) return;
	emit("close");
	try {
		if (multi) {
			await taskStore.batchUpdate({
				task_ids: ids,
				list_id: listId,
			});
			taskStore.clearSelection();
		} else {
			await taskStore.updateTask({ id: ids[0]!, list_id: listId });
		}
	} catch (err) {
		console.error("Failed to move task to list from context menu:", err);
	}
}

async function handleContextMenuPostpone(days: number) {
	const multi = isMultiSelected.value;
	const ids = targetIds.value;
	if (!ids.length) return;
	emit("close");
	try {
		if (multi) {
			await taskStore.batchUpdate({
				task_ids: ids,
				postpone_days: days,
			});
		} else {
			await taskStore.postponeTask(ids[0]!, days);
		}
	} catch (err) {
		console.error("Failed to postpone task from context menu:", err);
	}
}

async function handleDelete() {
	const multi = isMultiSelected.value;
	const ids = targetIds.value;
	if (!ids.length) return;
	emit("close");
	try {
		if (multi) {
			await taskStore.batchDelete(ids);
			taskStore.clearSelection();
		} else {
			await taskStore.deleteTask(ids[0]!);
		}
	} catch (err) {
		console.error("Failed to delete task from context menu:", err);
	}
}
</script>

<template>
	<div
		v-if="visible"
		class="fixed z-50 w-48 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl text-xs space-y-0.5 select-none"
		:style="{ left: `${x}px`, top: `${y}px` }"
		@click.stop
		@mouseleave="activeSubmenu = null"
		@keydown.esc="emit('close')"
	>
		<!-- Toggle Complete -->
		<button
			type="button"
			@click="handleToggleComplete"
			@mouseenter="activeSubmenu = null"
			class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
		>
			<CheckCircle2
				v-if="currentTask?.completed"
				class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-500"
			/>
			<Circle v-else class="w-3.5 h-3.5 text-zinc-400" />
			<span>{{
				isMultiSelected
					? `Mark (${targetIds.length}) Complete`
					: currentTask?.completed
						? "Mark Incomplete"
						: "Mark Complete"
			}}</span>
		</button>

		<div class="my-1 border-t border-zinc-100 dark:border-zinc-800" />

		<!-- Priority Submenu Trigger -->
		<div class="relative" @mouseenter="activeSubmenu = 'priority'">
			<button
				type="button"
				@click="activeSubmenu = activeSubmenu === 'priority' ? null : 'priority'"
				class="w-full flex items-center justify-between px-3 py-1.5 text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
			>
				<div class="flex items-center gap-2">
					<Flag class="w-3.5 h-3.5 text-zinc-400" />
					<span>Priority</span>
				</div>
				<ChevronRight class="w-3.5 h-3.5 text-zinc-400" />
			</button>

			<!-- Priority Submenu -->
			<div
				v-if="activeSubmenu === 'priority'"
				class="absolute top-0 w-40 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl py-1 text-xs space-y-0.5 z-20"
				:class="openLeft ? 'right-full mr-1' : 'left-full ml-1'"
			>
				<button
					type="button"
					@click="handleSetPriority(PRIORITY.HIGH)"
					class="w-full flex items-center justify-between px-3 py-1.5 text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
				>
					<div class="flex items-center gap-2">
						<Flag class="w-3.5 h-3.5 fill-red-500 text-red-500" />
						<span>High (P1)</span>
					</div>
					<Check
						v-if="currentTask?.priority === PRIORITY.HIGH"
						class="w-3.5 h-3.5 text-emerald-500"
					/>
				</button>
				<button
					type="button"
					@click="handleSetPriority(PRIORITY.MEDIUM)"
					class="w-full flex items-center justify-between px-3 py-1.5 text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
				>
					<div class="flex items-center gap-2">
						<Flag class="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
						<span>Medium (P2)</span>
					</div>
					<Check
						v-if="currentTask?.priority === PRIORITY.MEDIUM"
						class="w-3.5 h-3.5 text-emerald-500"
					/>
				</button>
				<button
					type="button"
					@click="handleSetPriority(PRIORITY.LOW)"
					class="w-full flex items-center justify-between px-3 py-1.5 text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
				>
					<div class="flex items-center gap-2">
						<Flag class="w-3.5 h-3.5 fill-blue-500 text-blue-500" />
						<span>Low (P3)</span>
					</div>
					<Check
						v-if="currentTask?.priority === PRIORITY.LOW"
						class="w-3.5 h-3.5 text-emerald-500"
					/>
				</button>
				<button
					type="button"
					@click="handleSetPriority(null)"
					class="w-full flex items-center justify-between px-3 py-1.5 text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
				>
					<div class="flex items-center gap-2">
						<Flag class="w-3.5 h-3.5 text-zinc-400" />
						<span>None</span>
					</div>
					<Check v-if="!currentTask?.priority" class="w-3.5 h-3.5 text-emerald-500" />
				</button>
			</div>
		</div>

		<!-- Move to List Submenu Trigger -->
		<div class="relative" @mouseenter="activeSubmenu = 'list'">
			<button
				type="button"
				@click="activeSubmenu = activeSubmenu === 'list' ? null : 'list'"
				class="w-full flex items-center justify-between px-3 py-1.5 text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
			>
				<div class="flex items-center gap-2">
					<FolderInput class="w-3.5 h-3.5 text-zinc-400" />
					<span>Move to List</span>
				</div>
				<ChevronRight class="w-3.5 h-3.5 text-zinc-400" />
			</button>

			<!-- Move to List Submenu -->
			<div
				v-if="activeSubmenu === 'list'"
				class="absolute top-0 w-44 max-h-56 overflow-y-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl py-1 text-xs space-y-0.5 z-20"
				:class="openLeft ? 'right-full mr-1' : 'left-full ml-1'"
			>
				<div
					v-if="listStore.lists.length === 0"
					class="px-3 py-1.5 text-zinc-400 italic text-[11px]"
				>
					No lists
				</div>
				<button
					v-for="list in listStore.lists"
					:key="list.id"
					type="button"
					@click="handleMoveToList(list.id)"
					class="w-full flex items-center justify-between px-3 py-1.5 text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
					:class="{
						'font-semibold text-emerald-600 dark:text-emerald-400':
							currentTask?.list_id === list.id,
					}"
				>
					<span class="truncate">{{ list.name }}</span>
					<Check
						v-if="currentTask?.list_id === list.id"
						class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0"
					/>
				</button>
			</div>
		</div>

		<!-- Postpone Submenu Trigger -->
		<div class="relative" @mouseenter="activeSubmenu = 'postpone'">
			<button
				type="button"
				@click="activeSubmenu = activeSubmenu === 'postpone' ? null : 'postpone'"
				class="w-full flex items-center justify-between px-3 py-1.5 text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
			>
				<div class="flex items-center gap-2">
					<Calendar class="w-3.5 h-3.5 text-zinc-400" />
					<span>Postpone</span>
				</div>
				<ChevronRight class="w-3.5 h-3.5 text-zinc-400" />
			</button>

			<!-- Postpone Submenu -->
			<div
				v-if="activeSubmenu === 'postpone'"
				class="absolute top-0 w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl py-1 text-xs space-y-0.5 z-20"
				:class="openLeft ? 'right-full mr-1' : 'left-full ml-1'"
			>
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
		</div>

		<div class="my-1 border-t border-zinc-100 dark:border-zinc-800" />

		<!-- Delete Task -->
		<button
			type="button"
			@click="handleDelete"
			@mouseenter="activeSubmenu = null"
			class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
		>
			<Trash2 class="w-3.5 h-3.5 text-red-500" />
			<span>{{ isMultiSelected ? `Delete (${targetIds.length}) Tasks` : "Delete Task" }}</span>
		</button>
	</div>
</template>
