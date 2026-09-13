<script setup lang="ts">
import { CheckCircle2 } from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useFilterStore } from "../stores/filters.ts";
import { useListStore } from "../stores/lists.ts";
import { useTaskStore } from "../stores/tasks.ts";
import {
	compareByCompletion,
	compareByDueDate,
	compareByPriority,
	type SortOrder,
} from "../utils/sorting.ts";
import HomeCaptureView from "./TaskList/HomeCaptureView.vue";
import TaskBatchToolbar from "./TaskList/TaskBatchToolbar.vue";
import TaskContextMenu from "./TaskList/TaskContextMenu.vue";
import TaskListHeader, { type SortFieldOption } from "./TaskList/TaskListHeader.vue";
import TaskRow from "./TaskList/TaskRow.vue";
import TaskSmartAddInput from "./TaskList/TaskSmartAddInput.vue";

const listStore = useListStore();
const taskStore = useTaskStore();
const filterStore = useFilterStore();

const hasActiveSelection = computed(
	() => !!listStore.activeList || !!listStore.activeView || !!filterStore.selectedTag,
);

// ---------------------------------------------------------------------------
// Sort State
// ---------------------------------------------------------------------------
const activeSortField = ref<SortFieldOption | null>(null);
const activeSortOrder = ref<SortOrder>("asc");

function handleSortClick(field: SortFieldOption) {
	if (activeSortField.value === field) {
		if (activeSortOrder.value === "asc") {
			activeSortOrder.value = "desc";
		} else {
			// third click clears back to default order
			activeSortField.value = null;
			activeSortOrder.value = "asc";
		}
	} else {
		activeSortField.value = field;
		activeSortOrder.value = "asc";
	}
}

const visibleTasks = computed(() => {
	// If user is searching, use filteredTasks which handles search across title, description, location, url
	const tasks = filterStore.searchQuery.trim()
		? taskStore.filteredTasks
		: taskStore.includeCompleted
			? taskStore.tasks
			: taskStore.incompleteTasks;

	// Subtasks belong in parent detail panes, not top-level center-pane list rows
	const rootTasks = tasks.filter((t) => !t.parent_id);

	const field = activeSortField.value;
	const order = activeSortOrder.value;
	const dir = order === "asc" ? 1 : -1;

	// Build list name map once for "by list" sort
	const listMap = new Map(listStore.lists.map((l) => [l.id, l.name.toLowerCase()]));

	return [...rootTasks].sort((a, b) => {
		// Completed tasks always sink to bottom
		const cmpCompletion = compareByCompletion(a, b);
		if (cmpCompletion !== 0) return cmpCompletion;

		// No user-chosen sort: preserve store order
		if (!field) return 0;

		if (field === "priority") return compareByPriority(a, b, order);
		if (field === "due") return compareByDueDate(a, b, order);

		if (field === "created_at") {
			const ta = a.created_at;
			const tb = b.created_at;
			if (!ta && !tb) return 0;
			if (!ta) return 1;
			if (!tb) return -1;
			return ta < tb ? -dir : ta > tb ? dir : 0;
		}

		if (field === "list") {
			const la = listMap.get(a.list_id) ?? "";
			const lb = listMap.get(b.list_id) ?? "";
			return la < lb ? -dir : la > lb ? dir : 0;
		}

		if (field === "tags") {
			// Sort by first tag name
			const ta = a.tags?.[0]?.name?.toLowerCase() ?? "\uFFFF";
			const tb = b.tags?.[0]?.name?.toLowerCase() ?? "\uFFFF";
			return ta < tb ? -dir : ta > tb ? dir : 0;
		}

		return 0;
	});
});

// ---------------------------------------------------------------------------
// Selection State
// ---------------------------------------------------------------------------
const selectedTaskIds = ref<Set<string>>(new Set());

function handleToggleSelectTask(event: MouseEvent, taskId: string) {
	event.stopPropagation();
	const next = new Set(selectedTaskIds.value);
	if (next.has(taskId)) {
		next.delete(taskId);
	} else {
		next.add(taskId);
	}
	selectedTaskIds.value = next;
}

