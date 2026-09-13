<script setup lang="ts">
import { CheckCircle2 } from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useFilterStore } from "../stores/filters.ts";
import { useListStore } from "../stores/lists.ts";
import { useTaskStore } from "../stores/tasks.ts";
import { sortTasks } from "../utils/sorting.ts";
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
// Sort State (driven by filterStore as single source of truth)
// ---------------------------------------------------------------------------
const activeSortField = computed(() => filterStore.sortBy as SortFieldOption);
const activeSortOrder = computed(() => filterStore.sortOrder);

function handleSortClick(field: SortFieldOption) {
	if (filterStore.sortBy === field) {
		if (filterStore.sortOrder === "asc") {
			filterStore.setSorting(field, "desc");
		} else {
			// third click clears back to default order
			filterStore.setSorting("priority", "asc");
		}
	} else {
		filterStore.setSorting(field, "asc");
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

	// Build list name map once for "by list" sort
	const listMap = new Map(listStore.lists.map((l) => [l.id, l.name.toLowerCase()]));

	return sortTasks(rootTasks, {
		field,
		order,
		completedToEnd: true,
		listMap,
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
		x: Math.min(e.clientX, window.innerWidth - 210),
		y: Math.min(e.clientY, window.innerHeight - 260),
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
