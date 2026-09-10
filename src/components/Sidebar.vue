<script setup lang="ts">
import {
	AlertCircle,
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
} from "lucide-vue-next";
import { computed, ref } from "vue";
import { useFilterStore } from "../stores/filters.ts";
import { type DefaultView, useListStore } from "../stores/lists.ts";
import { useTagStore } from "../stores/tags.ts";
import { useTaskStore } from "../stores/tasks.ts";
import { useUIStore } from "../stores/ui.ts";

const listStore = useListStore();
const taskStore = useTaskStore();
const filterStore = useFilterStore();
const tagStore = useTagStore();
const uiStore = useUIStore();

// Inline list creation state
const newListName = ref("");
const isCreating = ref(false);

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
	filterStore.setListFilter(null);
	listStore.setActiveList(null);
	filterStore.setSmartView(view);
	listStore.setActiveView(view);
	taskStore.setActiveTask(null);
	handleCloseMobileSidebar();
}

function handleSelectList(id: string) {
	filterStore.setTagFilter(null);
	filterStore.setSmartView(null);
	listStore.setActiveView(null);
	filterStore.setListFilter(id);
	listStore.setActiveList(id);
	taskStore.setActiveTask(null);
	handleCloseMobileSidebar();
}

function handleSelectTag(tagName: string) {
	filterStore.setSmartView(null);
	filterStore.setListFilter(null);
	listStore.setActiveView(null);
	listStore.setActiveList(null);
	filterStore.setTagFilter(tagName);
	taskStore.setActiveTask(null);
	handleCloseMobileSidebar();
}
async function handleCreateList() {
	const name = newListName.value.trim();
	if (!name) return;

	try {
		isCreating.value = true;
		const created = await listStore.createList(name);
		newListName.value = "";
		filterStore.setTagFilter(null);
		filterStore.setSmartView(null);
		listStore.setActiveView(null);
		filterStore.setListFilter(created.id);
		listStore.setActiveList(created.id);
		taskStore.setActiveTask(null);
	} catch (err) {
		console.error("Failed to create list:", err);
	} finally {
		isCreating.value = false;
	}
}

function startRenameList(
	event: MouseEvent,
	list: { id: string; name: string },
) {
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
	const confirmDelete = window.confirm(
		"Are you sure you want to delete this list?",
	);
	if (!confirmDelete) return;

	try {
		await listStore.deleteList(id);
	} catch (err) {
		console.error("Failed to delete list:", err);
	}
}
</script>

<template>
  <aside class="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 select-none overflow-hidden">
    <!-- Header -->
    <div class="p-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
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
      >
        <X class="w-4 h-4" />
      </button>
    </div>

    <!-- Scrollable Navigation Sections -->
    <div class="flex-1 overflow-y-auto p-2 space-y-4 text-sm">
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
            class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer text-left"
            :class="[
              listStore.activeView === view.id && !filterStore.selectedTag
                ? 'bg-emerald-100/70 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200'
                : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900'
            ]"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <component :is="view.icon" class="w-4 h-4 shrink-0" :class="view.iconColor" />
              <span class="truncate">{{ view.name }}</span>
            </div>

            <!-- Incomplete task badge -->
            <span
              v-if="view.count > 0"
              class="text-xs font-semibold px-1.5 py-0.2 rounded-full"
              :class="[
                listStore.activeView === view.id && !filterStore.selectedTag
                  ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100'
                  : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
              ]"
            >
              {{ view.count }}
            </span>
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
              listStore.activeListId === list.id && !listStore.activeView && !filterStore.selectedTag
                ? 'bg-emerald-100/70 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200'
                : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900'
            ]"
          >
            <!-- Normal display or inline rename input -->
            <div class="flex items-center gap-2 min-w-0 flex-1">
              <span
                class="w-2.5 h-2.5 rounded-full shrink-0"
                :style="{ backgroundColor: list.color || '#10b981' }"
              />

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
                  listStore.activeListId === list.id && !listStore.activeView && !filterStore.selectedTag
                    ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100'
                    : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
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
              >
                <Edit2 class="w-3 h-3" />
              </button>

              <button
                type="button"
                @click="handleDeleteList($event, list.id)"
                class="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-rose-500 transition-opacity cursor-pointer"
                title="Delete list"
              >
                <Trash2 class="w-3 h-3" />
              </button>
            </div>
          </div>

          <!-- Inline Create List Input -->
          <form @submit.prevent="handleCreateList" class="mt-2 px-1">
            <div class="relative flex items-center">
              <input
                v-model="newListName"
                type="text"
                placeholder="New list..."
                :disabled="isCreating"
                class="w-full pl-2.5 pr-8 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
              />
              <button
                type="submit"
                :disabled="isCreating || !newListName.trim()"
                class="absolute right-1.5 p-0.5 text-zinc-400 hover:text-emerald-600 disabled:opacity-30 cursor-pointer"
                title="Add list"
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
                : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900'
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
                  : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
              ]"
            >
              {{ tag.taskCount }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>
