import { onMounted, onUnmounted } from "vue";
import type { Priority, Task } from "../models/index.ts";
import { PRIORITY } from "../models/index.ts";
import { useFilterStore } from "../stores/filters.ts";
import { type DefaultView, useListStore } from "../stores/lists.ts";
import { useTaskStore } from "../stores/tasks.ts";
import { useUIStore } from "../stores/ui.ts";

export interface ShortcutOptions {
	onFocusQuickAdd?: () => void;
	getVisibleTasks?: () => Task[];
}

export function isEditingInput(target: EventTarget | null): boolean {
	if (!target) return false;
	const el = target as Partial<HTMLElement>;
	const tagName = el.tagName?.toUpperCase();
	return (
		tagName === "INPUT" ||
		tagName === "TEXTAREA" ||
		tagName === "SELECT" ||
		Boolean(el.isContentEditable)
	);
}

export function handleEscape(
	uiStore: ReturnType<typeof useUIStore>,
	taskStore: ReturnType<typeof useTaskStore>,
): boolean {
	// Priority 1: Modals
	if (uiStore.isCommandPaletteOpen) {
		uiStore.toggleCommandPalette(false);
		return true;
	}
	if (uiStore.isShortcutsOpen) {
		uiStore.toggleShortcuts(false);
		return true;
	}
	if (uiStore.isCaptureOpen) {
		uiStore.toggleCapture(false);
		return true;
	}
	if (uiStore.isImportOpen) {
		uiStore.toggleImport(false);
		return true;
	}

	// Priority 2: Active task / selection & detail pane
	if (taskStore.activeTaskId) {
		taskStore.setActiveTask(null);
		uiStore.toggleDetail(false);
		return true;
	}

	return false;
}

const SMART_VIEW_ORDER: DefaultView[] = [
	"inbox",
	"all",
	"today",
	"tomorrow",
	"this_week",
	"overdue",
	"trash",
];

export function handleNavigationKey(
	e: KeyboardEvent,
	listStore: ReturnType<typeof useListStore>,
	filterStore: ReturnType<typeof useFilterStore>,
	uiStore?: ReturnType<typeof useUIStore>,
	taskStore?: ReturnType<typeof useTaskStore>,
): boolean {
	// Only handle Tab key without Meta (Cmd) or Alt (Option)
	if (e.key !== "Tab" || e.metaKey || e.altKey) {
		return false;
	}

	// If any modal is open, do not navigate lists/views in background
	if (
		uiStore &&
		(uiStore.isCommandPaletteOpen ||
			uiStore.isShortcutsOpen ||
			uiStore.isCaptureOpen ||
			uiStore.isImportOpen)
	) {
		return false;
	}

	// Plain Tab / Shift+Tab should not hijack form inputs or text editing
	if (!e.ctrlKey && isEditingInput(e.target)) {
		return false;
	}

	const isNext = !e.shiftKey;
	const isPrev = e.shiftKey;

	e.preventDefault();

	type NavItem = { type: "view"; id: DefaultView } | { type: "list"; id: string };

	const navItems: NavItem[] = [
		...SMART_VIEW_ORDER.map((id) => ({ type: "view" as const, id })),
		...listStore.customLists.map((l) => ({ type: "list" as const, id: l.id })),
	];

	if (navItems.length === 0) return false;

	let currentNavIndex = -1;
	if (listStore.activeView) {
		currentNavIndex = navItems.findIndex((n) => n.type === "view" && n.id === listStore.activeView);
	} else if (listStore.activeListId) {
		if (listStore.inboxList && listStore.activeListId === listStore.inboxList.id) {
			currentNavIndex = navItems.findIndex((n) => n.type === "view" && n.id === "inbox");
		} else {
			currentNavIndex = navItems.findIndex(
				(n) => n.type === "list" && n.id === listStore.activeListId,
			);
		}
	}

	let nextNavIndex: number;
	if (currentNavIndex === -1) {
		nextNavIndex = isNext ? 0 : navItems.length - 1;
	} else {
		nextNavIndex = isNext
			? (currentNavIndex + 1) % navItems.length
			: (currentNavIndex - 1 + navItems.length) % navItems.length;
	}

	const nextNav = navItems[nextNavIndex];
	if (!nextNav) return true;

	filterStore.setTagFilter(null);
	taskStore?.setActiveTask(null);
	if (uiStore?.isSidebarOpen) {
		uiStore.toggleSidebar(false);
	}

	if (nextNav.type === "view") {
		listStore.setActiveView(nextNav.id);
	} else {
		listStore.setActiveList(nextNav.id);
	}
	return true;
}

