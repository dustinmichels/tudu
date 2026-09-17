import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createPinia, setActivePinia } from "pinia";
import type { Task } from "../src/models/index.ts";
import { batchAssignTag, batchRemoveTag } from "../src/services/api.ts";
import { useTaskStore } from "../src/stores/tasks.ts";

// Mock Tauri invoke
const mockInvokes: Array<{ command: string; args?: unknown }> = [];
let mockTasks: Task[] = [];

mock.module("@tauri-apps/api/core", () => ({
	invoke: async (command: string, args?: unknown) => {
		mockInvokes.push({ command, args });

		if (command === "get_tasks") {
			const { tag } = (args as { tag?: string }) || {};
			if (tag === "urgent") {
				return mockTasks.filter((t) => t.id === "t1");
			}
			return mockTasks;
		}

		if (command === "batch_update_tasks") {
			const { input } = (args as { input: Record<string, unknown> }) || {};
			const taskIds = (input.task_ids as string[]) || [];
			const updated = mockTasks
				.filter((t) => taskIds.includes(t.id))
				.map((t) => {
					const copy = { ...t };
					if (typeof input.completed === "boolean") {
						copy.completed = input.completed;
					}
					if (input.postpone_days) {
						copy.due = "2026-09-12T00:00:00.000Z";
					}
					if (input.due !== undefined) {
						copy.due = input.due as string | null;
					}
					if (input.list_id) {
						copy.list_id = input.list_id as string;
					}
					if (input.priority !== undefined) {
						copy.priority = input.priority as Task["priority"];
					}
					return copy;
				});

			// Update in mockTasks
			for (const u of updated) {
				const idx = mockTasks.findIndex((t) => t.id === u.id);
				if (idx !== -1) mockTasks[idx] = u;
			}
			return updated;
		}

		if (command === "batch_delete_tasks") {
			const { ids } = (args as { ids: string[] }) || {};
			const idSet = new Set(ids || []);
			mockTasks = mockTasks.filter((t) => !idSet.has(t.id));
			return null;
		}

		if (command === "get_task_detail") {
			const { id } = (args as { id: string }) || {};
			const task = mockTasks.find((t) => t.id === id);
			if (!task) return null;
			return {
				...task,
				tags: [{ id: "tag-1", name: "urgent", color: "#ef4444" }],
				notes: [],
				subtasks: mockTasks.filter((t) => t.parent_id === id),
			};
		}

		if (
			command === "assign_tag" ||
			command === "remove_tag" ||
			command === "batch_assign_tag" ||
			command === "batch_remove_tag"
		) {
			return null;
		}

		return null;
	},
}));

