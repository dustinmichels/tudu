<script setup lang="ts">
import {
	AlertCircle,
	CalendarPlus,
	Check,
	CheckSquare,
	ChevronDown,
	FolderInput,
	MinusSquare,
	Square,
	Tags,
	Trash2,
} from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { PRIORITY, type Priority, type Task } from "../../models/index.ts";
import { formatTagLabel } from "../../utils/smartAdd.ts";
import { batchAssignTag, batchRemoveTag } from "../../services/api.ts";
import { useListStore } from "../../stores/lists.ts";
import { useTagStore } from "../../stores/tags.ts";
import { useTaskStore } from "../../stores/tasks.ts";
import { getListIcon } from "../../utils/icons.ts";

const props = defineProps<{
	visibleTasks: Task[];
}>();

const listStore = useListStore();
const taskStore = useTaskStore();
const tagStore = useTagStore();

const isBatchOperating = ref(false);

type DropdownMenu = "select" | "postpone" | "priority" | "list" | "tag" | null;
const activeDropdown = ref<DropdownMenu>(null);
const customPostponeDate = ref("");
const customNewTagName = ref("");

const allVisibleSelected = computed(() => {
	if (!props.visibleTasks.length) return false;
	return props.visibleTasks.every((t) => taskStore.selectedTaskIds.has(t.id));
});

const someVisibleSelected = computed(() => {
	return (
		props.visibleTasks.some((t) => taskStore.selectedTaskIds.has(t.id)) && !allVisibleSelected.value
	);
});

function toggleDropdown(menu: DropdownMenu) {
	activeDropdown.value = activeDropdown.value === menu ? null : menu;
}

function closeDropdowns() {
	activeDropdown.value = null;
}

function handleDocumentClick(e: MouseEvent) {
	const target = e.target as HTMLElement | null;
	if (target && !target.closest("[data-dropdown-container]")) {
		closeDropdowns();
	}
}

onMounted(() => {
	document.addEventListener("click", handleDocumentClick);
});

onUnmounted(() => {
	document.removeEventListener("click", handleDocumentClick);
});

function toggleSelectAll() {
	if (allVisibleSelected.value) {
		selectNone();
	} else {
		selectAll();
	}
}

function selectAll() {
	taskStore.setSelectedTaskIds(props.visibleTasks.map((t) => t.id));
	closeDropdowns();
}

function selectNone() {
	taskStore.clearSelection();
	closeDropdowns();
}

function selectInvert() {
	const next = new Set<string>();
	for (const task of props.visibleTasks) {
		if (!taskStore.selectedTaskIds.has(task.id)) {
			next.add(task.id);
		}
	}
	taskStore.setSelectedTaskIds(next);
	closeDropdowns();
}

async function handleBatchComplete() {
	const ids = Array.from(taskStore.selectedTaskIds);
	if (!ids.length) return;
	isBatchOperating.value = true;
	try {
		await taskStore.batchUpdate({
			task_ids: ids,
			completed: true,
		});
		taskStore.clearSelection();
	} catch (err) {
		console.error("Failed to batch complete tasks:", err);
	} finally {
		isBatchOperating.value = false;
		closeDropdowns();
	}
}

async function handleBatchPostpone(days: number) {
	const ids = Array.from(taskStore.selectedTaskIds);
	if (!ids.length) return;
	isBatchOperating.value = true;
	try {
		await taskStore.batchUpdate({
			task_ids: ids,
			postpone_days: days,
		});
	} catch (err) {
		console.error("Failed to batch postpone tasks:", err);
	} finally {
		isBatchOperating.value = false;
		closeDropdowns();
	}
}

async function handleBatchCustomDate() {
	const ids = Array.from(taskStore.selectedTaskIds);
	const dateVal = customPostponeDate.value.trim();
	if (!ids.length || !dateVal) return;
	isBatchOperating.value = true;
	try {
		await taskStore.batchUpdate({
			task_ids: ids,
			due: dateVal,
		});
		customPostponeDate.value = "";
	} catch (err) {
		console.error("Failed to set custom date for tasks:", err);
	} finally {
		isBatchOperating.value = false;
		closeDropdowns();
	}
}

