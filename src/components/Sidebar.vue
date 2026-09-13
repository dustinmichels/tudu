<script setup lang="ts">
import {
	AlertCircle,
	Bike,
	Calendar,
	CalendarRange,
	CheckCircle2,
	CheckSquare,
	ChevronDown,
	ChevronRight,
	Edit2,
	Inbox,
	Plus,
	Sunrise,
	Tag as TagIcon,
	Trash2,
	X,
	Zap,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import { useFilterStore } from "../stores/filters.ts";
import { type DefaultView, useListStore } from "../stores/lists.ts";
import { useTagStore } from "../stores/tags.ts";
import { useTaskStore } from "../stores/tasks.ts";
import { useUIStore } from "../stores/ui.ts";
import { DEFAULT_LIST_ICON, getListIcon } from "../utils/icons.ts";
import IconPickerPopover from "./IconPickerPopover.vue";

const listStore = useListStore();
const taskStore = useTaskStore();
const filterStore = useFilterStore();
const tagStore = useTagStore();
const uiStore = useUIStore();

// Inline list creation state
const newListName = ref("");
const newListIcon = ref(DEFAULT_LIST_ICON);
const isCreating = ref(false);

// Icon picker popover state
const isIconPickerOpen = ref(false);
const iconPickerTargetRect = ref<DOMRect | null>(null);
const iconPickerTargetListId = ref<string | null>(null);
const isNewListIconPicker = ref(false);
const iconPickerTitle = ref("Choose List Icon");

// Inline list renaming state
const editingListId = ref<string | null>(null);
const editingListName = ref("");

// Collapsible sections state
const isSmartViewsCollapsed = ref(false);
const isListsCollapsed = ref(false);
const isTagsCollapsed = ref(false);

// Smart Views items configuration
const smartViews = computed(() => [
	{
		id: "inbox" as DefaultView,
		name: "Inbox",
		icon: Inbox,
		iconColor: "text-blue-500",
		count: taskStore.countInbox,
	},
	{
		id: "all" as DefaultView,
		name: "All Tasks",
		icon: CheckSquare,
		iconColor: "text-indigo-500",
		count: taskStore.countAll,
	},
	{
		id: "today" as DefaultView,
		name: "Today",
		icon: Calendar,
		iconColor: "text-emerald-500",
		count: taskStore.countToday,
	},
	{
		id: "tomorrow" as DefaultView,
		name: "Tomorrow",
		icon: Sunrise,
		iconColor: "text-amber-500",
		count: taskStore.countTomorrow,
	},
	{
		id: "this_week" as DefaultView,
		name: "This Week",
		icon: CalendarRange,
		iconColor: "text-purple-500",
		count: taskStore.countThisWeek,
	},
	{
		id: "overdue" as DefaultView,
		name: "Overdue",
		icon: AlertCircle,
		iconColor: "text-red-500",
		count: taskStore.countOverdue,
	},
	{
		id: "trash" as DefaultView,
		name: "Trash",
		icon: Trash2,
		iconColor: "text-rose-500",
		count: taskStore.countTrash,
	},
]);

function handleCloseMobileSidebar() {
	if (uiStore.isSidebarOpen) {
		uiStore.toggleSidebar(false);
	}
}

function handleSelectSmartView(view: DefaultView) {
	filterStore.setTagFilter(null);
	listStore.setActiveView(view);
	taskStore.setActiveTask(null);
	handleCloseMobileSidebar();
}

function handleSelectList(id: string) {
	filterStore.setTagFilter(null);
	listStore.setActiveList(id);
	taskStore.setActiveTask(null);
	handleCloseMobileSidebar();
}

function handleSelectTag(tagName: string) {
	listStore.setActiveView(null);
	listStore.setActiveList(null);
	filterStore.setTagFilter(tagName);
	taskStore.setActiveTask(null);
	handleCloseMobileSidebar();
}
function openListIconPicker(event: MouseEvent, list: { id: string; icon?: string | null }) {
	event.stopPropagation();
	const el = event.currentTarget as HTMLElement;
	iconPickerTargetRect.value = el.getBoundingClientRect();
	iconPickerTargetListId.value = list.id;
	isNewListIconPicker.value = false;
	iconPickerTitle.value = "Choose List Icon";
	isIconPickerOpen.value = true;
}

function openNewListIconPicker(event: MouseEvent) {
	event.stopPropagation();
	const el = event.currentTarget as HTMLElement;
	iconPickerTargetRect.value = el.getBoundingClientRect();
	iconPickerTargetListId.value = null;
	isNewListIconPicker.value = true;
	iconPickerTitle.value = "Choose List Icon";
	isIconPickerOpen.value = true;
}

async function handleIconSelected(iconName: string) {
	if (isNewListIconPicker.value) {
		newListIcon.value = iconName;
	} else if (iconPickerTargetListId.value) {
		try {
			await listStore.updateList({ id: iconPickerTargetListId.value, icon: iconName });
		} catch (err) {
			console.error("Failed to update list icon:", err);
		}
	}
}

async function handleCreateList() {
	const name = newListName.value.trim();
	if (!name) return;

	try {
		isCreating.value = true;
		await listStore.createList(name, null, newListIcon.value);
		newListName.value = "";
		newListIcon.value = DEFAULT_LIST_ICON;
		filterStore.setTagFilter(null);
		taskStore.setActiveTask(null);
	} catch (err) {
		console.error("Failed to create list:", err);
	} finally {
		isCreating.value = false;
	}
}

function startRenameList(event: MouseEvent, list: { id: string; name: string }) {
	event.stopPropagation();
	editingListId.value = list.id;
	editingListName.value = list.name;
}

async function saveRenameList(id: string) {
	const name = editingListName.value.trim();
	if (!name) {
		editingListId.value = null;
		return;
	}

	try {
		await listStore.updateList({ id, name });
	} catch (err) {
		console.error("Failed to rename list:", err);
	} finally {
		editingListId.value = null;
	}
}

function cancelRenameList() {
	editingListId.value = null;
}

async function handleDeleteList(event: MouseEvent, id: string) {
	event.stopPropagation();
	const confirmDelete = window.confirm("Are you sure you want to delete this list?");
	if (!confirmDelete) return;

	try {
		await listStore.deleteList(id);
	} catch (err) {
		console.error("Failed to delete list:", err);
	}
}
</script>

<template>
	<aside
		class="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 select-none overflow-hidden"
	>
		<!-- Header -->
		<div
			class="p-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between"
		>
			<div class="flex items-center gap-2 font-bold text-lg tracking-tight">
				<CheckCircle2 class="w-5 h-5 text-emerald-500 shrink-0" />
				<span>TuDu</span>
			</div>

			<!-- Close button on mobile drawer -->
			<button
				type="button"
				@click="uiStore.toggleSidebar(false)"
				class="md:hidden p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
				title="Close sidebar"
				aria-label="Close sidebar"
			>
				<X class="w-4 h-4" />
			</button>
		</div>

		<!-- Scrollable Navigation Sections -->
		<div class="flex-1 overflow-y-auto p-2 space-y-4 text-sm">
			<!-- Quick Add -->
			<button
				type="button"
				@click="uiStore.toggleCapture(true)"
				class="w-full flex items-center justify-between gap-2.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer text-left text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
			>
				<div class="flex items-center gap-2.5">
					<Zap class="w-4 h-4 shrink-0 text-emerald-500" />
					<span>Quick Add</span>
				</div>
				<kbd class="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 shrink-0">⌘N</kbd>
			</button>

			<!-- 1. Smart Views Section -->
			<div>
				<button
					type="button"
					@click="isSmartViewsCollapsed = !isSmartViewsCollapsed"
					class="w-full flex items-center justify-between px-2 py-1 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-pointer"
				>
					<span>Views</span>
					<component :is="isSmartViewsCollapsed ? ChevronRight : ChevronDown" class="w-3.5 h-3.5" />
				</button>

				<div v-show="!isSmartViewsCollapsed" class="mt-1 space-y-0.5">
					<button
						v-for="view in smartViews"
						:key="view.id"
						type="button"
						@click="handleSelectSmartView(view.id)"
						:title="view.name"
						class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer text-left"
						:class="[
							listStore.activeView === view.id && !filterStore.selectedTag
								? 'bg-emerald-100/70 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200'
								: 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900',
						]"
					>
						<div class="flex items-center gap-2.5 min-w-0">
							<component :is="view.icon" class="w-4 h-4 shrink-0" :class="view.iconColor" />
							<span class="truncate">{{ view.name }}</span>
						</div>

						<div class="flex items-center gap-1.5 shrink-0">
							<!-- Incomplete task badge -->
							<span
								v-if="view.count > 0"
								class="text-xs font-semibold px-1.5 py-0.2 rounded-full"
								:class="[
									listStore.activeView === view.id && !filterStore.selectedTag
										? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100'
										: 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400',
								]"
							>
								{{ view.count }}
							</span>
						</div>
					</button>
				</div>
			</div>

			<!-- 2. Custom Lists Section -->
			<div>
				<button
					type="button"
					@click="isListsCollapsed = !isListsCollapsed"
					class="w-full flex items-center justify-between px-2 py-1 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-pointer"
				>
					<span>Lists</span>
					<component :is="isListsCollapsed ? ChevronRight : ChevronDown" class="w-3.5 h-3.5" />
				</button>

				<div v-show="!isListsCollapsed" class="mt-1 space-y-0.5">
					<div
						v-for="list in listStore.customLists"
						:key="list.id"
						@click="handleSelectList(list.id)"
						class="group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
						:class="[
							listStore.activeListId === list.id &&
							!listStore.activeView &&
							!filterStore.selectedTag
								? 'bg-emerald-100/70 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200'
								: 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900',
						]"
					>
						<!-- Normal display or inline rename input -->
						<div class="flex items-center gap-2 min-w-0 flex-1">
							<button
								type="button"
								@click="openListIconPicker($event, list)"
								class="p-0.5 -ml-0.5 rounded-md hover:bg-zinc-200/80 dark:hover:bg-zinc-800 transition-colors shrink-0 cursor-pointer"
								title="Change icon"
								aria-label="Change icon"
							>
								<component
									:is="getListIcon(list.icon)"
									class="w-4 h-4 shrink-0 transition-transform group-hover:scale-105"
									:class="[
										list.color
											? ''
											: listStore.activeListId === list.id &&
												  !listStore.activeView &&
												  !filterStore.selectedTag
												? 'text-emerald-600 dark:text-emerald-400'
												: 'text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-300',
									]"
									:style="list.color ? { color: list.color } : {}"
								/>
							</button>

							<input
								v-if="editingListId === list.id"
								v-model="editingListName"
								type="text"
								@click.stop
								@keyup.enter="saveRenameList(list.id)"
								@keyup.esc="cancelRenameList"
								@blur="saveRenameList(list.id)"
								class="w-full px-1 py-0.5 text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200"
								autoFocus
							/>
							<span v-else class="truncate">{{ list.name }}</span>
						</div>

						<!-- Overdue badge, task count & list actions -->
						<div class="flex items-center gap-1 shrink-0">
							<!-- Overdue badge -->
							<span
								v-if="taskStore.getListOverdueCount(list.id) > 0"
								class="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60"
								:title="`${taskStore.getListOverdueCount(list.id)} overdue tasks`"
							>
								<AlertCircle class="w-2.5 h-2.5" />
								<span>{{ taskStore.getListOverdueCount(list.id) }}</span>
							</span>

							<!-- Incomplete task count -->
							<span
								v-if="taskStore.getListCount(list.id) > 0"
								class="text-xs font-semibold px-1.5 py-0.2 rounded-full"
								:class="[
									listStore.activeListId === list.id &&
									!listStore.activeView &&
									!filterStore.selectedTag
										? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100'
										: 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400',
								]"
							>
								{{ taskStore.getListCount(list.id) }}
							</span>

							<!-- Hover action buttons: Rename & Delete -->
							<button
								type="button"
								@click="startRenameList($event, list)"
								class="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-opacity cursor-pointer"
								title="Rename list"
								aria-label="Rename list"
							>
								<Edit2 class="w-3 h-3" />
							</button>

							<button
								type="button"
								@click="handleDeleteList($event, list.id)"
								class="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-rose-500 transition-opacity cursor-pointer"
								title="Delete list"
								aria-label="Delete list"
							>
								<Trash2 class="w-3 h-3" />
							</button>
						</div>
					</div>

					<!-- Inline Create List Input -->
					<form @submit.prevent="handleCreateList" class="mt-2 px-1">
						<div class="relative flex items-center">
							<button
								type="button"
								@click="openNewListIconPicker($event)"
								class="absolute left-1.5 p-1 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
								title="Choose icon"
								aria-label="Choose icon"
							>
								<component :is="getListIcon(newListIcon)" />
							</button>
							<input
								v-model="newListName"
								type="text"
								placeholder="New list..."
								:disabled="isCreating"
								class="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
							/>
							<button
								type="submit"
								:disabled="isCreating || !newListName.trim()"
								class="absolute right-1.5 p-0.5 text-zinc-400 hover:text-emerald-600 disabled:opacity-30 cursor-pointer"
								title="Add list"
								aria-label="Add list"
							>
								<Plus class="w-3.5 h-3.5" />
							</button>
						</div>
					</form>
				</div>
			</div>

			<!-- 3. Tags Section -->
			<div>
				<button
					type="button"
					@click="isTagsCollapsed = !isTagsCollapsed"
					class="w-full flex items-center justify-between px-2 py-1 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-pointer"
				>
					<span>Tags</span>
					<component :is="isTagsCollapsed ? ChevronRight : ChevronDown" class="w-3.5 h-3.5" />
				</button>

				<div v-show="!isTagsCollapsed" class="mt-1 space-y-0.5">
					<div
						v-if="tagStore.tagsWithCounts.length === 0"
						class="px-2 py-3 text-center text-xs text-zinc-400"
					>
						<TagIcon class="w-5 h-5 mx-auto mb-1 opacity-40" />
						<p>No tags yet.</p>
					</div>

					<div
						v-for="tag in tagStore.tagsWithCounts"
						:key="tag.id"
						@click="handleSelectTag(tag.name)"
						class="group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-colors"
						:class="[
							filterStore.selectedTag === tag.name
								? 'bg-emerald-100/70 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200'
								: 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900',
						]"
					>
						<div class="flex items-center gap-2 min-w-0">
							<TagIcon class="w-3.5 h-3.5 text-emerald-500 shrink-0" />
							<span class="truncate">#{{ tag.name }}</span>
						</div>

						<!-- Incomplete task count for this tag -->
						<span
							v-if="tag.taskCount > 0"
							class="text-xs font-semibold px-1.5 py-0.2 rounded-full"
							:class="[
								filterStore.selectedTag === tag.name
									? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100'
									: 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400',
							]"
						>
							{{ tag.taskCount }}
						</span>
					</div>
				</div>
			</div>
		</div>

		<!-- Bottom Attribution -->
		<div
			class="px-3.5 py-2.5 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5"
		>
			<Bike class="w-3.5 h-3.5 shrink-0" />
			<span>by Dustin Michels</span>
		</div>

		<!-- Icon Picker Popover -->
		<IconPickerPopover
			:is-open="isIconPickerOpen"
			:selected-icon="
				isNewListIconPicker
					? newListIcon
					: (listStore.customLists.find((l) => l.id === iconPickerTargetListId)?.icon ??
						DEFAULT_LIST_ICON)
			"
			:target-rect="iconPickerTargetRect"
			:title="iconPickerTitle"
			@select="handleIconSelected"
			@close="isIconPickerOpen = false"
		/>
	</aside>
</template>
