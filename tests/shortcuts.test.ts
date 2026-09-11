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

		// Set initial state: active list and tag filter
		listStore.setActiveList("list-123");
		filterStore.setTagFilter("urgent");
		filterStore.setSmartView("today");
		taskStore.setActiveTask("t1");

		expect(listStore.activeListId).toBe("list-123");
		expect(filterStore.selectedTag).toBe("urgent");
		expect(filterStore.smartView).toBe("today");
		expect(taskStore.activeTaskId).toBe("t1");

		// Trigger Calendar shortcut navigation (Cmd+C action)
		filterStore.setTagFilter(null);
		filterStore.setListFilter(null);
		filterStore.setSmartView(null);
		listStore.setActiveView("calendar");
		listStore.setActiveList(null);
		taskStore.setActiveTask(null);

		expect(listStore.activeView).toBe("calendar");
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
});