async function handleBatchSetPriority(priority: Priority | null) {
	const ids = Array.from(taskStore.selectedTaskIds);
	if (!ids.length) return;
	isBatchOperating.value = true;
	try {
		await taskStore.batchUpdate({
			task_ids: ids,
			priority,
		});
	} catch (err) {
		console.error("Failed to batch set priority:", err);
	} finally {
		isBatchOperating.value = false;
		closeDropdowns();
	}
}

async function handleBatchMoveToList(listId: string) {
	const ids = Array.from(taskStore.selectedTaskIds);
	if (!ids.length) return;
	isBatchOperating.value = true;
	try {
		await taskStore.batchUpdate({
			task_ids: ids,
			list_id: listId,
		});
		taskStore.clearSelection();
	} catch (err) {
		console.error("Failed to batch move tasks to list:", err);
	} finally {
		isBatchOperating.value = false;
		closeDropdowns();
	}
}

async function handleBatchAssignTag(tagName: string) {
	const trimmed = tagName.trim();
	const ids = Array.from(taskStore.selectedTaskIds);
	if (!ids.length || !trimmed) return;
	isBatchOperating.value = true;
	try {
		const existingTag = tagStore.tags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
		const tag = existingTag ?? (await tagStore.createTag(trimmed));
		await batchAssignTag(ids, tag.id);
		await tagStore.fetchTags();
		await taskStore.fetchAllTasks();
		customNewTagName.value = "";
	} catch (err) {
		console.error("Failed to assign tag to tasks:", err);
	} finally {
		isBatchOperating.value = false;
		closeDropdowns();
	}
}

async function handleBatchRemoveTag(tagName: string) {
	const ids = Array.from(taskStore.selectedTaskIds);
	if (!ids.length || !tagName.trim()) return;
	isBatchOperating.value = true;
	try {
		await batchRemoveTag(ids, tagName.trim());
		await tagStore.fetchTags();
		await taskStore.fetchAllTasks();
	} catch (err) {
		console.error("Failed to remove tag from tasks:", err);
	} finally {
		isBatchOperating.value = false;
		closeDropdowns();
	}
}

async function handleBatchDelete() {
	const ids = Array.from(taskStore.selectedTaskIds);
	if (!ids.length) return;

	isBatchOperating.value = true;
	try {
		await taskStore.batchDelete(ids);
		taskStore.clearSelection();
	} catch (err) {
		console.error("Failed to delete selected tasks:", err);
	} finally {
		isBatchOperating.value = false;
		closeDropdowns();
	}
}
</script>

