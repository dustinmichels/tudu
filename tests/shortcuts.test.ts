import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createPinia, setActivePinia } from "pinia";
import type { Task } from "../src/models/index.ts";
import { useFilterStore } from "../src/stores/filters.ts";
import { useListStore } from "../src/stores/lists.ts";
import { useTaskStore } from "../src/stores/tasks.ts";
import { useUIStore } from "../src/stores/ui.ts";

mock.module("@tauri-apps/api/core", () => ({
	invoke: async (command: string, args?: unknown) => {
		if (command === "toggle_task_complete") {
			const { id, completed } = (args as { id: string; completed: boolean }) || {};
			return {
				id,
				title: "Task 1",
				completed,
				completed_at: completed ? new Date().toISOString() : null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				deleted_at: null,
			};
		}
		if (command === "batch_update_tasks") {
			const { input } =
				(args as {
					input: {
						task_ids: string[];
						priority?: string | null;
						completed?: boolean;
						postpone_days?: number;
					};
				}) || {};
			return (input?.task_ids ?? []).map((id) => ({
				id,
				title: `Task ${id}`,
				completed: Boolean(input?.completed),
				priority: input?.priority ?? null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				deleted_at: null,
			}));
		}
		if (command === "batch_delete_tasks" || command === "delete_task") {
			return null;
		}
		return null;
	},
}));