describe("Batch Actions & Task Row Item", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		mockInvokes.length = 0;
		mockTasks = [
			{
				id: "t1",
				uid: null,
				parent_id: null,
				list_id: "l1",
				title: "Parent Task 1",
				description: null,
				due: "2026-09-10",
				is_all_day: false,
				rrule: null,
				priority: 1,
				location: null,
				url: null,
				completed: false,
				completed_at: null,
				created_at: "2026-09-10T10:00:00Z",
				updated_at: "2026-09-10T10:00:00Z",
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
				priority: 2,
				location: null,
				url: null,
				completed: false,
				completed_at: null,
				created_at: "2026-09-10T10:00:00Z",
				updated_at: "2026-09-10T10:00:00Z",
				deleted_at: null,
			},
			{
				id: "sub-1",
				uid: null,
				parent_id: "t1",
				list_id: "l1",
				title: "Subtask 1",
				description: null,
				due: null,
				is_all_day: false,
				rrule: null,
				priority: null,
				location: null,
				url: null,
				completed: true,
				completed_at: "2026-09-10T11:00:00Z",
				created_at: "2026-09-10T10:00:00Z",
				updated_at: "2026-09-10T11:00:00Z",
				deleted_at: null,
			},
			{
				id: "sub-2",
				uid: null,
				parent_id: "t1",
				list_id: "l1",
				title: "Subtask 2",
				description: null,
				due: null,
				is_all_day: false,
				rrule: null,
				priority: null,
				location: null,
				url: null,
				completed: false,
				completed_at: null,
				created_at: "2026-09-10T10:00:00Z",
				updated_at: "2026-09-10T10:00:00Z",
				deleted_at: null,
			},
		];
	});

	test("taskStore.batchUpdate invokes batch_update_tasks and updates state", async () => {
		const taskStore = useTaskStore();
		taskStore.tasks = [...mockTasks];
		taskStore.allTasks = [...mockTasks];

		const updated = await taskStore.batchUpdate({
			task_ids: ["t1", "t2"],
			completed: true,
		});

		expect(updated.length).toBe(2);
		expect(taskStore.tasks.find((t) => t.id === "t1")?.completed).toBeTrue();
		expect(taskStore.tasks.find((t) => t.id === "t2")?.completed).toBeTrue();

		const batchCall = mockInvokes.find((i) => i.command === "batch_update_tasks");
		expect(batchCall).toBeDefined();
	});

	test("taskStore.batchDelete invokes batch_delete_tasks and updates state", async () => {
		const taskStore = useTaskStore();
		taskStore.tasks = [...mockTasks];
		taskStore.allTasks = [...mockTasks];

		await taskStore.batchDelete(["t1", "t2"]);

		expect(taskStore.tasks.find((t) => t.id === "t1")).toBeUndefined();
		expect(taskStore.tasks.find((t) => t.id === "t2")).toBeUndefined();
		expect(taskStore.allTasks.find((t) => t.id === "t1")?.deleted_at).toBeTruthy();
		expect(taskStore.allTasks.find((t) => t.id === "t2")?.deleted_at).toBeTruthy();

		const batchCall = mockInvokes.find((i) => i.command === "batch_delete_tasks");
		expect(batchCall).toBeDefined();
	});

	test("taskStore computes subtask counts from allTasks", () => {
		const taskStore = useTaskStore();
		taskStore.allTasks = [...mockTasks];

		// Subtasks for parent "t1" are sub-1 (completed) and sub-2 (incomplete)
		const subtasksForT1 = taskStore.allTasks.filter(
			(t) => t.parent_id === "t1" && t.deleted_at === null,
		);
		expect(subtasksForT1.length).toBe(2);
		const incomplete = subtasksForT1.filter((t) => !t.completed).length;
		expect(incomplete).toBe(1);
	});

	test("taskStore.fetchTasks with tag parameter passes tag to get_tasks and updates tasks state", async () => {
		const taskStore = useTaskStore();
		taskStore.tasks = [...mockTasks];

		const tagged = await taskStore.fetchTasks(null, undefined, null, "urgent");
		expect(tagged.length).toBe(1);
		expect(tagged[0]?.id).toBe("t1");
		expect(taskStore.tasks.length).toBe(1);
		expect(taskStore.tasks[0]?.id).toBe("t1");

		const getTasksCall = mockInvokes.find((i) => {
			if (i.command !== "get_tasks") return false;
			if (i.args && typeof i.args === "object" && "tag" in i.args) {
				return i.args.tag === "urgent";
			}
			return false;
		});
		expect(getTasksCall).toBeDefined();
	});

	test("batchAssignTag and batchRemoveTag invoke tauri commands with taskIds and tagId", async () => {
		await batchAssignTag(["t1", "t2"], "tag-1");
		const assignCall = mockInvokes.find((i) => i.command === "batch_assign_tag");
		expect(assignCall).toBeDefined();
		expect(assignCall?.args).toEqual({ taskIds: ["t1", "t2"], tagId: "tag-1" });

		await batchRemoveTag(["t1", "t2"], "tag-1");
		const removeCall = mockInvokes.find((i) => i.command === "batch_remove_tag");
		expect(removeCall).toBeDefined();
		expect(removeCall?.args).toEqual({ taskIds: ["t1", "t2"], tagId: "tag-1" });
	});

	test("taskStore selection state: toggle, range, clear, and deletion pruning", async () => {
		const store = useTaskStore();
		store.tasks = [...mockTasks];
		store.allTasks = [...mockTasks];

		expect(store.selectedTaskIds.size).toBe(0);

		// Toggle select
		store.toggleSelectTask("t1");
		expect(store.selectedTaskIds.has("t1")).toBe(true);
		expect(store.selectedTaskIds.size).toBe(1);

		store.toggleSelectTask("t1");
		expect(store.selectedTaskIds.has("t1")).toBe(false);
		expect(store.selectedTaskIds.size).toBe(0);

		// Range select
		store.selectRange("t1", "t3", ["t1", "t2", "t3", "t4"]);
		expect(store.selectedTaskIds.has("t1")).toBe(true);
		expect(store.selectedTaskIds.has("t2")).toBe(true);
		expect(store.selectedTaskIds.has("t3")).toBe(true);
		expect(store.selectedTaskIds.has("t4")).toBe(false);
		expect(store.selectedTaskIds.size).toBe(3);

		// Clear selection
		store.clearSelection();
		expect(store.selectedTaskIds.size).toBe(0);

		// Prune on batchDelete
		store.setSelectedTaskIds(["t1", "t2", "t3"]);
		await store.batchDelete(["t1", "t2"]);
		expect(store.selectedTaskIds.has("t1")).toBe(false);
		expect(store.selectedTaskIds.has("t2")).toBe(false);
		expect(store.selectedTaskIds.has("t3")).toBe(true);
		expect(store.selectedTaskIds.size).toBe(1);

		// Prune on deleteTask
		await store.deleteTask("t3");
		expect(store.selectedTaskIds.has("t3")).toBe(false);
		expect(store.selectedTaskIds.size).toBe(0);
	});
});
