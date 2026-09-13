<script setup lang="ts">
import {
	AlertCircle,
	ArrowDown,
	ArrowUp,
	Calendar,
	CalendarRange,
	Check,
	CheckSquare,
	Copy,
	Inbox,
	ListFilter,
	ListTree,
	Menu,
	PanelRight,
	PanelRightClose,
	Sunrise,
	Tag as TagIcon,
	Trash2,
} from "lucide-vue-next";
import { computed, onUnmounted, ref } from "vue";
import type { Task } from "../../models/index.ts";
import { useFilterStore } from "../../stores/filters.ts";
import { useListStore } from "../../stores/lists.ts";
import { useTaskStore } from "../../stores/tasks.ts";
import { useUIStore } from "../../stores/ui.ts";
import { DEFAULT_LIST_ICON, getListIcon } from "../../utils/icons.ts";
import { copyToClipboard, formatTasksAsMarkdown } from "../../utils/markdown.ts";
import type { SortOrder } from "../../utils/sorting.ts";
import IconPickerPopover from "../IconPickerPopover.vue";

export type SortFieldOption = "created_at" | "priority" | "due" | "list" | "tags";

const props = defineProps<{
	activeSortField: SortFieldOption | null;
	activeSortOrder: SortOrder;
	visibleTasks?: Task[];
}>();

const emit = defineEmits<{
	(e: "changeSort", field: SortFieldOption): void;
}>();

const listStore = useListStore();
const taskStore = useTaskStore();
const filterStore = useFilterStore();
const uiStore = useUIStore();

const activeList = computed(() => listStore.activeList);
const hasActiveSelection = computed(
	() => !!listStore.activeList || !!listStore.activeView || !!filterStore.selectedTag,
);

const viewTitle = computed(() => {
	if (filterStore.selectedTag) return `#${filterStore.selectedTag}`;
	if (listStore.activeView === "inbox") return "Inbox";
	if (listStore.activeView === "all") return "All Tasks";
	if (listStore.activeView === "today") return "Today";
	if (listStore.activeView === "tomorrow") return "Tomorrow";
	if (listStore.activeView === "this_week") return "This Week";
	if (listStore.activeView === "overdue") return "Overdue";
	if (listStore.activeView === "trash") return "Trash";
	return null;
});

const headerTitle = computed(() => {
	if (viewTitle.value) return viewTitle.value;
	return activeList.value ? activeList.value.name : "No Selection";
});

// List icon picker state for active list header
const isHeaderIconPickerOpen = ref(false);
const headerIconPickerTargetRect = ref<DOMRect | null>(null);

function openIconPickerForActiveList(event: MouseEvent) {
	event.stopPropagation();
	const el = event.currentTarget as HTMLElement;
	headerIconPickerTargetRect.value = el.getBoundingClientRect();
	isHeaderIconPickerOpen.value = true;
}

async function handleHeaderIconSelected(iconName: string) {
	if (activeList.value) {
		try {
			await listStore.updateList({ id: activeList.value.id, icon: iconName });
		} catch (err) {
			console.error("Failed to update list icon from header:", err);
		}
	}
}
const copied = ref(false);
let copyTimeout: ReturnType<typeof setTimeout> | null = null;

async function handleCopyList() {
	const tasksToCopy = props.visibleTasks ?? taskStore.rootTasks ?? taskStore.tasks;
	const markdown = formatTasksAsMarkdown(tasksToCopy, listStore.sortedLists, {
		allTasks: taskStore.allTasks,
		includeCompleted: taskStore.includeCompleted,
	});
	const success = await copyToClipboard(markdown);
	if (success) {
		copied.value = true;
		if (copyTimeout) clearTimeout(copyTimeout);
		copyTimeout = setTimeout(() => {
			copied.value = false;
		}, 2000);
	}
}

onUnmounted(() => {
	if (copyTimeout) clearTimeout(copyTimeout);
});
</script>