describe("Keyboard Shortcuts & Navigation", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it("navigates forward through tasks with ctrl + tab and cycles/bounds correctly", () => {
		const taskStore = useTaskStore();
		const mockTasks: Task[] = [
			{
				id: "t1",
				uid: null,
				parent_id: null,
				list_id: "l1",
				title: "Task 1",
				description: null,
				due: null,
				is_all_day: false,
				rrule: null,
				priority: null,
				location: null,
				url: null,
				completed: false,
				completed_at: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				deleted_at: null,
			},
			{
				id: "t2",
				uid: null,
				parent_id: null,
				list_id: "l1",
				title: "Task 2",
				description: null,
				due: null,
				is_all_day: false,
				rrule: null,
				priority: null,
				location: null,
				url: null,
				completed: false,
				completed_at: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				deleted_at: null,
			},
			{
				id: "t3",
				uid: null,
				parent_id: null,
				list_id: "l1",
				title: "Task 3",
				description: null,
				due: null,
				is_all_day: false,
				rrule: null,
				priority: null,
				location: null,
				url: null,
				completed: false,
				completed_at: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				deleted_at: null,
			},
		];
		taskStore.tasks = mockTasks;

		// Initial: no selection -> first task selected
		const visible = taskStore.tasks.filter((t) => !t.parent_id);
		let currentIndex = taskStore.activeTaskId
			? visible.findIndex((t) => t.id === taskStore.activeTaskId)
			: -1;
		let nextIndex = currentIndex === -1 ? 0 : Math.min(currentIndex + 1, visible.length - 1);
		taskStore.setActiveTask(visible[nextIndex]?.id ?? null);
		expect(taskStore.activeTaskId).toBe("t1");

		// Press ctrl + tab again -> moves to t2
		currentIndex = taskStore.activeTaskId
			? visible.findIndex((t) => t.id === taskStore.activeTaskId)
			: -1;
		nextIndex = currentIndex === -1 ? 0 : Math.min(currentIndex + 1, visible.length - 1);
		taskStore.setActiveTask(visible[nextIndex]?.id ?? null);
		expect(taskStore.activeTaskId).toBe("t2");

		// Press ctrl + tab again -> moves to t3
		currentIndex = taskStore.activeTaskId
			? visible.findIndex((t) => t.id === taskStore.activeTaskId)
			: -1;
		nextIndex = currentIndex === -1 ? 0 : Math.min(currentIndex + 1, visible.length - 1);
		taskStore.setActiveTask(visible[nextIndex]?.id ?? null);
		expect(taskStore.activeTaskId).toBe("t3");

		// At boundary: does not exceed bounds
		currentIndex = taskStore.activeTaskId
			? visible.findIndex((t) => t.id === taskStore.activeTaskId)
			: -1;
		nextIndex = currentIndex === -1 ? 0 : Math.min(currentIndex + 1, visible.length - 1);
		taskStore.setActiveTask(visible[nextIndex]?.id ?? null);
		expect(taskStore.activeTaskId).toBe("t3");
	});

	it("navigates backward through tasks with ctrl + shift + tab", () => {
		const taskStore = useTaskStore();
		const mockTasks: Task[] = [
			{
				id: "t1",
				uid: null,
				parent_id: null,
				list_id: "l1",
				title: "Task 1",
				description: null,
				due: null,
				is_all_day: false,
				rrule: null,
				priority: null,
				location: null,
				url: null,
				completed: false,
				completed_at: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				deleted_at: null,
			},
			{
				id: "t2",
				uid: null,
				parent_id: null,
				list_id: "l1",
				title: "Task 2",
				description: null,
				due: null,
				is_all_day: false,
				rrule: null,
				priority: null,
				location: null,
				url: null,
				completed: false,
				completed_at: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				deleted_at: null,
			},
		];
		taskStore.tasks = mockTasks;
		taskStore.setActiveTask("t2");

		const visible = taskStore.tasks.filter((t) => !t.parent_id);
		let currentIndex = taskStore.activeTaskId
			? visible.findIndex((t) => t.id === taskStore.activeTaskId)
			: -1;
		let prevIndex = currentIndex === -1 ? visible.length - 1 : Math.max(currentIndex - 1, 0);
		taskStore.setActiveTask(visible[prevIndex]?.id ?? null);
		expect(taskStore.activeTaskId).toBe("t1");

		// At start boundary: remains at 0
		currentIndex = taskStore.activeTaskId
			? visible.findIndex((t) => t.id === taskStore.activeTaskId)
			: -1;
		prevIndex = currentIndex === -1 ? visible.length - 1 : Math.max(currentIndex - 1, 0);
		taskStore.setActiveTask(visible[prevIndex]?.id ?? null);
		expect(taskStore.activeTaskId).toBe("t1");
	});

	it("marks task as completed when enter key action is triggered", () => {
		const taskStore = useTaskStore();
		const mockTask: Task = {
			id: "t1",
			uid: null,
			parent_id: null,
			list_id: "l1",
			title: "Task 1",
			description: null,
			due: null,
			is_all_day: false,
			rrule: null,
			priority: null,
			location: null,
			url: null,
			completed: false,
			completed_at: null,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			deleted_at: null,
		};
		taskStore.tasks = [mockTask];
		taskStore.allTasks = [mockTask];
		taskStore.setActiveTask("t1");

		expect(taskStore.activeTaskId).toBe("t1");
		expect(taskStore.tasks[0]?.completed).toBe(false);

		// Enter triggers completion on the active task
		taskStore.toggleTask("t1", true);
		expect(taskStore.tasks[0]?.completed).toBe(true);
	});

	it("controls keyboard shortcuts modal state via UI store", () => {
		const uiStore = useUIStore();
		expect(uiStore.isShortcutsOpen).toBe(false);

		uiStore.toggleShortcuts(true);
		expect(uiStore.isShortcutsOpen).toBe(true);

		uiStore.toggleShortcuts(false);
		expect(uiStore.isShortcutsOpen).toBe(false);

		uiStore.toggleShortcuts();
		expect(uiStore.isShortcutsOpen).toBe(true);
	});

	it("controls command palette modal state and modes via UI store", () => {
		const uiStore = useUIStore();
		expect(uiStore.isCommandPaletteOpen).toBe(false);
		expect(uiStore.commandPaletteInitialMode).toBe("commands");

		// Open in command mode (Cmd+Shift+P)
		uiStore.openCommandPalette("commands");
		expect(uiStore.isCommandPaletteOpen).toBe(true);
		expect(uiStore.commandPaletteInitialMode).toBe("commands");

		// Close
		uiStore.toggleCommandPalette(false);
		expect(uiStore.isCommandPaletteOpen).toBe(false);

		// Open in list mode (Cmd+P)
		uiStore.openCommandPalette("lists");
		expect(uiStore.isCommandPaletteOpen).toBe(true);
		expect(uiStore.commandPaletteInitialMode).toBe("lists");

		// Toggle command palette
		uiStore.toggleCommandPalette();
		expect(uiStore.isCommandPaletteOpen).toBe(false);
	});

	it("toggles sidebar and detail panel via UI store (Zed / VS Code shortcuts)", () => {
		const uiStore = useUIStore();
		const initialSidebar = uiStore.isSidebarOpen;
		const initialDetail = uiStore.isDetailOpen;

		// Cmd+B toggles sidebar
		uiStore.toggleSidebar();
		expect(uiStore.isSidebarOpen).toBe(!initialSidebar);

		// Cmd+J toggles detail panel
		uiStore.toggleDetail();
		expect(uiStore.isDetailOpen).toBe(!initialDetail);
	});

	it("navigates to calendar view and clears active list, tag, and smart view", () => {
		const listStore = useListStore();
		const filterStore = useFilterStore();
		const taskStore = useTaskStore();
		const uiStore = useUIStore();

		// Set initial state: active list and tag filter
		listStore.setActiveList("list-123");
		filterStore.setTagFilter("urgent");
		taskStore.setActiveTask("t1");

		expect(listStore.activeListId).toBe("list-123");
		expect(filterStore.selectedTag).toBe("urgent");
		expect(filterStore.smartView).toBe(null);
		expect(taskStore.activeTaskId).toBe("t1");

		// Trigger Calendar shortcut navigation (Cmd+C action)
		filterStore.setTagFilter(null);
		listStore.setActiveView(null);
		listStore.setActiveList(null);
		uiStore.setViewMode("calendar");
		taskStore.setActiveTask(null);

		expect(uiStore.viewMode).toBe("calendar");
		expect(listStore.activeView).toBe(null);
		expect(listStore.activeListId).toBe(null);
		expect(filterStore.selectedTag).toBe(null);
		expect(filterStore.selectedListId).toBe(null);
		expect(filterStore.smartView).toBe(null);
		expect(taskStore.activeTaskId).toBe(null);
	});

	it("guards Cmd+C shortcut when user is typing in an input or text is highlighted", () => {
		// Test helper simulating the shortcut guard logic in App.vue and TaskList.vue
		function shouldTriggerCalendarShortcut(opts: {
			isMod: boolean;
			key: string;
			shiftKey?: boolean;
			altKey?: boolean;
			isEditingInput: boolean;
			hasSelection: boolean;
		}): boolean {
			const { isMod, key, shiftKey = false, altKey = false, isEditingInput, hasSelection } = opts;
			if (isMod && !shiftKey && !altKey && (key === "c" || key === "C")) {
				return !isEditingInput && !hasSelection;
			}
			return false;
		}

		// Plain 'c' without modifier does not trigger calendar navigation (it toggles task complete)
		expect(
			shouldTriggerCalendarShortcut({
				isMod: false,
				key: "c",
				isEditingInput: false,
				hasSelection: false,
			}),
		).toBe(false);

		// Cmd+C while typing in an input field does not trigger calendar (allows native copy)
		expect(
			shouldTriggerCalendarShortcut({
				isMod: true,
				key: "c",
				isEditingInput: true,
				hasSelection: false,
			}),
		).toBe(false);

		// Cmd+C while text is selected does not trigger calendar (allows native copy)
		expect(
			shouldTriggerCalendarShortcut({
				isMod: true,
				key: "c",
				isEditingInput: false,
				hasSelection: true,
			}),
		).toBe(false);

		// Cmd+C when idle / not typing triggers calendar navigation
		expect(
			shouldTriggerCalendarShortcut({
				isMod: true,
				key: "c",
				isEditingInput: false,
				hasSelection: false,
			}),
		).toBe(true);
	});

	it("handleGlobalShortcut: switches view mode with Cmd+L, Cmd+C, and Cmd+F", () => {
		const { handleGlobalShortcut } = require("../src/composables/useKeyboardShortcuts.ts");
		const filterStore = useFilterStore();
		const listStore = useListStore();
		const taskStore = useTaskStore();
		const uiStore = useUIStore();
		const stores = { filterStore, listStore, taskStore, uiStore };

		function createModEvent(key: string, target: EventTarget | Partial<HTMLElement> | null = null) {
			let prevented = false;
			return {
				key,
				metaKey: true,
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				target,
				preventDefault: () => {
					prevented = true;
				},
				get defaultPrevented() {
					return prevented;
				},
			} as unknown as KeyboardEvent;
		}

		// Start in list view
		uiStore.setViewMode("list");
		expect(uiStore.viewMode).toBe("list");

		// Cmd + C -> calendar view
		const calEvent = createModEvent("c");
		const calHandled = handleGlobalShortcut(calEvent, stores);
		expect(calHandled).toBe(true);
		expect(calEvent.defaultPrevented).toBe(true);
		expect(uiStore.viewMode).toBe("calendar");

		// Cmd + F -> freeform view
		const ffEvent = createModEvent("f");
		const ffHandled = handleGlobalShortcut(ffEvent, stores);
		expect(ffHandled).toBe(true);
		expect(ffEvent.defaultPrevented).toBe(true);
		expect(uiStore.viewMode).toBe("freeform");

		// Cmd + L -> list view
		const listEvent = createModEvent("l");
		const listHandled = handleGlobalShortcut(listEvent, stores);
		expect(listHandled).toBe(true);
		expect(listEvent.defaultPrevented).toBe(true);
		expect(uiStore.viewMode).toBe("list");

		// Cmd+C is guarded when user is typing in an input (allows native copy)
		const inputTarget = { tagName: "INPUT" };
		const calInInput = createModEvent("c", inputTarget);
		expect(handleGlobalShortcut(calInInput, stores)).toBe(false);
		expect(calInInput.defaultPrevented).toBe(false);
		expect(uiStore.viewMode).toBe("list");

		// Cmd+C is guarded when text is highlighted (allows native copy)
		const winGlobal = globalThis as unknown as { window?: { getSelection?: () => unknown } };
		const hadWindow = "window" in globalThis;
		const originalWindow = winGlobal.window;
		try {
			winGlobal.window = {
				getSelection: () => ({ toString: () => "selected text" }),
			};
			const calWithSelection = createModEvent("c");
			expect(handleGlobalShortcut(calWithSelection, stores)).toBe(false);
			expect(calWithSelection.defaultPrevented).toBe(false);
			expect(uiStore.viewMode).toBe("list");
		} finally {
			if (hadWindow) {
				winGlobal.window = originalWindow;
			} else {
				delete (globalThis as Record<string, unknown>).window;
			}
		}
		// Cmd+F and Cmd+L work even when an input is focused
		const ffInInput = createModEvent("f", inputTarget);
		expect(handleGlobalShortcut(ffInInput, stores)).toBe(true);
		expect(ffInInput.defaultPrevented).toBe(true);
		expect(uiStore.viewMode).toBe("freeform");

		const listInInput = createModEvent("l", inputTarget);
		expect(handleGlobalShortcut(listInInput, stores)).toBe(true);
		expect(listInInput.defaultPrevented).toBe(true);
		expect(uiStore.viewMode).toBe("list");
	});

	it("useKeyboardShortcuts: isEditingInput correctly identifies form inputs", () => {
		const { isEditingInput } = require("../src/composables/useKeyboardShortcuts.ts");
		expect(isEditingInput(null)).toBe(false);
		expect(isEditingInput({} as any)).toBe(false);

		expect(isEditingInput({ tagName: "INPUT" } as any)).toBe(true);
		expect(isEditingInput({ tagName: "TEXTAREA" } as any)).toBe(true);
		expect(isEditingInput({ tagName: "SELECT" } as any)).toBe(true);
		expect(isEditingInput({ tagName: "DIV", isContentEditable: true } as any)).toBe(true);
		expect(isEditingInput({ tagName: "DIV", isContentEditable: false } as any)).toBe(false);
	});

	it("useKeyboardShortcuts: handleEscape closes topmost modals first before deselecting task", () => {
		const { handleEscape } = require("../src/composables/useKeyboardShortcuts.ts");
		const uiStore = useUIStore();
		const taskStore = useTaskStore();

		taskStore.setActiveTask("task-123");
		uiStore.toggleCommandPalette(true);

		// With command palette open, escape closes command palette first, keeping active task
		const handled1 = handleEscape(uiStore, taskStore);
		expect(handled1).toBe(true);
		expect(uiStore.isCommandPaletteOpen).toBe(false);
		expect(taskStore.activeTaskId).toBe("task-123");

		// Next escape deselects active task and closes detail panel
		uiStore.toggleDetail(true);
		const handled2 = handleEscape(uiStore, taskStore);
		expect(handled2).toBe(true);
		expect(taskStore.activeTaskId).toBe(null);
		expect(uiStore.isDetailOpen).toBe(false);

		// Next escape with nothing open returns false
		const handled3 = handleEscape(uiStore, taskStore);
		expect(handled3).toBe(false);
	});

	it("handleNavigationKey: navigates forward through views and custom lists with Tab and wraps around", () => {
		const { handleNavigationKey } = require("../src/composables/useKeyboardShortcuts.ts");
		const listStore = useListStore();
		const filterStore = useFilterStore();
		const uiStore = useUIStore();
		const taskStore = useTaskStore();

		listStore.lists = [
			{
				id: "inbox-id",
				name: "Inbox",
				color: "#3b82f6",
				position: 0,
				created_at: "",
				updated_at: "",
				deleted_at: null,
			},
			{
				id: "work-id",
				name: "Work",
				color: "#10b981",
				position: 1,
				created_at: "",
				updated_at: "",
				deleted_at: null,
			},
			{
				id: "personal-id",
				name: "Personal",
				color: "#6366f1",
				position: 2,
				created_at: "",
				updated_at: "",
				deleted_at: null,
			},
		];

		// Helper to create mock Tab event
		function tabEvent(shift = false, ctrl = false, target: any = null) {
			let prevented = false;
			return {
				key: "Tab",
				shiftKey: shift,
				ctrlKey: ctrl,
				metaKey: false,
				altKey: false,
				target,
				preventDefault: () => {
					prevented = true;
				},
				get defaultPrevented() {
					return prevented;
				},
			} as unknown as KeyboardEvent;
		}

		// Initial: on Home (no selection) -> Tab goes to first smart view ('inbox')
		expect(listStore.activeView).toBe(null);
		expect(listStore.activeListId).toBe(null);
		const e1 = tabEvent(false);
		const res1 = handleNavigationKey(e1, listStore, filterStore, uiStore, taskStore);
		expect(res1).toBe(true);
		expect(e1.defaultPrevented).toBe(true);
		expect(listStore.activeView).toBe("inbox");
		expect(listStore.activeListId).toBe(null);

		// Cycle forward through all views and custom lists
		const expectedOrder = [
			{ view: "all", list: null },
			{ view: "next_actions", list: null },
			{ view: "waiting_on", list: null },
			{ view: "someday_maybe", list: null },
			{ view: "today", list: null },
			{ view: "tomorrow", list: null },
			{ view: "this_week", list: null },
			{ view: "overdue", list: null },
			{ view: "trash", list: null },
			{ view: null, list: "work-id" },
			{ view: null, list: "personal-id" },
			{ view: "inbox", list: null }, // wrap back to inbox
		];

		for (const step of expectedOrder) {
			const ev = tabEvent(false);
			const handled = handleNavigationKey(ev, listStore, filterStore, uiStore, taskStore);
			expect(handled).toBe(true);
			expect(ev.defaultPrevented).toBe(true);
			expect(listStore.activeView).toBe(step.view as any);
			expect(listStore.activeListId).toBe(step.list);
		}
	});

	it("handleNavigationKey: navigates backward through views and custom lists with Shift + Tab", () => {
		const { handleNavigationKey } = require("../src/composables/useKeyboardShortcuts.ts");
		const listStore = useListStore();
		const filterStore = useFilterStore();
		const uiStore = useUIStore();
		const taskStore = useTaskStore();

		listStore.lists = [
			{
				id: "inbox-id",
				name: "Inbox",
				color: "#3b82f6",
				position: 0,
				created_at: "",
				updated_at: "",
				deleted_at: null,
			},
			{
				id: "work-id",
				name: "Work",
				color: "#10b981",
				position: 1,
				created_at: "",
				updated_at: "",
				deleted_at: null,
			},
			{
				id: "personal-id",
				name: "Personal",
				color: "#6366f1",
				position: 2,
				created_at: "",
				updated_at: "",
				deleted_at: null,
			},
		];

		function tabEvent(shift = false, ctrl = false, target: any = null) {
			let prevented = false;
			return {
				key: "Tab",
				shiftKey: shift,
				ctrlKey: ctrl,
				metaKey: false,
				altKey: false,
				target,
				preventDefault: () => {
					prevented = true;
				},
				get defaultPrevented() {
					return prevented;
				},
			} as unknown as KeyboardEvent;
		}

		// When on inbox, Shift + Tab wraps around to the last custom list ('personal-id')
		listStore.setActiveView("inbox");
		const e1 = tabEvent(true);
		const res1 = handleNavigationKey(e1, listStore, filterStore, uiStore, taskStore);
		expect(res1).toBe(true);
		expect(e1.defaultPrevented).toBe(true);
		expect(listStore.activeView).toBe(null);
		expect(listStore.activeListId).toBe("personal-id");

		// Shift + Tab again -> 'work-id'
		const e2 = tabEvent(true);
		handleNavigationKey(e2, listStore, filterStore, uiStore, taskStore);
		expect(listStore.activeView).toBe(null);
		expect(listStore.activeListId).toBe("work-id");

		// Shift + Tab again -> 'trash' (last smart view)
		const e3 = tabEvent(true);
		handleNavigationKey(e3, listStore, filterStore, uiStore, taskStore);
		expect(listStore.activeView).toBe("trash");
		expect(listStore.activeListId).toBe(null);
	});

	it("handleNavigationKey: does not intercept Tab when editing an input or inside an active modal", () => {
		const { handleNavigationKey } = require("../src/composables/useKeyboardShortcuts.ts");
		const listStore = useListStore();
		const filterStore = useFilterStore();
		const uiStore = useUIStore();
		const taskStore = useTaskStore();

		listStore.setActiveView("inbox");

		function createTabEvent(target: any = null) {
			let prevented = false;
			return {
				key: "Tab",
				shiftKey: false,
				ctrlKey: false,
				metaKey: false,
				altKey: false,
				target,
				preventDefault: () => {
					prevented = true;
				},
				get defaultPrevented() {
					return prevented;
				},
			} as unknown as KeyboardEvent;
		}

		// When typing in an input field, plain Tab is ignored (returns false, no preventDefault)
		const inputEl = { tagName: "INPUT" };
		const evInput = createTabEvent(inputEl);
		const handledInput = handleNavigationKey(evInput, listStore, filterStore, uiStore, taskStore);
		expect(handledInput).toBe(false);
		expect(evInput.defaultPrevented).toBe(false);
		expect(listStore.activeView).toBe("inbox");

		// When inside a modal (e.g. CaptureModal or KeyboardShortcutsModal is open)
		uiStore.toggleCapture(true);
		const evModal = createTabEvent(null);
		const handledModal = handleNavigationKey(evModal, listStore, filterStore, uiStore, taskStore);
		expect(handledModal).toBe(false);
		expect(evModal.defaultPrevented).toBe(false);
		expect(listStore.activeView).toBe("inbox");
	});

	it("handleNavigationKey: clears tag filter and deselects active task upon navigation", () => {
		const { handleNavigationKey } = require("../src/composables/useKeyboardShortcuts.ts");
		const listStore = useListStore();
		const filterStore = useFilterStore();
		const uiStore = useUIStore();
		const taskStore = useTaskStore();

		filterStore.setTagFilter("urgent");
		taskStore.setActiveTask("task-abc");
		uiStore.toggleSidebar(true);

		function createTabEvent() {
			let prevented = false;
			return {
				key: "Tab",
				shiftKey: false,
				ctrlKey: false,
				metaKey: false,
				altKey: false,
				target: null,
				preventDefault: () => {
					prevented = true;
				},
				get defaultPrevented() {
					return prevented;
				},
			} as unknown as KeyboardEvent;
		}

		const ev = createTabEvent();
		const handled = handleNavigationKey(ev, listStore, filterStore, uiStore, taskStore);
		expect(handled).toBe(true);
		expect(filterStore.selectedTag).toBe(null);
		expect(taskStore.activeTaskId).toBe(null);
		expect(uiStore.isSidebarOpen).toBe(false);
		expect(listStore.activeView).toBe("inbox");
	});

	it("handleGlobalShortcut: j and k navigate sequentially according to visual/sorted task order", () => {
		const { handleGlobalShortcut } = require("../src/composables/useKeyboardShortcuts.ts");
		const filterStore = useFilterStore();
		const listStore = useListStore();
		const taskStore = useTaskStore();
		const uiStore = useUIStore();
		const stores = { filterStore, listStore, taskStore, uiStore };

		function createKeyEvent(key: string) {
			let prevented = false;
			return {
				key,
				metaKey: false,
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				repeat: false,
				target: null,
				preventDefault: () => {
					prevented = true;
				},
				get defaultPrevented() {
					return prevented;
				},
			} as unknown as KeyboardEvent;
		}

		// Store order (raw/unsorted from API)
		taskStore.tasks = [
			{ id: "task-A", title: "Alpha", parent_id: null } as unknown as Task,
			{ id: "task-B", title: "Beta", parent_id: null } as unknown as Task,
			{ id: "task-C", title: "Gamma", parent_id: null } as unknown as Task,
		];
		taskStore.setActiveTask(null);

		// Scenario 1: Fallback without DOM (uses store order)
		expect(handleGlobalShortcut(createKeyEvent("j"), stores)).toBe(true);
		expect(taskStore.activeTaskId).toBe("task-A");
		expect(handleGlobalShortcut(createKeyEvent("j"), stores)).toBe(true);
		expect(taskStore.activeTaskId).toBe("task-B");
		expect(handleGlobalShortcut(createKeyEvent("k"), stores)).toBe(true);
		expect(taskStore.activeTaskId).toBe("task-A");

		// Scenario 2: Sorted order in DOM (e.g. sorted by due date or created date: C -> B -> A)
		const winGlobal = globalThis as unknown as { document?: unknown };
		const hadDoc = "document" in globalThis;
		const originalDoc = winGlobal.document;
		try {
			const domIds = ["task-C", "task-B", "task-A"];
			winGlobal.document = {
				querySelectorAll: (sel: string) => {
					if (sel === "[data-task-id]") {
						return domIds.map((id) => ({
							getAttribute: (attr: string) => (attr === "data-task-id" ? id : null),
						}));
					}
					return [];
				},
				querySelector: () => ({
					scrollIntoView: () => {},
				}),
			};

			taskStore.setActiveTask(null);
			// Initial j selects first sorted task (task-C)
			expect(handleGlobalShortcut(createKeyEvent("j"), stores)).toBe(true);
			expect(taskStore.activeTaskId).toBe("task-C");

			// Next j selects next sorted task (task-B)
			expect(handleGlobalShortcut(createKeyEvent("j"), stores)).toBe(true);
			expect(taskStore.activeTaskId).toBe("task-B");

			// Next j selects next sorted task (task-A)
			expect(handleGlobalShortcut(createKeyEvent("j"), stores)).toBe(true);
			expect(taskStore.activeTaskId).toBe("task-A");

			// Boundary: pressing j at the end stays at task-A
			expect(handleGlobalShortcut(createKeyEvent("j"), stores)).toBe(true);
			expect(taskStore.activeTaskId).toBe("task-A");

			// Previous k selects task-B
			expect(handleGlobalShortcut(createKeyEvent("k"), stores)).toBe(true);
			expect(taskStore.activeTaskId).toBe("task-B");

			// Previous k selects task-C
			expect(handleGlobalShortcut(createKeyEvent("k"), stores)).toBe(true);
			expect(taskStore.activeTaskId).toBe("task-C");

			// Boundary: pressing k at top stays at task-C
			expect(handleGlobalShortcut(createKeyEvent("k"), stores)).toBe(true);
			expect(taskStore.activeTaskId).toBe("task-C");

			// ArrowDown / ArrowUp behave identically to j / k
			expect(handleGlobalShortcut(createKeyEvent("ArrowDown"), stores)).toBe(true);
			expect(taskStore.activeTaskId).toBe("task-B");
			expect(handleGlobalShortcut(createKeyEvent("ArrowUp"), stores)).toBe(true);
			expect(taskStore.activeTaskId).toBe("task-C");
		} finally {
			if (hadDoc) {
				winGlobal.document = originalDoc;
			} else {
				delete (globalThis as Record<string, unknown>).document;
			}
		}
	});

	it("handleGlobalShortcut: j and k navigate through subtasks when visible in DOM", () => {
		const { handleGlobalShortcut } = require("../src/composables/useKeyboardShortcuts.ts");
		const filterStore = useFilterStore();
		const listStore = useListStore();
		const taskStore = useTaskStore();
		const uiStore = useUIStore();
		const stores = { filterStore, listStore, taskStore, uiStore };

		function createKeyEvent(key: string) {
			let prevented = false;
			return {
				key,
				metaKey: false,
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				repeat: false,
				target: null,
				preventDefault: () => {
					prevented = true;
				},
				get defaultPrevented() {
					return prevented;
				},
			} as unknown as KeyboardEvent;
		}

		const winGlobal = globalThis as unknown as { document?: unknown };
		const hadDoc = "document" in globalThis;
		const originalDoc = winGlobal.document;
		try {
			// DOM contains Parent 1 -> Subtask 1.1 -> Subtask 1.2 -> Parent 2
			const domIds = ["parent-1", "sub-1-1", "sub-1-2", "parent-2"];
			winGlobal.document = {
				querySelectorAll: (sel: string) => {
					if (sel === "[data-task-id]") {
						return domIds.map((id) => ({
							getAttribute: (attr: string) => (attr === "data-task-id" ? id : null),
						}));
					}
					return [];
				},
				querySelector: () => ({
					scrollIntoView: () => {},
				}),
			};

			taskStore.setActiveTask("parent-1");
			expect(handleGlobalShortcut(createKeyEvent("j"), stores)).toBe(true);
			expect(taskStore.activeTaskId).toBe("sub-1-1");

			expect(handleGlobalShortcut(createKeyEvent("j"), stores)).toBe(true);
			expect(taskStore.activeTaskId).toBe("sub-1-2");

			expect(handleGlobalShortcut(createKeyEvent("j"), stores)).toBe(true);
			expect(taskStore.activeTaskId).toBe("parent-2");

			expect(handleGlobalShortcut(createKeyEvent("k"), stores)).toBe(true);
			expect(taskStore.activeTaskId).toBe("sub-1-2");
		} finally {
			if (hadDoc) {
				winGlobal.document = originalDoc;
			} else {
				delete (globalThis as Record<string, unknown>).document;
			}
		}
	});

	it("handleGlobalShortcut: respects options.getVisibleTasks if provided", () => {
		const { handleGlobalShortcut } = require("../src/composables/useKeyboardShortcuts.ts");
		const filterStore = useFilterStore();
		const listStore = useListStore();
		const taskStore = useTaskStore();
		const uiStore = useUIStore();
		const stores = { filterStore, listStore, taskStore, uiStore };

		function createKeyEvent(key: string) {
			let prevented = false;
			return {
				key,
				metaKey: false,
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				repeat: false,
				target: null,
				preventDefault: () => {
					prevented = true;
				},
				get defaultPrevented() {
					return prevented;
				},
			} as unknown as KeyboardEvent;
		}

		taskStore.tasks = [
			{ id: "task-1", title: "Task 1", parent_id: null } as unknown as Task,
			{ id: "task-2", title: "Task 2", parent_id: null } as unknown as Task,
		];
		taskStore.setActiveTask("custom-2");

		const options = {
			getVisibleTasks: () => ["custom-1", "custom-2", "custom-3"],
		};

		expect(handleGlobalShortcut(createKeyEvent("j"), stores, options)).toBe(true);
		expect(taskStore.activeTaskId).toBe("custom-3");

		expect(handleGlobalShortcut(createKeyEvent("k"), stores, options)).toBe(true);
		expect(taskStore.activeTaskId).toBe("custom-2");
	});

	it("handleEscape: clears multi-selection before closing active task detail", () => {
		const { handleEscape } = require("../src/composables/useKeyboardShortcuts.ts");
		const taskStore = useTaskStore();
		const uiStore = useUIStore();

		taskStore.setActiveTask("task-1");
		uiStore.toggleDetail(true);
		taskStore.setSelectedTaskIds(["task-1", "task-2"]);

		// First Escape clears multi-selection
		expect(handleEscape(uiStore, taskStore)).toBe(true);
		expect(taskStore.selectedTaskIds.size).toBe(0);
		expect(taskStore.activeTaskId).toBe("task-1");
		expect(uiStore.isDetailOpen).toBe(true);

		// Second Escape deselects active task and closes detail pane
		expect(handleEscape(uiStore, taskStore)).toBe(true);
		expect(taskStore.activeTaskId).toBeNull();
		expect(uiStore.isDetailOpen).toBe(false);
	});

	it("handleGlobalShortcut: Cmd+A selects all visible tasks", () => {
		const { handleGlobalShortcut } = require("../src/composables/useKeyboardShortcuts.ts");
		const filterStore = useFilterStore();
		const listStore = useListStore();
		const taskStore = useTaskStore();
		const uiStore = useUIStore();
		const stores = { filterStore, listStore, taskStore, uiStore };

		taskStore.tasks = [
			{ id: "t1", title: "Task 1", parent_id: null } as unknown as Task,
			{ id: "t2", title: "Task 2", parent_id: null } as unknown as Task,
			{ id: "t3", title: "Task 3", parent_id: null } as unknown as Task,
		];

		const cmdAEvent = {
			key: "a",
			metaKey: true,
			ctrlKey: false,
			shiftKey: false,
			altKey: false,
			repeat: false,
			target: null,
			preventDefault: () => {},
			defaultPrevented: false,
		} as unknown as KeyboardEvent;

		expect(handleGlobalShortcut(cmdAEvent, stores)).toBe(true);
		expect(taskStore.selectedTaskIds.size).toBe(3);
		expect(taskStore.selectedTaskIds.has("t1")).toBe(true);
		expect(taskStore.selectedTaskIds.has("t2")).toBe(true);
		expect(taskStore.selectedTaskIds.has("t3")).toBe(true);
	});

	it("handleGlobalShortcut: deletes multiple selected tasks when pressing Delete, Backspace, or d", async () => {
		const { handleGlobalShortcut } = require("../src/composables/useKeyboardShortcuts.ts");
		const filterStore = useFilterStore();
		const listStore = useListStore();
		const taskStore = useTaskStore();
		const uiStore = useUIStore();
		const stores = { filterStore, listStore, taskStore, uiStore };

		taskStore.tasks = [
			{ id: "t1", title: "Task 1", parent_id: null } as unknown as Task,
			{ id: "t2", title: "Task 2", parent_id: null } as unknown as Task,
			{ id: "t3", title: "Task 3", parent_id: null } as unknown as Task,
		];
		taskStore.allTasks = [...taskStore.tasks];
		taskStore.setSelectedTaskIds(["t1", "t2"]);

		let deletePrevented = false;
		const deleteEvent = {
			key: "Delete",
			metaKey: false,
			ctrlKey: false,
			shiftKey: false,
			altKey: false,
			repeat: false,
			target: null,
			preventDefault: () => {
				deletePrevented = true;
			},
			get defaultPrevented() {
				return deletePrevented;
			},
		} as unknown as KeyboardEvent;

		const origDelete = taskStore.batchDelete;
		let pendingDelete: Promise<void> | undefined;
		taskStore.batchDelete = (ids) => {
			const p = origDelete(ids);
			pendingDelete = p;
			return p;
		};

		expect(handleGlobalShortcut(deleteEvent, stores)).toBe(true);
		expect(deletePrevented).toBe(true);
		await pendingDelete;

		expect(taskStore.tasks.map((t) => t.id)).toEqual(["t3"]);
		expect(taskStore.selectedTaskIds.size).toBe(0);
	});

	it("handleGlobalShortcut: completes multiple selected tasks when pressing c", async () => {
		const { handleGlobalShortcut } = require("../src/composables/useKeyboardShortcuts.ts");
		const filterStore = useFilterStore();
		const listStore = useListStore();
		const taskStore = useTaskStore();
		const uiStore = useUIStore();
		const stores = { filterStore, listStore, taskStore, uiStore };

		taskStore.tasks = [
			{ id: "t1", title: "Task 1", completed: false, parent_id: null } as unknown as Task,
			{ id: "t2", title: "Task 2", completed: false, parent_id: null } as unknown as Task,
		];
		taskStore.allTasks = [...taskStore.tasks];
		taskStore.setSelectedTaskIds(["t1", "t2"]);

		const cEvent = {
			key: "c",
			metaKey: false,
			ctrlKey: false,
			shiftKey: false,
			altKey: false,
			repeat: false,
			target: null,
			preventDefault: () => {},
			defaultPrevented: false,
		} as unknown as KeyboardEvent;

		const origUpdate = taskStore.batchUpdate;
		let pendingUpdate: Promise<Task[]> | undefined;
		taskStore.batchUpdate = (opts) => {
			const p = origUpdate(opts);
			pendingUpdate = p;
			return p;
		};

		expect(handleGlobalShortcut(cEvent, stores)).toBe(true);
		await pendingUpdate;
		expect(taskStore.selectedTaskIds.size).toBe(0);
	});

	it("handleGlobalShortcut: batch updates priority with 1, 2, 3, 4 when multiple tasks are selected", async () => {
		const { handleGlobalShortcut } = require("../src/composables/useKeyboardShortcuts.ts");
		const filterStore = useFilterStore();
		const listStore = useListStore();
		const taskStore = useTaskStore();
		const uiStore = useUIStore();
		const stores = { filterStore, listStore, taskStore, uiStore };

		taskStore.tasks = [
			{ id: "t1", title: "Task 1", priority: null, parent_id: null } as unknown as Task,
			{ id: "t2", title: "Task 2", priority: null, parent_id: null } as unknown as Task,
		];
		taskStore.allTasks = [...taskStore.tasks];

		const priorityCases = [
			{ key: "1", expected: 1 },
			{ key: "2", expected: 2 },
			{ key: "3", expected: 3 },
			{ key: "4", expected: null },
		];

		for (const { key, expected } of priorityCases) {
			taskStore.setSelectedTaskIds(["t1", "t2"]);

			let capturedOpts: { task_ids: string[]; priority?: unknown } | undefined;
			const origUpdate = taskStore.batchUpdate;
			let pendingUpdate: Promise<Task[]> | undefined;
			taskStore.batchUpdate = (opts) => {
				capturedOpts = opts;
				pendingUpdate = origUpdate(opts);
				return pendingUpdate;
			};

			const keyEvent = {
				key,
				metaKey: false,
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				repeat: false,
				target: null,
				preventDefault: () => {},
				defaultPrevented: false,
			} as unknown as KeyboardEvent;

			expect(handleGlobalShortcut(keyEvent, stores)).toBe(true);
			await pendingUpdate;

			expect(capturedOpts).toBeDefined();
			expect(capturedOpts?.task_ids).toEqual(["t1", "t2"]);
			expect(capturedOpts?.priority).toBe(expected);
		}
	});
});