<template>
	<div
		class="px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/90 flex flex-wrap items-center justify-between gap-2 text-xs"
	>
		<div class="flex items-center gap-1.5 flex-wrap">
			<!-- Multi-select checkbox dropdown (Select All / None / Invert) -->
			<div
				class="relative inline-flex items-stretch rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
				data-dropdown-container
			>
				<button
					type="button"
					@click="toggleSelectAll"
					class="flex items-center justify-center px-1.5 py-1 rounded-l hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
					:title="allVisibleSelected ? 'Deselect all' : 'Select all'"
				>
					<CheckSquare v-if="allVisibleSelected" class="w-3.5 h-3.5 text-emerald-600" />
					<MinusSquare v-else-if="someVisibleSelected" class="w-3.5 h-3.5 text-emerald-600" />
					<Square v-else class="w-3.5 h-3.5 text-zinc-400" />
				</button>
				<button
					type="button"
					@click="toggleDropdown('select')"
					class="flex items-center justify-center px-1 py-1 border-l border-zinc-200 dark:border-zinc-700 rounded-r hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
					title="Selection menu"
				>
					<ChevronDown class="w-3 h-3 opacity-60" />
				</button>

				<!-- Dropdown menu -->
				<div
					v-if="activeDropdown === 'select'"
					class="absolute left-0 top-full mt-1 w-36 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg z-30 space-y-0.5"
				>
					<button
						type="button"
						@click="selectAll"
						class="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 cursor-pointer"
					>
						Select All
					</button>
					<button
						type="button"
						@click="selectNone"
						class="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 cursor-pointer"
					>
						Select None
					</button>
					<button
						type="button"
						@click="selectInvert"
						class="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 cursor-pointer"
					>
						Invert Selection
					</button>
				</div>
			</div>

			<!-- Selected count label -->
			<span
				v-if="taskStore.selectedTaskIds.size > 0"
				class="text-zinc-500 dark:text-zinc-400 font-medium px-1"
			>
				{{ taskStore.selectedTaskIds.size }} selected
			</span>

			<!-- Action buttons (active only when >= 1 task selected) -->
			<template v-if="taskStore.selectedTaskIds.size > 0">
				<!-- Mark Completed (✓) -->
				<button
					type="button"
					@click="handleBatchComplete"
					:disabled="isBatchOperating"
					class="flex items-center gap-1 px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors cursor-pointer disabled:opacity-50"
					title="Mark selected completed"
				>
					<Check class="w-3.5 h-3.5" />
					<span>Complete</span>
				</button>

				<!-- Postpone Menu (📅 ▾) -->
				<div class="relative" data-dropdown-container>
					<button
						type="button"
						@click="toggleDropdown('postpone')"
						:disabled="isBatchOperating"
						class="flex items-center gap-1 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer disabled:opacity-50"
						title="Postpone due date"
					>
						<CalendarPlus class="w-3.5 h-3.5 text-blue-500" />
						<span>Postpone</span>
						<ChevronDown class="w-3 h-3 opacity-60" />
					</button>

					<div
						v-if="activeDropdown === 'postpone'"
						class="absolute left-0 top-full mt-1 w-44 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg z-30 text-xs space-y-1"
					>
						<button
							type="button"
							@click="handleBatchPostpone(1)"
							class="w-full text-left px-3 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 cursor-pointer"
						>
							+1 Day (Tomorrow)
						</button>
						<button
							type="button"
							@click="handleBatchPostpone(2)"
							class="w-full text-left px-3 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 cursor-pointer"
						>
							+2 Days
						</button>
						<button
							type="button"
							@click="handleBatchPostpone(7)"
							class="w-full text-left px-3 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 cursor-pointer"
						>
							+1 Week
						</button>
						<div class="border-t border-zinc-100 dark:border-zinc-800 pt-1 px-3">
							<label class="block text-[10px] text-zinc-400 mb-0.5">Custom Date</label>
							<div class="flex items-center gap-1">
								<input
									type="date"
									v-model="customPostponeDate"
									class="w-full px-1.5 py-0.5 border border-zinc-200 dark:border-zinc-700 rounded text-xs bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200"
								/>
								<button
									type="button"
									@click="handleBatchCustomDate"
									:disabled="!customPostponeDate"
									class="px-1.5 py-0.5 bg-emerald-600 text-white rounded text-[10px] cursor-pointer disabled:opacity-40"
								>
									Set
								</button>
							</div>
						</div>
					</div>
				</div>

				<!-- Set Priority Menu (! ▾) -->
				<div class="relative" data-dropdown-container>
					<button
						type="button"
						@click="toggleDropdown('priority')"
						:disabled="isBatchOperating"
						class="flex items-center gap-1 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer disabled:opacity-50"
						title="Set priority"
					>
						<AlertCircle class="w-3.5 h-3.5 text-amber-500" />
						<span>Priority</span>
						<ChevronDown class="w-3 h-3 opacity-60" />
					</button>

					<div
						v-if="activeDropdown === 'priority'"
						class="absolute left-0 top-full mt-1 w-36 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg z-30 text-xs space-y-0.5"
					>
						<button
							type="button"
							@click="handleBatchSetPriority(PRIORITY.HIGH)"
							class="w-full flex items-center justify-between px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-red-600 dark:text-red-400 font-medium cursor-pointer"
						>
							<span>Priority 1</span>
							<span class="text-[10px] px-1 rounded bg-red-100 dark:bg-red-950">P1</span>
						</button>
						<button
							type="button"
							@click="handleBatchSetPriority(PRIORITY.MEDIUM)"
							class="w-full flex items-center justify-between px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-amber-600 dark:text-amber-400 font-medium cursor-pointer"
						>
							<span>Priority 2</span>
							<span class="text-[10px] px-1 rounded bg-amber-100 dark:bg-amber-950">P2</span>
						</button>
						<button
							type="button"
							@click="handleBatchSetPriority(PRIORITY.LOW)"
							class="w-full flex items-center justify-between px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-blue-600 dark:text-blue-400 font-medium cursor-pointer"
						>
							<span>Priority 3</span>
							<span class="text-[10px] px-1 rounded bg-blue-100 dark:bg-blue-950">P3</span>
						</button>
						<div class="border-t border-zinc-100 dark:border-zinc-800 my-1"></div>
						<button
							type="button"
							@click="handleBatchSetPriority(null)"
							class="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 cursor-pointer"
						>
							None
						</button>
					</div>
				</div>

				<!-- Move to List (📋 ▾) -->
				<div class="relative" data-dropdown-container>
					<button
						type="button"
						@click="toggleDropdown('list')"
						:disabled="isBatchOperating"
						class="flex items-center gap-1 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer disabled:opacity-50"
						title="Move to list"
					>
						<FolderInput class="w-3.5 h-3.5 text-indigo-500" />
						<span>List</span>
						<ChevronDown class="w-3 h-3 opacity-60" />
					</button>

					<div
						v-if="activeDropdown === 'list'"
						class="absolute left-0 top-full mt-1 w-44 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg z-30 text-xs max-h-48 overflow-y-auto space-y-0.5"
					>
						<button
							v-for="list in listStore.lists"
							:key="list.id"
							type="button"
							@click="handleBatchMoveToList(list.id)"
							class="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 text-left cursor-pointer"
						>
							<component
								:is="getListIcon(list.icon)"
								class="w-3.5 h-3.5 shrink-0"
								:class="list.color ? '' : 'text-zinc-500 dark:text-zinc-400'"
								:style="list.color ? { color: list.color } : {}"
							/>
							<span class="truncate">{{ list.name }}</span>
						</button>
					</div>
				</div>

				<!-- Add/Remove Tags (🏷 ▾) -->
				<div class="relative" data-dropdown-container>
					<button
						type="button"
						@click="toggleDropdown('tag')"
						:disabled="isBatchOperating"
						class="flex items-center gap-1 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer disabled:opacity-50"
						title="Tags"
					>
						<Tags class="w-3.5 h-3.5 text-purple-500" />
						<span>Tags</span>
						<ChevronDown class="w-3 h-3 opacity-60" />
					</button>

					<div
						v-if="activeDropdown === 'tag'"
						class="absolute left-0 top-full mt-1 w-52 p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg z-30 text-xs space-y-2"
					>
						<div class="flex items-center gap-1">
							<input
								type="text"
								v-model="customNewTagName"
								placeholder="Tag name..."
								@keyup.enter="handleBatchAssignTag(customNewTagName)"
								class="w-full px-2 py-1 border border-zinc-200 dark:border-zinc-700 rounded text-xs bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200"
							/>
							<button
								type="button"
								@click="handleBatchAssignTag(customNewTagName)"
								:disabled="!customNewTagName.trim()"
								class="px-2 py-1 bg-emerald-600 text-white rounded text-xs cursor-pointer disabled:opacity-40"
							>
								Add
							</button>
						</div>

						<div
							v-if="tagStore.tagsWithCounts.length > 0"
							class="border-t border-zinc-100 dark:border-zinc-800 pt-1.5 max-h-36 overflow-y-auto space-y-1"
						>
							<div class="text-[10px] uppercase font-semibold text-zinc-400">Existing tags</div>
							<div
								v-for="tag in tagStore.tagsWithCounts"
								:key="tag.id"
								class="flex items-center justify-between gap-1 px-1.5 py-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
							>
								<span class="truncate text-zinc-700 dark:text-zinc-300">
									{{ formatTagLabel(tag.name) }}
								</span>
								<div class="flex items-center gap-1 shrink-0">
									<button
										type="button"
										@click="handleBatchAssignTag(tag.name)"
										class="px-1.5 py-0.2 rounded bg-emerald-50 dark:bg-emerald-950 text-emerald-600 text-[10px] hover:bg-emerald-100 cursor-pointer"
									>
										+
									</button>
									<button
										type="button"
										@click="handleBatchRemoveTag(tag.name)"
										class="px-1.5 py-0.2 rounded bg-rose-50 dark:bg-rose-950 text-rose-600 text-[10px] hover:bg-rose-100 cursor-pointer"
									>
										-
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Delete / Move to Trash -->
				<button
					type="button"
					@click="handleBatchDelete"
					:disabled="isBatchOperating"
					class="flex items-center gap-1 px-2 py-1 rounded border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors cursor-pointer disabled:opacity-50"
					title="Delete selected tasks"
				>
					<Trash2 class="w-3.5 h-3.5" />
					<span>Delete</span>
				</button>
			</template>
		</div>
	</div>
</template>