function handleDeleteTask(taskId: string) {
	selectedTaskIds.value.delete(taskId);
}

// ---------------------------------------------------------------------------
// Context Menu State
// ---------------------------------------------------------------------------
interface ContextMenuState {
	visible: boolean;
	x: number;
	y: number;
	taskId: string | null;
}

const contextMenu = ref<ContextMenuState>({
	visible: false,
	x: 0,
	y: 0,
	taskId: null,
});

function closeContextMenu() {
	contextMenu.value.visible = false;
	contextMenu.value.taskId = null;
}

function handleTaskContextMenu(e: MouseEvent, taskId: string) {
	e.preventDefault();
	e.stopPropagation();
	taskStore.setActiveTask(taskId);
	contextMenu.value = {
		visible: true,
		x: Math.min(e.clientX, window.innerWidth - 200),
		y: Math.min(e.clientY, window.innerHeight - 240),
		taskId,
	};
}

function handleDocumentClick() {
	closeContextMenu();
}

onMounted(() => {
	document.addEventListener("click", handleDocumentClick);
});

onUnmounted(() => {
	document.removeEventListener("click", handleDocumentClick);
});

// Clear selections when active view or list changes
watch(
	() => [listStore.activeListId, listStore.activeView, filterStore.selectedTag],
	() => {
		selectedTaskIds.value.clear();
		closeContextMenu();
	},
);
</script>

<template>
	<section
		class="flex flex-col h-full bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 select-none overflow-hidden"
	>
		<!-- Header -->
		<TaskListHeader
			:active-sort-field="activeSortField"
			:active-sort-order="activeSortOrder"
			:visible-tasks="visibleTasks"
			@change-sort="handleSortClick"
		/>

		<!-- Batch Action Toolbar (When tasks are available or selected) -->
		<TaskBatchToolbar
			v-if="hasActiveSelection && visibleTasks.length > 0"
			:selected-task-ids="selectedTaskIds"
			:visible-tasks="visibleTasks"
			@update:selected-task-ids="selectedTaskIds = $event"
		/>

		<!-- Quick Add Input & Smart Add Dropdown -->
		<TaskSmartAddInput v-if="hasActiveSelection" />

		<!-- Tasks List Container -->
		<div class="flex-1 overflow-y-auto p-3 space-y-1">
			<!-- Empty state (no list/view selected) -->
			<HomeCaptureView v-if="!hasActiveSelection" />

			<!-- Loading state -->
			<div
				v-else-if="taskStore.loading && taskStore.tasks.length === 0"
				class="py-8 text-center text-sm text-zinc-400"
			>
				Loading tasks...
			</div>

			<!-- Empty state: Active list/view has no tasks -->
			<div
				v-else-if="visibleTasks.length === 0"
				class="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-400 dark:text-zinc-500"
			>
				<CheckCircle2 class="w-12 h-12 mb-3 text-emerald-500/40 stroke-1" />
				<p class="text-sm font-medium">All clear!</p>
				<p class="text-xs mt-1">
					{{
						listStore.activeView === "overdue"
							? "No overdue tasks. You're all caught up!"
							: "No tasks to display. Add one using the input above."
					}}
				</p>
			</div>

			<!-- Tasks list -->
			<TaskRow
				v-for="task in visibleTasks"
				:key="task.id"
				:task="task"
				:selected-task-ids="selectedTaskIds"
				@toggle-select="handleToggleSelectTask"
				@context-menu="handleTaskContextMenu"
				@delete-task="handleDeleteTask"
			/>
		</div>

		<!-- Task Context Menu: Postpone Actions -->
		<TaskContextMenu
			:visible="contextMenu.visible"
			:x="contextMenu.x"
			:y="contextMenu.y"
			:task-id="contextMenu.taskId"
			@close="closeContextMenu"
		/>
	</section>
</template>
