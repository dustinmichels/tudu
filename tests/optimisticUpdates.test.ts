import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { createPinia, setActivePinia } from "pinia";
import type { Task, UpdateTaskInput } from "../src/models/index.ts";
import { useTaskStore } from "../src/stores/tasks.ts";

let mockTasks: Task[] = [];
let updateCallCount = 0;
let updateHistory: UpdateTaskInput[] = [];
let shouldFailNextUpdate = false;
let pendingInFlightResolver: (() => void) | null = null;

interface UpdateCommandArgs {
	task: UpdateTaskInput;
}

interface ToggleCommandArgs {
	id: string;
	completed: boolean;
}

interface BatchCommandArgs {
	input: {
		task_ids: string[];
		completed?: boolean;
		priority?: number | null;
		due?: string | null;
		postpone_days?: number;
	};
}

mock.module("@tauri-apps/api/core", () => ({
	invoke: async (command: string, args?: unknown) => {
		if (command === "get_tasks") {
			return [...mockTasks];
		}
		if (command === "update_task") {
			updateCallCount++;
			if (pendingInFlightResolver) {
				const { promise, resolve } = Promise.withResolvers<void>();
				pendingInFlightResolver = resolve;
				await promise;
			}
			if (shouldFailNextUpdate) {
				throw new Error("Database error occurred");
			}
			const payload = (args as UpdateCommandArgs).task;
			updateHistory.push({ ...payload });
			const idx = mockTasks.findIndex((t) => t.id === payload.id);
			if (idx === -1) throw new Error("Task not found");
			const existing = mockTasks[idx];
			if (!existing) throw new Error("Task not found");
			const updated: Task = {
				...existing,
				...payload,
				updated_at: new Date().toISOString(),
			};
			mockTasks[idx] = updated;
			return updated;
		}
		if (command === "toggle_task_complete") {
			const toggleArgs = args as ToggleCommandArgs;
			const id = toggleArgs.id;
			const completed = toggleArgs.completed;
			const idx = mockTasks.findIndex((t) => t.id === id);
			if (idx === -1) throw new Error("Task not found");
			const existing = mockTasks[idx];
			if (!existing) throw new Error("Task not found");
			const updated: Task = {
				...existing,
				completed,
				completed_at: completed ? new Date().toISOString() : null,
			};
			mockTasks[idx] = updated;
			return updated;
		}
		if (command === "batch_update_tasks") {
			const batchArgs = args as BatchCommandArgs;
			const input = batchArgs.input;
			const updatedList: Task[] = [];
			for (const id of input.task_ids) {
				const idx = mockTasks.findIndex((t) => t.id === id);
				if (idx !== -1) {
					const existing = mockTasks[idx];
					if (existing) {
						const updated: Task = {
							...existing,
							...(input.completed !== undefined ? { completed: input.completed } : {}),
							...(input.priority !== undefined
								? { priority: input.priority as Task["priority"] }
								: {}),
							...(input.due !== undefined ? { due: input.due } : {}),
						};
						if (input.postpone_days) {
							const d = new Date();
							d.setDate(d.getDate() + input.postpone_days);
							updated.due = d.toISOString().slice(0, 10);
						}
						mockTasks[idx] = updated;
						updatedList.push(updated);
					}
				}
			}
			return updatedList;
		}
		return [];
	},
}));

