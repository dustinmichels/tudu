import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { useTaskStore } from "./tasks.ts";

export const useUIStore = defineStore("ui", () => {
	const isSidebarOpen = ref(false); // Mobile drawer state
	const isDetailOpen = ref(true); // Collapsible/expandable right detail panel
	const isImportOpen = ref(false); // Import modal
	const isShortcutsOpen = ref(false); // Keyboard shortcuts modal
	const isCaptureOpen = ref(false); // Capture task modal
	const isCommandPaletteOpen = ref(false); // Global command palette / control panel
	const commandPaletteInitialMode = ref<"commands" | "lists">("commands");
	const syncStatus = ref<"synced" | "syncing" | "offline" | "error">("offline");
	const viewMode = ref<"list" | "calendar" | "freeform">("list");

	function onSwitchView() {
		isDetailOpen.value = false;
		useTaskStore().setActiveTask(null);
	}

	watch(
		viewMode,
		(newMode, oldMode) => {
			if (newMode !== oldMode) {
				onSwitchView();
			}
		},
		{ flush: "sync" },
	);

	function toggleCalendarView() {
		setViewMode(viewMode.value === "calendar" ? "list" : "calendar");
	}

	function setViewMode(mode: "list" | "calendar" | "freeform") {
		if (viewMode.value !== mode) {
			viewMode.value = mode;
		}
	}

	function toggleSidebar(open?: boolean) {
		isSidebarOpen.value = open !== undefined ? open : !isSidebarOpen.value;
	}

	function toggleDetail(open?: boolean) {
		isDetailOpen.value = open !== undefined ? open : !isDetailOpen.value;
	}

	function toggleImport(open?: boolean) {
		isImportOpen.value = open !== undefined ? open : !isImportOpen.value;
	}

	function toggleShortcuts(open?: boolean) {
		isShortcutsOpen.value = open !== undefined ? open : !isShortcutsOpen.value;
	}

	function toggleCommandPalette(open?: boolean, mode: "commands" | "lists" = "commands") {
		isCommandPaletteOpen.value = open !== undefined ? open : !isCommandPaletteOpen.value;
		if (isCommandPaletteOpen.value) {
			commandPaletteInitialMode.value = mode;
		}
	}

	function openCommandPalette(mode: "commands" | "lists" = "commands") {
		commandPaletteInitialMode.value = mode;
		isCommandPaletteOpen.value = true;
	}
	function setSyncStatus(status: "synced" | "syncing" | "offline" | "error") {
		syncStatus.value = status;
	}
	function toggleCapture(open?: boolean) {
		isCaptureOpen.value = open !== undefined ? open : !isCaptureOpen.value;
	}

	const showSubtasksInline = ref(false); // Whether subtasks are shown indented under parent tasks in main view
	const collapsedTaskIds = ref<Set<string>>(new Set()); // Overrides when showSubtasksInline is true
	const manuallyExpandedTaskIds = ref<Set<string>>(new Set()); // Overrides when showSubtasksInline is false

	function toggleSubtasksInline(show?: boolean) {
		showSubtasksInline.value = show !== undefined ? show : !showSubtasksInline.value;
		if (showSubtasksInline.value) {
			collapsedTaskIds.value = new Set();
		} else {
			manuallyExpandedTaskIds.value = new Set();
		}
	}

	function isTaskSubtasksExpanded(taskId: string): boolean {
		if (showSubtasksInline.value) {
			return !collapsedTaskIds.value.has(taskId);
		}
		return manuallyExpandedTaskIds.value.has(taskId);
	}

	function toggleTaskSubtasks(taskId: string) {
		if (showSubtasksInline.value) {
			const next = new Set(collapsedTaskIds.value);
			if (next.has(taskId)) {
				next.delete(taskId);
			} else {
				next.add(taskId);
			}
			collapsedTaskIds.value = next;
		} else {
			const next = new Set(manuallyExpandedTaskIds.value);
			if (next.has(taskId)) {
				next.delete(taskId);
			} else {
				next.add(taskId);
			}
			manuallyExpandedTaskIds.value = next;
		}
	}

	const isBunnyVisible = ref(false);
	const bunnyAnimationKey = ref(0);
	let bunnyTimer: number | undefined = undefined;

	function triggerTaskCompletionAnimation() {
		bunnyAnimationKey.value++;
		isBunnyVisible.value = true;
		clearTimeout(bunnyTimer);
		bunnyTimer = globalThis.setTimeout(() => {
			isBunnyVisible.value = false;
			bunnyTimer = undefined;
		}, 2500) as unknown as number;
	}

	function hideBunny() {
		clearTimeout(bunnyTimer);
		bunnyTimer = undefined;
		isBunnyVisible.value = false;
	}

	return {
		isSidebarOpen,
		isDetailOpen,
		syncStatus,
		toggleSidebar,
		toggleDetail,
		isImportOpen,
		toggleImport,
		isShortcutsOpen,
		toggleShortcuts,
		isCommandPaletteOpen,
		commandPaletteInitialMode,
		toggleCommandPalette,
		openCommandPalette,
		isCaptureOpen,
		toggleCapture,
		setSyncStatus,
		showSubtasksInline,
		toggleSubtasksInline,
		isTaskSubtasksExpanded,
		toggleTaskSubtasks,
		viewMode,
		toggleCalendarView,
		setViewMode,
		isBunnyVisible,
		bunnyAnimationKey,
		triggerTaskCompletionAnimation,
		hideBunny,
	};
});
