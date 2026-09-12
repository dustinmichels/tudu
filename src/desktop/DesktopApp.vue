<script setup lang="ts">
import { onMounted, onUnmounted, watch } from "vue";
import CalendarView from "../components/CalendarView.vue";
import CaptureModal from "../components/CaptureModal.vue";
import CommandPaletteModal from "../components/CommandPaletteModal.vue";
import GlobalHeader from "../components/GlobalHeader.vue";
import ImportModal from "../components/ImportModal.vue";
import KeyboardShortcutsModal from "../components/KeyboardShortcutsModal.vue";
import Sidebar from "../components/Sidebar.vue";
import TaskDetail from "../components/TaskDetail.vue";
import TaskList from "../components/TaskList.vue";
import { useFilterStore } from "../stores/filters.ts";
import { type DefaultView, useListStore } from "../stores/lists.ts";
import { useTagStore } from "../stores/tags.ts";
import { useTaskStore } from "../stores/tasks.ts";
import { useUIStore } from "../stores/ui.ts";
import { useKeyboardShortcuts } from "../composables/useKeyboardShortcuts.ts";

const filterStore = useFilterStore();
const listStore = useListStore();
const tagStore = useTagStore();
const taskStore = useTaskStore();
const uiStore = useUIStore();

useKeyboardShortcuts();

function handlePreventDefault(e: DragEvent) {
	e.preventDefault();
}

onMounted(async () => {
	window.addEventListener("dragover", handlePreventDefault);
	window.addEventListener("drop", handlePreventDefault);

	try {
		await Promise.all([listStore.fetchLists(), taskStore.fetchAllTasks(), tagStore.fetchTags()]);
	} catch (err) {
		console.error("Failed to initialize on mount:", err);
	}
});

onUnmounted(() => {
	window.removeEventListener("dragover", handlePreventDefault);
	window.removeEventListener("drop", handlePreventDefault);
});

watch(
	[() => listStore.activeListId, () => listStore.activeView, () => filterStore.selectedTag],
	async ([listId, view, tag]) => {
		taskStore.setActiveTask(null);
		if (tag) {
			try {
				await taskStore.fetchTasks(null, undefined, null, tag);
			} catch (err) {
				console.error("Failed to fetch tasks for tag:", err);
			}
		} else if (listId) {
			try {
				await taskStore.fetchTasks(listId, undefined, null, null);
			} catch (err) {
				console.error("Failed to fetch tasks for active list:", err);
			}
		} else if (view) {
			try {
				await taskStore.fetchTasks(null, undefined, view, null);
			} catch (err) {
				console.error("Failed to fetch tasks for active view:", err);
			}
		} else {
			taskStore.tasks = [];
		}
	},
);
</script>

<template>
	<div
		class="flex flex-col h-screen w-screen overflow-hidden bg-white dark:bg-zinc-900 font-sans text-zinc-900 dark:text-zinc-100 antialiased"
	>
		<!-- Global Header: Window Drag Region, Search, Sync, Settings -->
		<GlobalHeader />

		<!-- Main Content Area: 3-Pane Responsive Layout -->
		<div class="flex-1 flex min-h-0 w-full relative overflow-hidden">
			<!-- Mobile Drawer Backdrop for Left Sidebar -->
			<div
				v-if="uiStore.isSidebarOpen"
				@click="uiStore.toggleSidebar(false)"
				class="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 md:hidden transition-opacity"
			/>

			<!-- Left Pane: Navigation Sidebar -->
			<!-- Desktop: Static 64/72w column. Mobile (<md): Slide-over drawer -->
			<div
				class="fixed inset-y-0 left-0 z-50 md:static md:z-auto h-full w-72 md:w-64 shrink-0 transition-transform duration-200 ease-in-out md:translate-x-0"
				:class="[
					uiStore.isSidebarOpen
						? 'translate-x-0 shadow-2xl md:shadow-none'
						: '-translate-x-full md:translate-x-0',
				]"
			>
				<Sidebar class="w-full h-full" />
			</div>

			<!-- Center Pane: Main Task List or Calendar (fills available space) -->
			<main class="flex-1 min-w-0 h-full flex flex-col">
				<CalendarView v-if="uiStore.isCalendarView" class="flex-1 min-w-0 h-full" />
				<TaskList v-else class="flex-1 min-w-0 h-full" />
			</main>

			<!-- Mobile Backdrop for Right Detail Panel -->
			<div
				v-if="uiStore.isDetailOpen && taskStore.activeTask"
				@click="uiStore.toggleDetail(false)"
				class="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 lg:hidden transition-opacity"
			/>

			<!-- Right Pane: Task Detail Panel -->
			<!-- Desktop (lg+): Collapsible side column. Tablet/Mobile (<lg): Slide-over / stacked sheet -->
			<aside
				v-show="uiStore.isDetailOpen"
				class="fixed inset-y-0 right-0 z-50 lg:static lg:z-auto h-full w-full sm:w-96 lg:w-96 shrink-0 border-l border-zinc-200 dark:border-zinc-800 transition-all duration-200 ease-in-out shadow-2xl lg:shadow-none bg-zinc-50 dark:bg-zinc-950"
			>
				<TaskDetail class="w-full h-full" />
			</aside>
		</div>

		<!-- Modals -->
		<ImportModal />
		<KeyboardShortcutsModal />
		<CaptureModal />
		<CommandPaletteModal />
	</div>
</template>