<template>
	<!-- Header -->
	<div
		class="p-3 sm:p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2"
	>
		<div class="flex items-center gap-2.5 min-w-0">
			<!-- Mobile Drawer Toggle Hamburger -->
			<button
				type="button"
				@click="uiStore.toggleSidebar()"
				class="md:hidden p-1.5 -ml-1 rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
				title="Toggle Navigation Sidebar"
			>
				<Menu class="w-5 h-5" />
			</button>

			<div class="min-w-0">
				<h2 class="text-lg sm:text-xl font-bold truncate flex items-center gap-2">
					<!-- Tag Icon or View or List Icon -->
					<TagIcon v-if="filterStore.selectedTag" class="w-5 h-5 text-emerald-500 shrink-0" />
					<Inbox
						v-else-if="
							(activeList && activeList.name.toLowerCase() === 'inbox') ||
							listStore.activeView === 'inbox'
						"
						class="w-5 h-5 text-blue-500 shrink-0"
					/>
					<CheckSquare
						v-else-if="listStore.activeView === 'all'"
						class="w-5 h-5 text-indigo-500 shrink-0"
					/>
					<Calendar
						v-else-if="listStore.activeView === 'today'"
						class="w-5 h-5 text-emerald-500 shrink-0"
					/>
					<Sunrise
						v-else-if="listStore.activeView === 'tomorrow'"
						class="w-5 h-5 text-amber-500 shrink-0"
					/>
					<CalendarRange
						v-else-if="listStore.activeView === 'this_week'"
						class="w-5 h-5 text-purple-500 shrink-0"
					/>
					<AlertCircle
						v-else-if="listStore.activeView === 'overdue'"
						class="w-5 h-5 text-red-500 shrink-0"
					/>
					<Trash2
						v-else-if="listStore.activeView === 'trash'"
						class="w-5 h-5 text-rose-500 shrink-0"
					/>
					<button
						v-else-if="activeList"
						type="button"
						@click="openIconPickerForActiveList($event)"
						class="p-1 -ml-1 rounded-md hover:bg-zinc-200/70 dark:hover:bg-zinc-800 transition-colors shrink-0 cursor-pointer"
						title="Change list icon"
					>
						<component
							:is="getListIcon(activeList.icon)"
							class="w-5 h-5 shrink-0"
							:class="activeList.color ? '' : 'text-emerald-500'"
							:style="activeList.color ? { color: activeList.color } : {}"
						/>
					</button>

					<span>{{ headerTitle }}</span>
				</h2>
				<p v-if="hasActiveSelection" class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
					{{ taskStore.incompleteTasks.length }} pending,
					{{ taskStore.completedTasks.length }} completed
				</p>
			</div>
		</div>

		<!-- Right actions: Completed filter toggle, Subtasks toggle, Detail panel toggle -->
		<div class="flex items-center gap-1.5 shrink-0">
			<!-- Copy list to clipboard as Markdown -->
			<button
				v-if="hasActiveSelection"
				type="button"
				@click="handleCopyList"
				:class="[
					'flex items-center gap-1 text-xs px-2 sm:px-2.5 py-1 rounded-md border transition-colors cursor-pointer',
					copied
						? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-medium'
						: 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300',
				]"
				:title="copied ? 'Copied list to clipboard!' : 'Copy list as Markdown'"
				data-copy-list-button
			>
				<Check v-if="copied" class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
				<Copy v-else class="w-3.5 h-3.5" />
				<span class="hidden sm:inline">{{ copied ? "Copied!" : "Copy" }}</span>
			</button>

			<button
				v-if="hasActiveSelection"
				type="button"
				@click="
					() => {
						const next = !taskStore.includeCompleted;
						taskStore.setIncludeCompleted(next);
						filterStore.setIncludeCompleted(next);
					}
				"
				class="flex items-center gap-1 text-xs px-2 sm:px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-600 dark:text-zinc-300 cursor-pointer"
				:title="
					taskStore.includeCompleted ? 'Hide completed tasks (⌘H)' : 'Show completed tasks (⌘H)'
				"
			>
				<ListFilter class="w-3.5 h-3.5" />
				<span class="hidden sm:inline">{{
					taskStore.includeCompleted ? "Showing all" : "Active only"
				}}</span>
			</button>

			<!-- Subtasks Display Toggle -->
			<button
				v-if="hasActiveSelection"
				type="button"
				@click="uiStore.toggleSubtasksInline()"
				:class="[
					'flex items-center gap-1 text-xs px-2 sm:px-2.5 py-1 rounded-md border transition-colors cursor-pointer',
					uiStore.showSubtasksInline
						? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-medium'
						: 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300',
				]"
				:title="
					uiStore.showSubtasksInline
						? 'Hide indented subtasks (show in detail view only) (⌘U)'
						: 'Expand subtasks indented under tasks in main view (⌘U)'
				"
				data-toggle-subtasks-button
			>
				<ListTree class="w-3.5 h-3.5" />
				<span class="hidden sm:inline">{{
					uiStore.showSubtasksInline ? "Subtasks: Expanded" : "Subtasks: Hidden"
				}}</span>
			</button>

			<!-- Toggle Right Detail Pane -->
			<button
				type="button"
				@click="uiStore.toggleDetail()"
				:title="uiStore.isDetailOpen ? 'Collapse task details' : 'Expand task details'"
				class="p-1 sm:p-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer"
			>
				<PanelRightClose v-if="uiStore.isDetailOpen" class="w-4 h-4" />
				<PanelRight v-else class="w-4 h-4" />
			</button>
		</div>
	</div>

	<!-- Sort Controls Toolbar -->
	<div
		v-if="hasActiveSelection"
		class="px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2 text-xs overflow-x-auto"
	>
		<span class="shrink-0 text-zinc-400 dark:text-zinc-500 font-medium select-none">Sort:</span>
		<div class="flex items-center gap-1 flex-wrap">
			<button
				v-for="opt in [
					{ field: 'created_at', label: 'Created' },
					{ field: 'priority', label: 'Priority' },
					{ field: 'due', label: 'Due Date' },
					{ field: 'list', label: 'List', listOnly: true },
					{ field: 'tags', label: 'Tags' },
				] as { field: SortFieldOption; label: string; listOnly?: boolean }[]"
				:key="opt.field"
				v-show="!opt.listOnly || !listStore.activeListId"
				type="button"
				@click="emit('changeSort', opt.field)"
				:class="[
					'flex items-center gap-0.5 px-2 py-0.5 rounded-full border transition-colors cursor-pointer select-none',
					activeSortField === opt.field
						? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/60 dark:text-indigo-300'
						: 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-200',
				]"
			>
				{{ opt.label }}
				<ArrowUp
					v-if="activeSortField === opt.field && activeSortOrder === 'asc'"
					class="w-3 h-3"
				/>
				<ArrowDown
					v-else-if="activeSortField === opt.field && activeSortOrder === 'desc'"
					class="w-3 h-3"
				/>
			</button>
		</div>
	</div>

	<!-- List Header Icon Picker Popover -->
	<IconPickerPopover
		:is-open="isHeaderIconPickerOpen"
		:selected-icon="activeList?.icon ?? DEFAULT_LIST_ICON"
		:target-rect="headerIconPickerTargetRect"
		title="Choose List Icon"
		@select="handleHeaderIconSelected"
		@close="isHeaderIconPickerOpen = false"
	/>
</template>
