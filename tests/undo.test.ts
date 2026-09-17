import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createPinia, setActivePinia } from "pinia";
import type { Task } from "../src/models/index.ts";

let mockResponses: Record<string, unknown> = {};
let mockErrors: Record<string, string> = {};
let invokeCalls: Array<{ command: string; args?: Record<string, unknown> }> = [];

mock.module("@tauri-apps/api/core", () => ({
	invoke: async (command: string, args?: Record<string, unknown>) => {
		invokeCalls.push({ command, args });
		if (mockErrors[command]) {
			throw new Error(mockErrors[command]);
		}
		if (command in mockResponses) {
			return mockResponses[command];
		}
		return null;
	},
}));

import { handleGlobalShortcut } from "../src/composables/useKeyboardShortcuts.ts";
import { useFilterStore } from "../src/stores/filters.ts";
import { useListStore } from "../src/stores/lists.ts";
import { useTaskStore } from "../src/stores/tasks.ts";
import { useUIStore } from "../src/stores/ui.ts";
import { useUndoStore } from "../src/stores/undo.ts";

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: overrides.id ?? "t-1",
		uid: null,
		parent_id: null,
		list_id: "list-1",
		title: "Sample Task",
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
		...overrides,
	};
}

function keyEvent(init: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
	let prevented = false;
	return {
		key: init.key,
		metaKey: init.metaKey ?? false,
		ctrlKey: init.ctrlKey ?? false,
		shiftKey: init.shiftKey ?? false,
		altKey: init.altKey ?? false,
		repeat: false,
		target: init.target ?? null,
		get defaultPrevented() {
			return prevented;
		},
		preventDefault() {
			prevented = true;
		},
	} as unknown as KeyboardEvent;
}

describe("Undo", () => {
	beforeEach(() => {
		mockResponses = {};
		mockErrors = {};
		invokeCalls = [];
		setActivePinia(createPinia());
	});

	test("deleting a task records an undo that restores it", async () => {
		const taskStore = useTaskStore();
		const undoStore = useUndoStore();
		const task = makeTask({ title: "Buy milk" });
		taskStore.tasks = [task];
		taskStore.allTasks = [{ ...task }];

		await taskStore.deleteTask(task.id);

		expect(taskStore.tasks).toHaveLength(0);
		expect(undoStore.recentAction?.description).toBe('Deleted "Buy milk"');

		mockResponses.restore_task = { ...task };
		mockResponses.get_tasks = [{ ...task }];

		expect(await undoStore.undo()).toBe(true);

		const restoreCall = invokeCalls.find((c) => c.command === "restore_task");
		expect(restoreCall?.args).toEqual({ id: task.id });
		expect(taskStore.allTasks.map((t) => t.id)).toEqual([task.id]);
		expect(taskStore.allTasks[0]?.deleted_at).toBeNull();
		expect(undoStore.canUndo).toBe(false);
	});

	test("completing a task records an undo that reopens it", async () => {
		const taskStore = useTaskStore();
		const undoStore = useUndoStore();
		const task = makeTask({ title: "Ship it" });
		taskStore.tasks = [task];
		taskStore.allTasks = [{ ...task }];

		mockResponses.toggle_task_complete = { ...task, completed: true, completed_at: "now" };
		await taskStore.toggleTask(task.id);
		expect(undoStore.recentAction?.description).toBe('Completed "Ship it"');

		mockResponses.toggle_task_complete = { ...task, completed: false, completed_at: null };
		expect(await undoStore.undo()).toBe(true);

		expect(taskStore.tasks[0]?.completed).toBe(false);
		const toggles = invokeCalls.filter((c) => c.command === "toggle_task_complete");
		expect(toggles.map((c) => c.args?.completed)).toEqual([true, false]);
		// The inverse toggle must not itself enter history.
		expect(undoStore.canUndo).toBe(false);
	});

	test("per-keystroke edits are excluded; discrete field changes are not", async () => {
		const taskStore = useTaskStore();
		const undoStore = useUndoStore();
		const task = makeTask({ priority: 3 });
		taskStore.tasks = [task];
		taskStore.allTasks = [{ ...task }];

		mockResponses.update_task = { ...task, description: "typed" };
		await taskStore.updateTask({ id: task.id, description: "typed" }, { debounceMs: 0 });
		expect(undoStore.canUndo).toBe(false);

		mockResponses.update_task = { ...task, priority: 1 };
		await taskStore.updateTask({ id: task.id, priority: 1 });
		expect(undoStore.recentAction?.description).toBe('Changed priority of "Sample Task"');

		mockResponses.update_task = { ...task, priority: 3 };
		expect(await undoStore.undo()).toBe(true);
		const lastUpdate = invokeCalls.filter((c) => c.command === "update_task").pop();
		expect(lastUpdate?.args).toEqual({ task: { id: task.id, priority: 3 } });
	});

	test("a failing undo keeps its history entry", async () => {
		const taskStore = useTaskStore();
		const undoStore = useUndoStore();
		const task = makeTask();
		taskStore.tasks = [task];
		taskStore.allTasks = [{ ...task }];

		await taskStore.deleteTask(task.id);
		mockErrors.restore_task = "database locked";

		expect(await undoStore.undo()).toBe(false);
		expect(undoStore.canUndo).toBe(true);
		expect(undoStore.isUndoing).toBe(false);
	});

	test("Cmd+Z inside a text input defers to native undo", async () => {
		const taskStore = useTaskStore();
		const undoStore = useUndoStore();
		const task = makeTask();
		taskStore.tasks = [task];
		taskStore.allTasks = [{ ...task }];
		await taskStore.deleteTask(task.id);
		expect(undoStore.canUndo).toBe(true);

		const stores = {
			filterStore: useFilterStore(),
			listStore: useListStore(),
			taskStore,
			uiStore: useUIStore(),
		};

		const inInput = keyEvent({
			key: "z",
			metaKey: true,
			target: { tagName: "INPUT" } as unknown as EventTarget,
		});
		expect(handleGlobalShortcut(inInput, stores)).toBe(false);
		expect(inInput.defaultPrevented).toBe(false);

		mockResponses.restore_task = { ...task };
		const global = keyEvent({ key: "z", metaKey: true });
		expect(handleGlobalShortcut(global, stores)).toBe(true);
		expect(global.defaultPrevented).toBe(true);
	});
});
