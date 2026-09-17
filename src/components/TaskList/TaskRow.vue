<script setup lang="ts">
import {
	Calendar,
	CheckCircle2,
	CheckSquare,
	ChevronDown,
	ChevronRight,
	Circle,
	ListTree,
	Plus,
	Square,
	Trash2,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import { PRIORITY, type Tag, type Task } from "../../models/index.ts";
import { useFilterStore } from "../../stores/filters.ts";
import { useListStore } from "../../stores/lists.ts";
import { isOverdue, useTaskStore } from "../../stores/tasks.ts";
import { useUIStore } from "../../stores/ui.ts";
import { formatTagLabel } from "../../utils/smartAdd.ts";

const props = defineProps<{
	task: Task;
}>();

const emit = defineEmits<{
	(e: "toggle-select", event: MouseEvent, taskId: string): void;
	(e: "context-menu", event: MouseEvent, taskId: string): void;
	(e: "delete-task", taskId: string): void;
}>();

const listStore = useListStore();
const taskStore = useTaskStore();
const filterStore = useFilterStore();
const uiStore = useUIStore();
const selectedTaskIds = computed(() => taskStore.selectedTaskIds);

const isView = computed(() => listStore.activeView !== null);

const subtasks = computed(() => {
	return taskStore.allTasks
		.filter((t) => t.parent_id === props.task.id && t.deleted_at === null)
		.filter((t) => taskStore.includeCompleted || !t.completed)
		.sort((a, b) => {
			if (a.completed !== b.completed) {
				return a.completed ? 1 : -1;
			}
			return (a.position ?? 0) - (b.position ?? 0);
		});
});

const subtaskCount = computed(() => {
	let total = 0;
	let incomplete = 0;
	for (const task of taskStore.allTasks) {
		if (task.parent_id === props.task.id && task.deleted_at === null) {
			total += 1;
			if (!task.completed) {
				incomplete += 1;
			}
		}
	}
	return total > 0 ? { total, incomplete } : null;
});

const isAddingSubtask = ref(false);
const inlineSubtaskTitle = ref("");
const isAddingInlineSubtask = ref(false);

function startInlineAddSubtask() {
	isAddingSubtask.value = true;
	inlineSubtaskTitle.value = "";
}

function cancelInlineAddSubtask() {
	isAddingSubtask.value = false;
	inlineSubtaskTitle.value = "";
}

async function handleInlineAddSubtask() {
	const title = inlineSubtaskTitle.value.trim();
	if (!title) {
		cancelInlineAddSubtask();
		return;
	}
	isAddingInlineSubtask.value = true;
	try {
		await taskStore.addTask({
			title,
			list_id: props.task.list_id,
			parent_id: props.task.id,
		});
		inlineSubtaskTitle.value = "";
		isAddingSubtask.value = false;
	} catch (err) {
		console.error("Failed to add inline subtask:", err);
	} finally {
		isAddingInlineSubtask.value = false;
	}
}

function handleToggleSelectTask(event: MouseEvent, taskId: string) {
	event.stopPropagation();
	emit("toggle-select", event, taskId);
}

function handleSelectTask(event: MouseEvent, taskId: string) {
	if (event.shiftKey || event.metaKey || event.ctrlKey) {
		handleToggleSelectTask(event, taskId);
		return;
	}
	taskStore.setActiveTask(taskId);
	uiStore.toggleDetail(true);
}
function handleKeydownTask(event: KeyboardEvent, taskId: string) {
	if (event.key === "Enter" || event.key === " ") {
		if (event.target !== event.currentTarget) {
			const target = event.target as HTMLElement;
			if (
				target.tagName === "BUTTON" ||
				target.tagName === "INPUT" ||
				target.tagName === "A" ||
				target.closest("button")
			) {
				return;
			}
		}
		event.preventDefault();
		if (event.shiftKey || event.metaKey || event.ctrlKey) {
			emit("toggle-select", event as unknown as MouseEvent, taskId);
			return;
		}
		taskStore.setActiveTask(taskId);
		uiStore.toggleDetail(true);
	}
}

async function handleToggleComplete(event: MouseEvent, taskId: string) {
	event.stopPropagation();
	try {
		await taskStore.toggleTask(taskId);
	} catch (err) {
		console.error("Failed to toggle task:", err);
	}
}

async function handleDeleteTask(event: MouseEvent, taskId: string) {
	event.stopPropagation();
	try {
		emit("delete-task", taskId);
		await taskStore.deleteTask(taskId);
	} catch (err) {
		console.error("Failed to delete task:", err);
	}
}

function handleTagPillClick(e: MouseEvent, tagName: string) {
	e.stopPropagation();
	listStore.setActiveView(null);
	listStore.setActiveList(null);
	filterStore.setTagFilter(tagName);
	taskStore.setActiveTask(null);
}

function formatDue(dateStr: string | null): string {
	if (!dateStr) return "";
	try {
		const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
		if (y && m && d) {
			const date = new Date(y, m - 1, d);
			return date.toLocaleDateString(undefined, {
				month: "short",
				day: "numeric",
			});
		}
		const date = new Date(dateStr);
		return date.toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
		});
	} catch {
		return dateStr;
	}
}

