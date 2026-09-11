<script setup lang="ts">
import { onMounted, onUnmounted, watch } from "vue";
import CaptureModal from "./components/CaptureModal.vue";
import CommandPaletteModal from "./components/CommandPaletteModal.vue";
import GlobalHeader from "./components/GlobalHeader.vue";
import ImportModal from "./components/ImportModal.vue";
import KeyboardShortcutsModal from "./components/KeyboardShortcutsModal.vue";
import Sidebar from "./components/Sidebar.vue";
import TaskDetail from "./components/TaskDetail.vue";
import CalendarView from "./components/CalendarView.vue";
import TaskList from "./components/TaskList.vue";
import { useFilterStore } from "./stores/filters.ts";
import { type DefaultView, useListStore } from "./stores/lists.ts";
import { useTagStore } from "./stores/tags.ts";
import { useTaskStore } from "./stores/tasks.ts";
import { useUIStore } from "./stores/ui.ts";

const filterStore = useFilterStore();
const listStore = useListStore();
const tagStore = useTagStore();
const taskStore = useTaskStore();
const uiStore = useUIStore();

function handlePreventDefault(e: DragEvent) {
	e.preventDefault();
}

onMounted(async () => {
	window.addEventListener("dragover", handlePreventDefault);
	window.addEventListener("drop", handlePreventDefault);
	window.addEventListener("keydown", handleAppKeyDown);

	try {
		await Promise.all([listStore.fetchLists(), taskStore.fetchAllTasks(), tagStore.fetchTags()]);
	} catch (err) {
		console.error("Failed to initialize on mount:", err);
	}
});

