import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createPinia, setActivePinia } from "pinia";
import type { Task } from "../src/models/index.ts";

mock.module("@tauri-apps/api/core", () => ({
	invoke: async () => null,
}));

import { useTaskStore } from "../src/stores/tasks.ts";
import { useUIStore } from "../src/stores/ui.ts";

describe("Subtasks Inline UI Store & Behavior", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	test("showSubtasksInline defaults to false", () => {
		const uiStore = useUIStore();
		expect(uiStore.showSubtasksInline).toBe(false);
	});

	test("toggleSubtasksInline switches state", () => {
		const uiStore = useUIStore();
		uiStore.toggleSubtasksInline();
		expect(uiStore.showSubtasksInline).toBe(true);
		uiStore.toggleSubtasksInline();
		expect(uiStore.showSubtasksInline).toBe(false);
		uiStore.toggleSubtasksInline(true);
		expect(uiStore.showSubtasksInline).toBe(true);
	});

	test("per-task expansion when showSubtasksInline is false", () => {
		const uiStore = useUIStore();
		expect(uiStore.showSubtasksInline).toBe(false);

		// Neither task is expanded by default
		expect(uiStore.isTaskSubtasksExpanded("task-1")).toBe(false);
		expect(uiStore.isTaskSubtasksExpanded("task-2")).toBe(false);

		// Expand task-1 specifically
		uiStore.toggleTaskSubtasks("task-1");
		expect(uiStore.isTaskSubtasksExpanded("task-1")).toBe(true);
		expect(uiStore.isTaskSubtasksExpanded("task-2")).toBe(false);

		// Collapse task-1 back
		uiStore.toggleTaskSubtasks("task-1");
		expect(uiStore.isTaskSubtasksExpanded("task-1")).toBe(false);
	});

	test("per-task collapse override when showSubtasksInline is true", () => {
		const uiStore = useUIStore();
		uiStore.toggleSubtasksInline(true);
		expect(uiStore.showSubtasksInline).toBe(true);

		// Both tasks expanded by default when global toggle is true
		expect(uiStore.isTaskSubtasksExpanded("task-1")).toBe(true);
		expect(uiStore.isTaskSubtasksExpanded("task-2")).toBe(true);

		// Collapse task-1 specifically
		uiStore.toggleTaskSubtasks("task-1");
		expect(uiStore.isTaskSubtasksExpanded("task-1")).toBe(false);
		expect(uiStore.isTaskSubtasksExpanded("task-2")).toBe(true);

		// Re-expand task-1
		uiStore.toggleTaskSubtasks("task-1");
		expect(uiStore.isTaskSubtasksExpanded("task-1")).toBe(true);
	});

	test("switching global toggle clears manual overrides", () => {
		const uiStore = useUIStore();

		// Manually expand a task while global is false
		uiStore.toggleTaskSubtasks("task-1");
		expect(uiStore.isTaskSubtasksExpanded("task-1")).toBe(true);

		// Turning global ON clears manuallyExpandedTaskIds
		uiStore.toggleSubtasksInline(true);
		expect(uiStore.showSubtasksInline).toBe(true);
		expect(uiStore.isTaskSubtasksExpanded("task-1")).toBe(true);
		expect(uiStore.isTaskSubtasksExpanded("task-2")).toBe(true);

		// Collapse task-1 while global is true
		uiStore.toggleTaskSubtasks("task-1");
		expect(uiStore.isTaskSubtasksExpanded("task-1")).toBe(false);

		// Turning global OFF clears collapsed overrides
		uiStore.toggleSubtasksInline(false);
		expect(uiStore.showSubtasksInline).toBe(false);
		expect(uiStore.isTaskSubtasksExpanded("task-1")).toBe(false);
		expect(uiStore.isTaskSubtasksExpanded("task-2")).toBe(false);
	});

	test("subtask counts and filtering with taskStore", () => {
		const taskStore = useTaskStore();

		const parentTask: Task = {
			id: "parent-1",
			uid: null,
			parent_id: null,
			list_id: "list-1",
			title: "Parent Task",
			description: null,
			due: null,
			is_all_day: false,
			rrule: null,
			priority: null,
			location: null,
			url: null,
			completed: false,
			completed_at: null,
			created_at: "2026-01-01",
			updated_at: "2026-01-01",
			deleted_at: null,
		};

		const subtask1: Task = {
			id: "sub-1",
			uid: null,
			parent_id: "parent-1",
			list_id: "list-1",
			title: "Subtask 1",
			description: null,
			due: null,
			is_all_day: false,
			rrule: null,
			priority: 1,
			location: null,
			url: null,
			completed: false,
			completed_at: null,
			created_at: "2026-01-01",
			updated_at: "2026-01-01",
			deleted_at: null,
		};

		const subtask2: Task = {
			id: "sub-2",
			uid: null,
			parent_id: "parent-1",
			list_id: "list-1",
			title: "Subtask 2",
			description: null,
			due: null,
			is_all_day: false,
			rrule: null,
			priority: null,
			location: null,
			url: null,
			completed: true,
			completed_at: "2026-01-02",
			created_at: "2026-01-01",
			updated_at: "2026-01-02",
			deleted_at: null,
		};

		taskStore.allTasks = [parentTask, subtask1, subtask2];
		taskStore.tasks = [parentTask, subtask1, subtask2];

		// rootTasks only includes tasks without parent_id
		expect(taskStore.rootTasks.length).toBe(1);
		expect(taskStore.rootTasks[0]?.id).toBe("parent-1");

		// subtasks under parent
		const subtasks = taskStore.allTasks.filter(
			(t) => t.parent_id === "parent-1" && t.deleted_at === null,
		);
		expect(subtasks.length).toBe(2);

		const activeSubtasks = subtasks.filter((t) => !t.completed);
		expect(activeSubtasks.length).toBe(1);
		expect(activeSubtasks[0]?.id).toBe("sub-1");
	});
});