function getListName(listId: string): string {
	return listStore.lists.find((l) => l.id === listId)?.name ?? "";
}

function getTaskTags(taskId: string): Tag[] {
	return (
		taskStore.allTasks.find((t) => t.id === taskId)?.tags ??
		taskStore.tasks.find((t) => t.id === taskId)?.tags ??
		[]
	);
}
</script>

<template>
	<div class="space-y-1">
		<div
			:data-task-id="task.id"
			tabindex="0"
			role="button"
			:aria-label="`Task: ${task.title}`"
			aria-keyshortcuts="j k c p Enter Space"
			@click="handleSelectTask($event, task.id)"
			@keydown="handleKeydownTask($event, task.id)"
			@contextmenu="emit('context-menu', $event, task.id)"
			class="group flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border text-sm cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
			:class="[
				task.id === taskStore.activeTaskId
					? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-700 shadow-2xs'
					: selectedTaskIds.has(task.id)
						? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/60'
						: 'border-zinc-100 dark:border-zinc-800/80 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:border-zinc-200 dark:hover:border-zinc-700',
			]"
		>
			<!-- Task Select Box, Complete Checkbox & Title -->
			<div class="flex items-center gap-2.5 min-w-0 flex-1">
				<!-- Multi-selection checkbox -->
				<button
					type="button"
					@click="handleToggleSelectTask($event, task.id)"
					class="shrink-0 p-0.5 rounded text-zinc-300 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors cursor-pointer"
					:class="{
						'opacity-100 text-emerald-600 dark:text-emerald-500': selectedTaskIds.has(task.id),
						'opacity-0 group-hover:opacity-100': !selectedTaskIds.has(task.id),
					}"
					:title="selectedTaskIds.has(task.id) ? 'Deselect task' : 'Select task'"
					:aria-label="selectedTaskIds.has(task.id) ? 'Deselect task' : 'Select task'"
				>
					<CheckSquare
						v-if="selectedTaskIds.has(task.id)"
						class="w-4 h-4 text-emerald-600 dark:text-emerald-500"
					/>
					<Square v-else class="w-4 h-4" />
				</button>

				<!-- Task Complete Toggle -->
				<button
					type="button"
					@click="handleToggleComplete($event, task.id)"
					class="shrink-0 text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer"
					:title="task.completed ? 'Mark incomplete' : 'Mark complete'"
					:aria-label="task.completed ? 'Mark incomplete' : 'Mark complete'"
				>
					<CheckCircle2
						v-if="task.completed"
						class="w-5 h-5 text-emerald-600 dark:text-emerald-500"
					/>
					<Circle v-else class="w-5 h-5 text-zinc-300 dark:text-zinc-600 hover:text-emerald-500" />
				</button>

				<!-- Title and inline Tag Pills -->
				<div class="min-w-0 flex-1 flex flex-wrap items-center gap-1.5">
					<span
						class="text-sm font-medium truncate"
						:class="[
							task.completed
								? 'line-through text-zinc-400 dark:text-zinc-500 font-normal'
								: 'text-zinc-800 dark:text-zinc-200',
						]"
					>
						{{ task.title }}
					</span>

					<!-- Tag Pills on Task Row -->
					<div
						v-if="(task.tags?.length || getTaskTags(task.id).length) > 0"
						class="flex items-center gap-1 flex-wrap shrink-0"
					>
						<button
							v-for="tag in task.tags ?? getTaskTags(task.id)"
							:key="tag.id"
							type="button"
							@click="handleTagPillClick($event, tag.name)"
							class="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80 hover:bg-emerald-100 transition-colors cursor-pointer"
						>
							<span>{{ formatTagLabel(tag.name) }}</span>
						</button>
					</div>
				</div>
			</div>

			<!-- Task Metadata Badges & Actions -->
			<div class="flex items-center gap-2 shrink-0">
				<!-- Subtask count badge & per-task expand/collapse toggle -->
				<button
					v-if="subtaskCount && subtaskCount.total > 0"
					type="button"
					@click.stop="uiStore.toggleTaskSubtasks(task.id)"
					class="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border transition-colors cursor-pointer"
					:class="[
						uiStore.isTaskSubtasksExpanded(task.id)
							? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
							: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700/60 hover:bg-zinc-200 dark:hover:bg-zinc-700',
					]"
					:title="
						uiStore.isTaskSubtasksExpanded(task.id)
							? 'Click to collapse subtasks'
							: `${subtaskCount.incomplete} of ${subtaskCount.total} subtasks remaining. Click to expand.`
					"
					:aria-label="
						uiStore.isTaskSubtasksExpanded(task.id) ? 'Collapse subtasks' : 'Expand subtasks'
					"
					:data-subtask-toggle-id="task.id"
				>
					<ChevronDown
						v-if="uiStore.isTaskSubtasksExpanded(task.id)"
						class="w-3 h-3 text-indigo-500 shrink-0"
					/>
					<ChevronRight v-else class="w-3 h-3 text-zinc-400 shrink-0" />
					<ListTree class="w-3 h-3 text-zinc-400 shrink-0" />
					<span>{{ subtaskCount.total - subtaskCount.incomplete }}/{{ subtaskCount.total }}</span>
				</button>

				<!-- List badge (shown in Views) -->
				<span
					v-if="isView && getListName(task.list_id)"
					class="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded"
				>
					{{ getListName(task.list_id) }}
				</span>

				<!-- Priority indicator badge / border color (P1, P2, P3, None) -->
				<span
					v-if="task.priority === PRIORITY.HIGH"
					class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900"
				>
					P1
				</span>
				<span
					v-else-if="task.priority === PRIORITY.MEDIUM"
					class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900"
				>
					P2
				</span>
				<span
					v-else-if="task.priority === PRIORITY.LOW"
					class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900"
				>
					P3
				</span>

				<!-- Due date badge -->
				<span
					v-if="task.due"
					class="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded"
					:class="
						!task.completed && isOverdue(task.due)
							? 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950'
							: 'text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800'
					"
				>
					<Calendar class="w-3 h-3" />
					<span>{{ formatDue(task.due) }}</span>
				</span>

				<!-- Delete action -->
				<button
					type="button"
					title="Delete task"
					aria-label="Delete task"
					class="opacity-0 group-hover:opacity-100 hover:text-red-500 p-1 text-zinc-400 transition-opacity cursor-pointer"
					@click="handleDeleteTask($event, task.id)"
				>
					<Trash2 class="w-3.5 h-3.5" />
				</button>
			</div>
		</div>

		<!-- Indented subtasks under parent task -->
		<div
			v-if="uiStore.isTaskSubtasksExpanded(task.id)"
			class="ml-6 sm:ml-8 pl-3 border-l-2 border-zinc-200 dark:border-zinc-800 space-y-1 my-1"
			data-subtasks-container
		>
			<!-- Subtask rows -->
			<div
				v-for="subtask in subtasks"
				:key="subtask.id"
				:data-task-id="subtask.id"
				tabindex="0"
				role="button"
				:aria-label="`Subtask: ${subtask.title}`"
				aria-keyshortcuts="j k c p Enter Space"
				@click="handleSelectTask($event, subtask.id)"
				@keydown="handleKeydownTask($event, subtask.id)"
				@contextmenu="emit('context-menu', $event, subtask.id)"
				class="group/sub flex items-center justify-between gap-2.5 px-2.5 py-1.5 rounded-md border text-xs cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
				:class="[
					subtask.id === taskStore.activeTaskId
						? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-700 shadow-2xs'
						: selectedTaskIds.has(subtask.id)
							? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/60'
							: 'border-zinc-100 dark:border-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 hover:border-zinc-200 dark:hover:border-zinc-700 bg-zinc-50/40 dark:bg-zinc-900/40',
				]"
			>
				<!-- Left: Select box, Checkbox & Title -->
				<div class="flex items-center gap-2 min-w-0 flex-1">
					<!-- Multi-selection checkbox -->
					<button
						type="button"
						@click="handleToggleSelectTask($event, subtask.id)"
						class="shrink-0 p-0.5 rounded text-zinc-300 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors cursor-pointer"
						:class="{
							'opacity-100 text-emerald-600 dark:text-emerald-500': selectedTaskIds.has(subtask.id),
							'opacity-0 group-hover/sub:opacity-100': !selectedTaskIds.has(subtask.id),
						}"
						:title="selectedTaskIds.has(subtask.id) ? 'Deselect subtask' : 'Select subtask'"
						:aria-label="selectedTaskIds.has(subtask.id) ? 'Deselect subtask' : 'Select subtask'"
					>
						<CheckSquare
							v-if="selectedTaskIds.has(subtask.id)"
							class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-500"
						/>
						<Square v-else class="w-3.5 h-3.5" />
					</button>

					<!-- Subtask Complete Toggle -->
					<button
						type="button"
						@click="handleToggleComplete($event, subtask.id)"
						class="shrink-0 text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer"
						:title="subtask.completed ? 'Mark incomplete' : 'Mark complete'"
						:aria-label="subtask.completed ? 'Mark incomplete' : 'Mark complete'"
					>
						<CheckCircle2
							v-if="subtask.completed"
							class="w-4 h-4 text-emerald-600 dark:text-emerald-500"
						/>
						<Circle
							v-else
							class="w-4 h-4 text-zinc-300 dark:text-zinc-600 hover:text-emerald-500"
						/>
					</button>

					<!-- Title and inline Tag Pills -->
					<div class="min-w-0 flex-1 flex flex-wrap items-center gap-1.5">
						<span
							class="truncate font-normal select-text"
							:class="[
								subtask.completed
									? 'line-through text-zinc-400 dark:text-zinc-500 font-normal'
									: 'text-zinc-700 dark:text-zinc-300',
							]"
						>
							{{ subtask.title }}
						</span>

						<!-- Tag Pills on Subtask Row -->
						<div
							v-if="(subtask.tags?.length || getTaskTags(subtask.id).length) > 0"
							class="flex items-center gap-1 flex-wrap shrink-0"
						>
							<button
								v-for="tag in subtask.tags ?? getTaskTags(subtask.id)"
								:key="tag.id"
								type="button"
								@click="handleTagPillClick($event, tag.name)"
								class="inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.2 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80 hover:bg-emerald-100 transition-colors cursor-pointer"
							>
								<span>{{ formatTagLabel(tag.name) }}</span>
							</button>
						</div>
					</div>
				</div>

				<!-- Right: Priority, Due Date, Delete button -->
				<div class="flex items-center gap-1.5 shrink-0">
					<!-- Priority indicator badge -->
					<span
						v-if="subtask.priority === PRIORITY.HIGH"
						class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900"
					>
						P1
					</span>
					<span
						v-else-if="subtask.priority === PRIORITY.MEDIUM"
						class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900"
					>
						P2
					</span>
					<span
						v-else-if="subtask.priority === PRIORITY.LOW"
						class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900"
					>
						P3
					</span>

					<!-- Due date badge -->
					<span
						v-if="subtask.due"
						class="flex items-center gap-0.5 text-[10px] px-1.5 py-0.2 rounded"
						:class="
							!subtask.completed && isOverdue(subtask.due)
								? 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950'
								: 'text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800'
						"
					>
						<Calendar class="w-2.5 h-2.5" />
						<span>{{ formatDue(subtask.due) }}</span>
					</span>

					<!-- Delete action -->
					<button
						type="button"
						title="Delete subtask"
						aria-label="Delete subtask"
						class="opacity-0 group-hover/sub:opacity-100 hover:text-red-500 p-0.5 text-zinc-400 transition-opacity cursor-pointer"
						@click="handleDeleteTask($event, subtask.id)"
					>
						<Trash2 class="w-3 h-3" />
					</button>
				</div>
			</div>

			<!-- Empty active subtasks notice if all completed and hiding completed -->
			<div
				v-if="subtasks.length === 0 && !isAddingSubtask"
				class="text-[11px] text-zinc-400 italic py-0.5 px-2"
			>
				No active subtasks
			</div>

			<!-- Inline quick-add subtask form or button -->
			<div class="pt-0.5">
				<form
					v-if="isAddingSubtask"
					@submit.prevent="handleInlineAddSubtask"
					class="flex items-center gap-1.5"
				>
					<input
						v-model="inlineSubtaskTitle"
						type="text"
						placeholder="Add a subtask..."
						autofocus
						class="flex-1 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 text-zinc-800 dark:text-zinc-200 focus:outline-hidden focus:border-emerald-500"
						@keydown.esc="cancelInlineAddSubtask"
					/>
					<button
						type="submit"
						:disabled="!inlineSubtaskTitle.trim() || isAddingInlineSubtask"
						class="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded text-xs cursor-pointer transition-colors shrink-0"
					>
						Add
					</button>
					<button
						type="button"
						@click="cancelInlineAddSubtask"
						class="px-2 py-1 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 text-xs cursor-pointer shrink-0"
					>
						Cancel
					</button>
				</form>

				<button
					v-else
					type="button"
					@click="startInlineAddSubtask"
					class="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 py-0.5 px-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer"
				>
					<Plus class="w-3 h-3" />
					<span>Add subtask</span>
				</button>
			</div>
		</div>
	</div>
</template>
