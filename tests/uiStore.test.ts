import { beforeEach, describe, expect, mock, test } from "bun:test";

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
import { createPinia, setActivePinia } from "pinia";
import { useTaskStore } from "../src/stores/tasks.ts";
import { useUIStore } from "../src/stores/ui.ts";

describe("UI Store (useUIStore)", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	test("initializes with default responsive UI states", () => {
		const uiStore = useUIStore();
		expect(uiStore.isSidebarOpen).toBeFalse();
		expect(uiStore.isDetailOpen).toBeTrue();
		expect(uiStore.syncStatus).toBe("offline");
	});

	test("toggles sidebar drawer state", () => {
		const uiStore = useUIStore();
		uiStore.toggleSidebar();
		expect(uiStore.isSidebarOpen).toBeTrue();

		uiStore.toggleSidebar(false);
		expect(uiStore.isSidebarOpen).toBeFalse();

		uiStore.toggleSidebar(true);
		expect(uiStore.isSidebarOpen).toBeTrue();
	});

	test("toggles detail panel state", () => {
		const uiStore = useUIStore();
		expect(uiStore.isDetailOpen).toBeTrue();

		uiStore.toggleDetail();
		expect(uiStore.isDetailOpen).toBeFalse();

		uiStore.toggleDetail(true);
		expect(uiStore.isDetailOpen).toBeTrue();

		uiStore.toggleDetail(false);
		expect(uiStore.isDetailOpen).toBeFalse();
	});

	test("toggles import modal state", () => {
		const uiStore = useUIStore();
		expect(uiStore.isImportOpen).toBeFalse();

		uiStore.toggleImport();
		expect(uiStore.isImportOpen).toBeTrue();

		uiStore.toggleImport(false);
		expect(uiStore.isImportOpen).toBeFalse();
	});

	test("updates sync status", () => {
		const uiStore = useUIStore();
		expect(uiStore.syncStatus).toBe("offline");

		uiStore.setSyncStatus("syncing");
		expect(uiStore.syncStatus).toBe("syncing");

		uiStore.setSyncStatus("offline");
		expect(uiStore.syncStatus).toBe("offline");

		uiStore.setSyncStatus("error");
		expect(uiStore.syncStatus).toBe("error");

		uiStore.setSyncStatus("synced");
		expect(uiStore.syncStatus).toBe("synced");
	});

	test("switching view mode deselects current task and collapses right sidebar", () => {
		const uiStore = useUIStore();
		const taskStore = useTaskStore();

		// Start in list view with task selected and detail panel open
		expect(uiStore.viewMode).toBe("list");
		taskStore.setActiveTask("task-1");
		uiStore.toggleDetail(true);
		expect(taskStore.activeTaskId).toBe("task-1");
		expect(uiStore.isDetailOpen).toBeTrue();

		// Switch to calendar view -> task deselected and sidebar collapsed
		uiStore.setViewMode("calendar");
		expect(uiStore.viewMode).toBe("calendar");
		expect(taskStore.activeTaskId).toBeNull();
		expect(uiStore.isDetailOpen).toBeFalse();

		// Select a task and expand sidebar in calendar view
		taskStore.setActiveTask("task-2");
		uiStore.toggleDetail(true);
		expect(taskStore.activeTaskId).toBe("task-2");
		expect(uiStore.isDetailOpen).toBeTrue();

		// Switch to freeform view -> task deselected and sidebar collapsed
		uiStore.setViewMode("freeform");
		expect(uiStore.viewMode).toBe("freeform");
		expect(taskStore.activeTaskId).toBeNull();
		expect(uiStore.isDetailOpen).toBeFalse();

		// Select a task and expand sidebar in freeform view
		taskStore.setActiveTask("task-3");
		uiStore.toggleDetail(true);
		expect(taskStore.activeTaskId).toBe("task-3");
		expect(uiStore.isDetailOpen).toBeTrue();

		// Switch back to list view -> task deselected and sidebar collapsed
		uiStore.setViewMode("list");
		expect(uiStore.viewMode).toBe("list");
		expect(taskStore.activeTaskId).toBeNull();
		expect(uiStore.isDetailOpen).toBeFalse();
	});

	test("calling setViewMode with the same mode does not collapse or deselect", () => {
		const uiStore = useUIStore();
		const taskStore = useTaskStore();

		expect(uiStore.viewMode).toBe("list");
		taskStore.setActiveTask("task-1");
		uiStore.toggleDetail(true);

		uiStore.setViewMode("list");
		expect(taskStore.activeTaskId).toBe("task-1");
		expect(uiStore.isDetailOpen).toBeTrue();
	});

	test("toggleCalendarView switches between list and calendar, deselecting task and collapsing sidebar", () => {
		const uiStore = useUIStore();
		const taskStore = useTaskStore();

		expect(uiStore.viewMode).toBe("list");
		taskStore.setActiveTask("task-1");
		uiStore.toggleDetail(true);

		uiStore.toggleCalendarView();
		expect(uiStore.viewMode).toBe("calendar");
		expect(taskStore.activeTaskId).toBeNull();
		expect(uiStore.isDetailOpen).toBeFalse();

		taskStore.setActiveTask("task-2");
		uiStore.toggleDetail(true);

		uiStore.toggleCalendarView();
		expect(uiStore.viewMode).toBe("list");
		expect(taskStore.activeTaskId).toBeNull();
		expect(uiStore.isDetailOpen).toBeFalse();
	});

	test("triggerTaskCompletionAnimation activates bunny celebration and increments animation key", () => {
		const uiStore = useUIStore();
		expect(uiStore.isBunnyVisible).toBeFalse();
		expect(uiStore.bunnyAnimationKey).toBe(0);

		uiStore.triggerTaskCompletionAnimation();
		expect(uiStore.isBunnyVisible).toBeTrue();
		expect(uiStore.bunnyAnimationKey).toBe(1);

		uiStore.triggerTaskCompletionAnimation();
		expect(uiStore.isBunnyVisible).toBeTrue();
		expect(uiStore.bunnyAnimationKey).toBe(2);

		uiStore.hideBunny();
		expect(uiStore.isBunnyVisible).toBeFalse();
	});

	test("checking off a task triggers completion animation", async () => {
		const uiStore = useUIStore();
		const taskStore = useTaskStore();
		expect(uiStore.isBunnyVisible).toBeFalse();

		taskStore.tasks = [
			{
				id: "task-celebrate-1",
				uid: null,
				parent_id: null,
				list_id: "list-1",
				title: "Complete me",
				description: null,
				due: null,
				is_all_day: false,
				rrule: null,
				priority: null,
				location: null,
				url: null,
				completed: false,
				completed_at: null,
				created_at: "2026-01-01T00:00:00Z",
				updated_at: "2026-01-01T00:00:00Z",
				deleted_at: null,
			},
		];

		await taskStore.toggleTask("task-celebrate-1", true);
		expect(uiStore.isBunnyVisible).toBeTrue();
		expect(uiStore.bunnyAnimationKey).toBeGreaterThan(0);
	});
});