describe("Optimistic Updates, Quick Actions & Keyboard Shortcuts", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		mockTasks = [
			{
				id: "task-1",
				uid: null,
				parent_id: null,
				list_id: "list-inbox",
				title: "Initial Task",
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
		updateCallCount = 0;
		updateHistory = [];
		shouldFailNextUpdate = false;
		pendingInFlightResolver = null;
	});

	it("applies optimistic update synchronously to both tasks and allTasks", async () => {
		const store = useTaskStore();
		await store.fetchTasks("list-inbox");
		await store.fetchAllTasks();

		// Kick off update with debounceMs: 0 for immediate determinism
		const updatePromise = store.updateTask(
			{ id: "task-1", title: "Optimistic Title", location: "Office" },
			{ debounceMs: 0 },
		);

		// Synchronous check: immediately visible in store state
		const inTasks = store.tasks.find((t) => t.id === "task-1");
		const inAll = store.allTasks.find((t) => t.id === "task-1");
		expect(inTasks?.title).toBe("Optimistic Title");
		expect(inTasks?.location).toBe("Office");
		expect(inAll?.title).toBe("Optimistic Title");
		expect(inAll?.location).toBe("Office");

		// Await persistence
		const result = await updatePromise;
		expect(result.title).toBe("Optimistic Title");
		expect(updateCallCount).toBe(1);
		expect(updateHistory[0]?.title).toBe("Optimistic Title");
		expect(updateHistory[0]?.location).toBe("Office");
	});

	it("coalesces rapid consecutive updates into a single database write", async () => {
		const store = useTaskStore();
		await store.fetchTasks("list-inbox");
		await store.fetchAllTasks();

		// Rapid calls
		const p1 = store.updateTask({ id: "task-1", location: "Loc 1" }, { debounceMs: 10 });
		const p2 = store.updateTask({ id: "task-1", location: "Loc 2" }, { debounceMs: 10 });
		const p3 = store.updateTask({ id: "task-1", location: "Loc Final" }, { debounceMs: 10 });

		// Check immediate optimistic mutation has final value
		expect(store.tasks.find((t) => t.id === "task-1")?.location).toBe("Loc Final");
		expect(store.allTasks.find((t) => t.id === "task-1")?.location).toBe("Loc Final");

		const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

		expect(r1.location).toBe("Loc Final");
		expect(r2.location).toBe("Loc Final");
		expect(r3.location).toBe("Loc Final");
		expect(updateCallCount).toBe(1);
		expect(updateHistory[0]?.location).toBe("Loc Final");
	});

	it("preserves edit arriving while previous request is in flight without early flush", async () => {
		const store = useTaskStore();
		await store.fetchTasks("list-inbox");
		await store.fetchAllTasks();

		// Set flag so invoke holds until we resolve it
		pendingInFlightResolver = () => {};

		// Immediate flush for request A; it enters invoke and pauses
		const pA = store.updateTask({ id: "task-1", title: "Title A" }, { debounceMs: 0 });

		// Request B arrives while A is paused in-flight with debounceMs: 20
		const pB = store.updateTask({ id: "task-1", title: "Title B" }, { debounceMs: 20 });

		// Wait 40ms so B's timer expires while A is STILL in-flight
		// This exercises processDebounceQueue entering while activePromise is set
		await new Promise((resolve) => setTimeout(resolve, 40));

		// Assert only request A has reached the backend so far
		expect(updateCallCount).toBe(1);

		// Release request A
		if (pendingInFlightResolver) {
			const releaseA = pendingInFlightResolver;
			pendingInFlightResolver = null;
			releaseA();
		}

		const resA = await pA;
		expect(resA.title).toBe("Title A");

		// Now B should execute and complete
		const resB = await pB;
		expect(resB.title).toBe("Title B");
		expect(updateCallCount).toBe(2);
		expect(updateHistory[0]?.title).toBe("Title A");
		expect(updateHistory[1]?.title).toBe("Title B");
	});

	it("supports postponeTask action and updates task state", async () => {
		const store = useTaskStore();
		await store.fetchTasks("list-inbox");
		await store.fetchAllTasks();

		const postponed = await store.postponeTask("task-1", 2);
		expect(postponed).not.toBeNull();
		expect(postponed?.due).toBeDefined();
	});

	it("handles optimistic complete toggle", async () => {
		const store = useTaskStore();
		await store.fetchTasks("list-inbox");
		await store.fetchAllTasks();

		const firstTask = store.tasks[0];
		const firstAllTask = store.allTasks[0];
		expect(firstTask?.completed).toBe(false);
		const togglePromise = store.toggleTask("task-1", true);
		expect(firstTask?.completed).toBe(true);
		expect(firstAllTask?.completed).toBe(true);

		const res = await togglePromise;
		expect(res.completed).toBe(true);
	});

	it("rolls back optimistic changes when database write fails", async () => {
		const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
		try {
			const store = useTaskStore();
			await store.fetchTasks("list-inbox");
			await store.fetchAllTasks();

			shouldFailNextUpdate = true;
			const updatePromise = store.updateTask(
				{ id: "task-1", title: "Should Fail" },
				{ debounceMs: 0 },
			);

			// Optimistic before failure
			expect(store.tasks.find((t) => t.id === "task-1")?.title).toBe("Should Fail");

			try {
				await updatePromise;
				expect(true).toBe(false); // Should not reach
			} catch (err) {
				expect(err).toBeDefined();
			}

			// Rolled back to initial title
			expect(store.tasks.find((t) => t.id === "task-1")?.title).toBe("Initial Task");
			expect(store.allTasks.find((t) => t.id === "task-1")?.title).toBe("Initial Task");
		} finally {
			consoleSpy.mockRestore();
		}
	});
});