onUnmounted(() => {
	window.removeEventListener("dragover", handlePreventDefault);
	window.removeEventListener("drop", handlePreventDefault);
	window.removeEventListener("keydown", handleAppKeyDown);
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
		} else if (view === "calendar") {
			// CalendarView manages its own data; nothing to fetch here.
			taskStore.tasks = [];
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

function handleAppKeyDown(e: KeyboardEvent) {
	if (e.defaultPrevented) return;

	const target = e.target as HTMLElement | null;
	const isEditingInput =
		target &&
		(target.tagName === "INPUT" ||
			target.tagName === "TEXTAREA" ||
			target.tagName === "SELECT" ||
			target.isContentEditable);

	const isMod = e.metaKey || e.ctrlKey;

	// Global app shortcuts
	// Cmd/Ctrl + Shift + P -> Open Command Palette (Control Panel)
	if (isMod && e.shiftKey && (e.key === "P" || e.key === "p")) {
		e.preventDefault();
		uiStore.toggleCommandPalette(undefined, "commands");
		return;
	}

	// Cmd/Ctrl + P -> Open List / View Picker
	if (isMod && !e.shiftKey && !e.altKey && (e.key === "p" || e.key === "P")) {
		e.preventDefault();
		uiStore.toggleCommandPalette(undefined, "lists");
		return;
	}

	// Cmd/Ctrl + C -> Open Calendar view (unless editing text or text is highlighted)
	if (isMod && !e.shiftKey && !e.altKey && (e.key === "c" || e.key === "C")) {
		const hasSelection =
			typeof window !== "undefined" && (window.getSelection()?.toString().trim().length ?? 0) > 0;

		if (!isEditingInput && !hasSelection) {
			e.preventDefault();
			filterStore.setTagFilter(null);
			filterStore.setListFilter(null);
			filterStore.setSmartView(null);
			listStore.setActiveView("calendar");
			listStore.setActiveList(null);
			taskStore.setActiveTask(null);
			return;
		}
	}

	// Cmd/Ctrl + B -> Toggle primary sidebar
	if (isMod && !e.shiftKey && !e.altKey && (e.key === "b" || e.key === "B")) {
		e.preventDefault();
		uiStore.toggleSidebar();
		return;
	}

	// Cmd/Ctrl + J -> Toggle detail panel
	if (isMod && !e.shiftKey && !e.altKey && (e.key === "j" || e.key === "J")) {
		e.preventDefault();
		uiStore.toggleDetail();
		return;
	}

	// Cmd/Ctrl + H -> Toggle show/hide completed tasks
	if (isMod && !e.shiftKey && !e.altKey && (e.key === "h" || e.key === "H")) {
		e.preventDefault();
		const next = !taskStore.includeCompleted;
		taskStore.setIncludeCompleted(next);
		filterStore.setIncludeCompleted(next);
		return;
	}

	// Cmd/Ctrl + N -> Open Quick Capture modal
	if (isMod && !e.shiftKey && !e.altKey && (e.key === "n" || e.key === "N")) {
		e.preventDefault();
		uiStore.toggleCapture(true);
		return;
	}

	// Escape -> close open modals
	if (e.key === "Escape") {
		if (uiStore.isCommandPaletteOpen) {
			e.preventDefault();
			uiStore.toggleCommandPalette(false);
			return;
		}
		if (uiStore.isShortcutsOpen) {
			e.preventDefault();
			uiStore.toggleShortcuts(false);
			return;
		}
		if (uiStore.isCaptureOpen) {
			e.preventDefault();
			uiStore.toggleCapture(false);
			return;
		}
		if (uiStore.isImportOpen) {
			e.preventDefault();
			uiStore.toggleImport(false);
			return;
		}
	}

	// '?' -> show keyboard shortcuts (when not typing in an input)
	if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditingInput) {
		e.preventDefault();
		uiStore.toggleShortcuts(true);
		return;
	}

	// Ctrl + Tab / Ctrl + Shift + Tab -> Navigate between lists/views
	handleNavKeyDown(e);
}

function handleNavKeyDown(e: KeyboardEvent) {
	if (e.defaultPrevented) return;
	const isNext = e.ctrlKey && !e.shiftKey && !e.metaKey && !e.altKey && e.key === "Tab";
	const isPrev = e.ctrlKey && e.shiftKey && !e.metaKey && !e.altKey && e.key === "Tab";
	if (!isNext && !isPrev) return;
	e.preventDefault();
	const SMART_VIEW_ORDER: DefaultView[] = [
		"inbox",
		"all",
		"today",
		"tomorrow",
		"this_week",
		"overdue",
		"calendar",
		"trash",
	];
	type NavItem =
		| { type: "home" }
		| { type: "view"; id: DefaultView }
		| { type: "list"; id: string };
	const navItems: NavItem[] = [
		{ type: "home" },
		...SMART_VIEW_ORDER.map((id) => ({ type: "view" as const, id })),
		...listStore.sortedLists.map((l) => ({ type: "list" as const, id: l.id })),
	];
	let currentNavIndex: number;
	if (!listStore.activeListId && !listStore.activeView && !filterStore.selectedTag) {
		currentNavIndex = 0;
	} else if (listStore.activeView) {
		currentNavIndex = navItems.findIndex((n) => n.type === "view" && n.id === listStore.activeView);
	} else if (listStore.activeListId) {
		currentNavIndex = navItems.findIndex(
			(n) => n.type === "list" && n.id === listStore.activeListId,
		);
	} else {
		currentNavIndex = 0;
	}
	if (currentNavIndex === -1) currentNavIndex = 0;
	const nextNavIndex = isNext
		? (currentNavIndex + 1) % navItems.length
		: (currentNavIndex - 1 + navItems.length) % navItems.length;
	const nextNav = navItems[nextNavIndex];
	if (!nextNav) return;
	filterStore.setTagFilter(null);
	if (nextNav.type === "home") {
		filterStore.setListFilter(null);
		filterStore.setSmartView(null);
		listStore.goHome();
		taskStore.setActiveTask(null);
	} else if (nextNav.type === "view") {
		filterStore.setListFilter(null);
		listStore.setActiveList(null);
		filterStore.setSmartView(nextNav.id === "calendar" ? null : nextNav.id);
		listStore.setActiveView(nextNav.id);
		taskStore.setActiveTask(null);
	} else {
		filterStore.setSmartView(null);
		listStore.setActiveView(null);
		filterStore.setListFilter(nextNav.id);
		listStore.setActiveList(nextNav.id);
		taskStore.setActiveTask(null);
	}
}
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
				<CalendarView v-if="listStore.activeView === 'calendar'" class="flex-1 min-w-0 h-full" />
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