export function handleGlobalShortcut(
	e: KeyboardEvent,
	stores: {
		filterStore: ReturnType<typeof useFilterStore>;
		listStore: ReturnType<typeof useListStore>;
		taskStore: ReturnType<typeof useTaskStore>;
		uiStore: ReturnType<typeof useUIStore>;
	},
	options?: ShortcutOptions,
): boolean {
	if (e.defaultPrevented) return false;

	const { filterStore, listStore, taskStore, uiStore } = stores;
	const isEditing = isEditingInput(e.target);
	const isMod = e.metaKey || e.ctrlKey;

	// Escape -> handles modal and selection dismissal
	if (e.key === "Escape") {
		const handled = handleEscape(uiStore, taskStore);
		if (handled) {
			e.preventDefault();
			return true;
		}
		return false;
	}

	// Cmd/Ctrl + Shift + P -> Open Command Palette (Control Panel)
	if (isMod && e.shiftKey && (e.key === "P" || e.key === "p")) {
		e.preventDefault();
		uiStore.toggleCommandPalette(undefined, "commands");
		return true;
	}

	// Cmd/Ctrl + P -> Open List / View Picker
	if (isMod && !e.shiftKey && !e.altKey && (e.key === "p" || e.key === "P")) {
		e.preventDefault();
		uiStore.toggleCommandPalette(undefined, "lists");
		return true;
	}

	// Cmd/Ctrl + C -> Toggle Calendar mode (when not editing input & no text selected)
	if (isMod && !e.shiftKey && !e.altKey && (e.key === "c" || e.key === "C")) {
		const hasSelection =
			typeof window !== "undefined" && (window.getSelection()?.toString().trim().length ?? 0) > 0;
		if (!isEditing && !hasSelection) {
			e.preventDefault();
			uiStore.toggleCalendarView();
			return true;
		}
	}

	// Cmd/Ctrl + B -> Toggle primary sidebar
	if (isMod && !e.shiftKey && !e.altKey && (e.key === "b" || e.key === "B")) {
		e.preventDefault();
		uiStore.toggleSidebar();
		return true;
	}

	// Cmd/Ctrl + J -> Toggle detail panel
	if (isMod && !e.shiftKey && !e.altKey && (e.key === "j" || e.key === "J")) {
		e.preventDefault();
		uiStore.toggleDetail();
		return true;
	}

	// Cmd/Ctrl + H -> Toggle show/hide completed tasks
	if (isMod && !e.shiftKey && !e.altKey && (e.key === "h" || e.key === "H")) {
		e.preventDefault();
		const next = !taskStore.includeCompleted;
		taskStore.setIncludeCompleted(next);
		filterStore.setIncludeCompleted(next);
		return true;
	}

	// Cmd/Ctrl + N -> Open Quick Capture modal
	if (isMod && !e.shiftKey && !e.altKey && (e.key === "n" || e.key === "N")) {
		e.preventDefault();
		uiStore.toggleCapture(true);
		return true;
	}

	// Cmd/Ctrl + F or '/' -> Focus search input
	if (
		(isMod && !e.shiftKey && (e.key === "f" || e.key === "F")) ||
		(!isEditing && e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey)
	) {
		e.preventDefault();
		if (typeof document !== "undefined") {
			const searchInput = document.querySelector<HTMLInputElement>("input[data-global-search]");
			searchInput?.focus();
			searchInput?.select();
		}
		return true;
	}

	// Tab / Shift + Tab (or Ctrl + Tab) -> Navigate lists/views
	if (handleNavigationKey(e, listStore, filterStore, uiStore, taskStore)) {
		return true;
	}

	// --- From this point down, shortcuts are single-key shortcuts blocked by input editing ---
	if (isEditing) {
		return false;
	}

	// '?' -> show keyboard shortcuts
	if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
		e.preventDefault();
		uiStore.toggleShortcuts(true);
		return true;
	}

	// 't' -> focus task quick-add
	if (e.key === "t" && !e.ctrlKey && !e.metaKey && !e.altKey) {
		e.preventDefault();
		if (options?.onFocusQuickAdd) {
			options.onFocusQuickAdd();
		} else if (typeof document !== "undefined") {
			const quickAddInput = document.querySelector<HTMLInputElement>("input[data-quick-add]");
			quickAddInput?.focus();
			quickAddInput?.select();
		}
		return true;
	}

	// Task navigation: j / k / ArrowDown / ArrowUp
	const isNextTask =
		(e.key === "j" || e.key === "ArrowDown") && !e.ctrlKey && !e.metaKey && !e.altKey;
	const isPrevTask =
		(e.key === "k" || e.key === "ArrowUp") && !e.ctrlKey && !e.metaKey && !e.altKey;

	if (isNextTask || isPrevTask) {
		const tasks = options?.getVisibleTasks ? options.getVisibleTasks() : taskStore.tasks;
		if (!tasks.length) return false;
		e.preventDefault();

		const currentId = taskStore.activeTaskId;
		const currentIndex = currentId ? tasks.findIndex((t) => t.id === currentId) : -1;

		let nextIndex: number;
		if (isNextTask) {
			nextIndex = currentIndex === -1 ? 0 : Math.min(currentIndex + 1, tasks.length - 1);
		} else {
			nextIndex = currentIndex === -1 ? tasks.length - 1 : Math.max(currentIndex - 1, 0);
		}

		const nextTask = tasks[nextIndex];
		if (nextTask) {
			taskStore.setActiveTask(nextTask.id);
			uiStore.toggleDetail(true);
			if (typeof document !== "undefined") {
				const el = document.querySelector(`[data-task-id="${nextTask.id}"]`);
				el?.scrollIntoView({ block: "nearest" });
			}
		}
		return true;
	}

	// 'c' -> complete selected task
	if (e.key === "c" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
		const currentId = taskStore.activeTaskId;
		if (!currentId) return false;
		e.preventDefault();
		void taskStore.toggleTask(currentId).catch((err) => {
			console.error("Failed to toggle task via shortcut:", err);
		});
		return true;
	}

	// 'p' -> postpone selected task by 1 day
	if (e.key === "p" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
		const currentId = taskStore.activeTaskId;
		if (!currentId) return false;
		e.preventDefault();
		void taskStore.postponeTask(currentId, 1).catch((err) => {
			console.error("Failed to postpone task via shortcut:", err);
		});
		return true;
	}

	// '1', '2', '3', '4' -> priority 1-3, None
	if (
		(e.key === "1" || e.key === "2" || e.key === "3" || e.key === "4") &&
		!e.repeat &&
		!e.ctrlKey &&
		!e.metaKey &&
		!e.altKey
	) {
		const currentId = taskStore.activeTaskId;
		if (!currentId) return false;
		e.preventDefault();
		const priorityMap: Record<string, Priority | null> = {
			"1": PRIORITY.HIGH as Priority,
			"2": PRIORITY.MEDIUM as Priority,
			"3": PRIORITY.LOW as Priority,
			"4": null,
		};
		void taskStore
			.updateTask({
				id: currentId,
				priority: priorityMap[e.key] ?? null,
			})
			.catch((err) => {
				console.error("Failed to update priority via shortcut:", err);
			});
		return true;
	}

	// Delete / Backspace or '#' / 'd' -> delete selected task
	if (
		((e.key === "Backspace" || e.key === "Delete") && !e.altKey) ||
		(e.key === "#" && !e.ctrlKey && !e.metaKey && !e.altKey) ||
		(e.key === "d" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey)
	) {
		const currentId = taskStore.activeTaskId;
		if (!currentId) return false;
		e.preventDefault();
		void taskStore.deleteTask(currentId).catch((err) => {
			console.error("Failed to delete task via shortcut:", err);
		});
		return true;
	}

	return false;
}

export function useKeyboardShortcuts(options?: ShortcutOptions) {
	const filterStore = useFilterStore();
	const listStore = useListStore();
	const taskStore = useTaskStore();
	const uiStore = useUIStore();

	function onKeyDown(e: KeyboardEvent) {
		handleGlobalShortcut(
			e,
			{
				filterStore,
				listStore,
				taskStore,
				uiStore,
			},
			options,
		);
	}

	onMounted(() => {
		window.addEventListener("keydown", onKeyDown);
	});

	onUnmounted(() => {
		window.removeEventListener("keydown", onKeyDown);
	});

	return {
		onKeyDown,
	};
}
