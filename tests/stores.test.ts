import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createPinia, setActivePinia } from "pinia";
import type { List, Task } from "../src/models/index.ts";

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

import { ApiError, api } from "../src/services/api.ts";
import { useListStore } from "../src/stores/lists.ts";
import { useTagStore } from "../src/stores/tags.ts";
import { useTaskStore } from "../src/stores/tasks.ts";

describe("API Service", () => {
	beforeEach(() => {
		mockResponses = {};
		mockErrors = {};
		invokeCalls = [];
	});

	test("getLists invokes get_lists", async () => {
		const sampleLists: List[] = [
			{
				id: "l1",
				name: "Inbox",
				color: "#ff0000",
				position: 0,
				created_at: "2026-01-01",
				updated_at: "2026-01-01",
				deleted_at: null,
			},
		];
		mockResponses.get_lists = sampleLists;

		const result = await api.lists.getAll();
		expect(result).toEqual(sampleLists);
		expect(invokeCalls.length).toBe(1);
		expect(invokeCalls[0]?.command).toBe("get_lists");
	});

	test("createList passes name and color", async () => {
		const newList: List = {
			id: "l2",
			name: "Work",
			color: null,
			position: 1,
			created_at: "2026-01-01",
			updated_at: "2026-01-01",
			deleted_at: null,
		};
		mockResponses.create_list = newList;

		const result = await api.lists.create("Work");
		expect(result).toEqual(newList);
		expect(invokeCalls[0]?.command).toBe("create_list");
		expect(invokeCalls[0]?.args).toEqual({ name: "Work", color: null, icon: null });

		await api.lists.create("Shopping", "#123456", "ShoppingCart");
		expect(invokeCalls[1]?.command).toBe("create_list");
		expect(invokeCalls[1]?.args).toEqual({
			name: "Shopping",
			color: "#123456",
			icon: "ShoppingCart",
		});
	});

	test("throws ApiError on invoke failure", async () => {
		mockErrors.get_lists = "Database locked";

		try {
			await api.lists.getAll();
			expect().fail("Expected to throw");
		} catch (err) {
			expect(err).toBeInstanceOf(ApiError);
			if (err instanceof ApiError) {
				expect(err.command).toBe("get_lists");
				expect(err.message).toBe("Database locked");
			}
		}
	});

	test("createTask passes camelCase args", async () => {
		const newTask: Task = {
			id: "t1",
			uid: null,
			list_id: "l1",
			parent_id: null,
			title: "Write code",
			description: null,
			due: "2026-09-12",
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
		mockResponses.create_task = newTask;

		const result = await api.tasks.create({
			list_id: "l1",
			title: "Write code",
			due: "2026-09-12",
			priority: 1,
		});

		expect(result).toEqual(newTask);
		expect(invokeCalls[0]?.command).toBe("create_task");
		expect(invokeCalls[0]?.args).toEqual({
			listId: "l1",
			title: "Write code",
			due: "2026-09-12",
			priority: 1,
			parentId: null,
		});
	});

	test("backup export and import invoke correct commands", async () => {
		const mockDoc = {
			version: "1.0" as const,
			lists: [{ id: "l1", name: "Work" }],
			tasks: [{ id: "t1", list_id: "l1", title: "Task 1" }],
		};
		mockResponses.export_backup = mockDoc;
		mockResponses.import_backup = {
			lists_imported: 1,
			tasks_imported: 1,
			tags_imported: 0,
			notes_imported: 0,
			reminders_imported: 0,
		};

		const exported = await api.backup.export();
		expect(exported).toEqual(mockDoc);
		expect(invokeCalls[0]?.command).toBe("export_backup");

		const imported = await api.backup.import(mockDoc);
		expect(imported.tasks_imported).toBe(1);
		expect(invokeCalls[1]?.command).toBe("import_backup");
		expect(invokeCalls[1]?.args).toEqual({ document: mockDoc });
	});

	test("reminders add and delete pass correct args", async () => {
		const mockReminder = {
			id: "r1",
			task_id: "t1",
			trigger: "-PT15M",
			relative_to: "due",
			action: "display",
			description: "Alarm",
			created_at: "2026-09-10",
			updated_at: "2026-09-10",
			deleted_at: null,
		};
		mockResponses.add_reminder = mockReminder;
		mockResponses.delete_reminder = null;

		const created = await api.reminders.add({
			task_id: "t1",
			trigger: "-PT15M",
			description: "Alarm",
		});
		expect(created).toEqual(mockReminder);
		expect(invokeCalls[0]?.command).toBe("add_reminder");
		expect(invokeCalls[0]?.args).toEqual({
			taskId: "t1",
			trigger: "-PT15M",
			relativeTo: null,
			action: null,
			description: "Alarm",
		});

		await api.reminders.delete("r1");
		expect(invokeCalls[1]?.command).toBe("delete_reminder");
		expect(invokeCalls[1]?.args).toEqual({ id: "r1" });
	});

	test("getTagsWithCounts invokes get_tags_with_counts and maps counts", async () => {
		mockResponses.get_tags_with_counts = [
			{
				id: "tag-1",
				name: "urgent",
				color: "#ff0000",
				created_at: "2026-01-01",
				updated_at: "2026-01-01",
				deleted_at: null,
				task_count: 5,
			},
		];

		const result = await api.tags.getAllWithCounts();
		expect(invokeCalls.length).toBe(1);
		expect(invokeCalls[0]?.command).toBe("get_tags_with_counts");
		expect(result[0]?.task_count).toBe(5);
		expect(result[0]?.taskCount).toBe(5);
	});
});

describe("Pinia List Store (useListStore)", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		mockResponses = {};
		mockErrors = {};
		invokeCalls = [];
	});

	test("fetchLists updates reactive lists array and activeListId", async () => {
		const sampleLists: List[] = [
			{
				id: "l1",
				name: "Inbox",
				color: null,
				position: 0,
				created_at: "2026-01-01",
				updated_at: "2026-01-01",
				deleted_at: null,
			},
			{
				id: "l2",
				name: "Personal",
				color: "#00ff00",
				position: 1,
				created_at: "2026-01-01",
				updated_at: "2026-01-01",
				deleted_at: null,
			},
		];
		mockResponses.get_lists = sampleLists;

		const store = useListStore();
		expect(store.lists).toEqual([]);
		expect(store.activeListId).toBeNull();

		await store.fetchLists();

		expect(store.lists).toEqual(sampleLists);
		expect(store.activeListId).toBeNull();

		// Repair stale activeListId to Inbox
		store.activeListId = "stale-id";
		await store.fetchLists();
		expect(store.activeListId).toBe("l1");
		expect(store.activeList?.name).toBe("Inbox");
	});

	test("createList appends to lists and sets as active", async () => {
		const store = useListStore();
		const created: List = {
			id: "l3",
			name: "Projects",
			color: "#0000ff",
			position: 0,
			created_at: "2026-01-01",
			updated_at: "2026-01-01",
			deleted_at: null,
		};
		mockResponses.create_list = created;

		const res = await store.createList("Projects", "#0000ff");
		expect(res).toEqual(created);
		expect(store.lists.length).toBe(1);
		expect(store.activeListId).toBe("l3");
	});

	test("deleteList removes list from store", async () => {
		const store = useListStore();
		store.lists = [
			{
				id: "l1",
				name: "Work",
				color: null,
				position: 0,
				created_at: "2026-01-01",
				updated_at: "2026-01-01",
				deleted_at: null,
			},
			{
				id: "l2",
				name: "Personal",
				color: null,
				position: 1,
				created_at: "2026-01-01",
				updated_at: "2026-01-01",
				deleted_at: null,
			},
		];
		store.activeListId = "l1";
		mockResponses.delete_list = null;

		await store.deleteList("l1");
		expect(store.lists.length).toBe(1);
		expect(store.lists[0]?.id).toBe("l2");
		expect(store.activeListId).toBe("l2");
	});

	test("deleteList prevents deleting the default Inbox list", async () => {
		const store = useListStore();
		store.lists = [
			{
				id: "inbox-1",
				name: "Inbox",
				color: null,
				position: 0,
				created_at: "2026-01-01",
				updated_at: "2026-01-01",
				deleted_at: null,
			},
		];
		await expect(store.deleteList("inbox-1")).rejects.toThrow(
			"Cannot delete the default Inbox list",
		);
	});
});

describe("Pinia Task Store (useTaskStore)", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		mockResponses = {};
		mockErrors = {};
		invokeCalls = [];
	});

	test("fetchTasks retrieves tasks for the active list", async () => {
		const listStore = useListStore();
		listStore.activeListId = "l1";

		const sampleTasks: Task[] = [
			{
				id: "t1",
				uid: null,
				list_id: "l1",
				parent_id: null,
				title: "Buy groceries",
				description: null,
				due: null,
				is_all_day: false,
				rrule: null,
				priority: 2,
				location: null,
				url: null,
				completed: false,
				completed_at: null,
				created_at: "2026-01-01",
				updated_at: "2026-01-01",
				deleted_at: null,
			},
		];
		mockResponses.get_tasks = sampleTasks;

		const taskStore = useTaskStore();
		const result = await taskStore.fetchTasks();

		expect(result).toEqual(sampleTasks);
		expect(taskStore.tasks).toEqual(sampleTasks);
		expect(taskStore.incompleteTasks.length).toBe(1);
		expect(taskStore.completedTasks.length).toBe(0);
	});

	test("addTask creates task and adds to store", async () => {
		const listStore = useListStore();
		listStore.activeListId = "l1";

		const createdTask: Task = {
			id: "t2",
			uid: null,
			list_id: "l1",
			parent_id: null,
			title: "Schedule dentist",
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
		mockResponses.create_task = createdTask;

		const taskStore = useTaskStore();
		const res = await taskStore.addTask({ title: "Schedule dentist" });

		expect(res).toEqual(createdTask);
		expect(taskStore.tasks.length).toBe(1);
		expect(taskStore.tasks[0]?.title).toBe("Schedule dentist");
	});

	test("toggleTask toggles completion status and updates store", async () => {
		const taskStore = useTaskStore();
		const initialTask: Task = {
			id: "t1",
			uid: null,
			list_id: "l1",
			parent_id: null,
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
			created_at: "2026-01-01",
			updated_at: "2026-01-01",
			deleted_at: null,
		};
		taskStore.tasks = [initialTask];

		const toggledTask: Task = {
			...initialTask,
			completed: true,
			completed_at: "2026-09-10T12:00:00Z",
		};
		mockResponses.toggle_task_complete = toggledTask;

		const result = await taskStore.toggleTask("t1");
		expect(result.completed).toBe(true);
		expect(taskStore.tasks[0]?.completed).toBe(true);
		expect(taskStore.completedTasks.length).toBe(1);
		expect(taskStore.incompleteTasks.length).toBe(0);
	});

	test("deleteTask removes task and subtasks from store", async () => {
		const taskStore = useTaskStore();
		taskStore.tasks = [
			{
				id: "parent",
				uid: null,
				list_id: "l1",
				parent_id: null,
				title: "Parent",
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
			},
			{
				id: "child",
				uid: null,
				list_id: "l1",
				parent_id: "parent",
				title: "Child",
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
			},
			{
				id: "unrelated",
				uid: null,
				list_id: "l1",
				parent_id: null,
				title: "Unrelated",
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
			},
		];
		mockResponses.delete_task = null;

		await taskStore.deleteTask("parent");
		expect(taskStore.tasks.length).toBe(1);
		expect(taskStore.tasks[0]?.id).toBe("unrelated");
	});

	test("end-to-end list and task management flow", async () => {
		const listStore = useListStore();
		const taskStore = useTaskStore();

		// 1. Create list
		const newList: List = {
			id: "list-e2e",
			name: "Work Projects",
			color: "#10b981",
			position: 0,
			created_at: "2026-09-10T10:00:00Z",
			updated_at: "2026-09-10T10:00:00Z",
			deleted_at: null,
		};
		mockResponses.create_list = newList;
		const createdList = await listStore.createList("Work Projects", "#10b981");
		expect(createdList.id).toBe("list-e2e");
		expect(listStore.lists.length).toBe(1);
		expect(listStore.activeListId).toBe("list-e2e");
		expect(listStore.activeList?.name).toBe("Work Projects");

		// 2. Add multiple tasks to active list
		const task1: Task = {
			id: "t1",
			uid: null,
			list_id: "list-e2e",
			parent_id: null,
			title: "Wireframe UI",
			description: null,
			due: "2026-09-12",
			is_all_day: false,
			rrule: null,
			priority: 1,
			location: null,
			url: null,
			completed: false,
			completed_at: null,
			created_at: "2026-09-10T10:05:00Z",
			updated_at: "2026-09-10T10:05:00Z",
			deleted_at: null,
		};
		mockResponses.create_task = task1;
		await taskStore.addTask({ title: "Wireframe UI", priority: 1 });

		const task2: Task = {
			id: "t2",
			uid: null,
			list_id: "list-e2e",
			parent_id: null,
			title: "Implement 3-Pane Shell",
			description: null,
			due: null,
			is_all_day: false,
			rrule: null,
			priority: 2,
			location: null,
			url: null,
			completed: false,
			completed_at: null,
			created_at: "2026-09-10T10:10:00Z",
			updated_at: "2026-09-10T10:10:00Z",
			deleted_at: null,
		};
		mockResponses.create_task = task2;
		await taskStore.addTask({ title: "Implement 3-Pane Shell", priority: 2 });

		expect(taskStore.tasks.length).toBe(2);
		expect(taskStore.incompleteTasks.length).toBe(2);
		expect(taskStore.completedTasks.length).toBe(0);

		// 3. Toggle task 1 complete
		mockResponses.toggle_task_complete = {
			...task1,
			completed: true,
			completed_at: "2026-09-10T10:15:00Z",
		};
		await taskStore.toggleTask("t1", true);

		expect(taskStore.incompleteTasks.length).toBe(1);
		expect(taskStore.completedTasks.length).toBe(1);
		expect(taskStore.incompleteTasks[0]?.id).toBe("t2");

		// 4. Select task 1 for detail view
		taskStore.setActiveTask("t1");
		expect(taskStore.activeTask?.id).toBe("t1");
		expect(taskStore.activeTask?.completed).toBe(true);
	});

	test("deleting a list cascades task removal in taskStore and smart views", async () => {
		const listStore = useListStore();
		const taskStore = useTaskStore();

		listStore.lists = [
			{
				id: "inbox",
				name: "Inbox",
				color: null,
				position: 0,
				created_at: "2026-01-01",
				updated_at: "2026-01-01",
				deleted_at: null,
			},
			{
				id: "work-list",
				name: "Work",
				color: null,
				position: 1,
				created_at: "2026-01-01",
				updated_at: "2026-01-01",
				deleted_at: null,
			},
		];
		listStore.activeListId = "work-list";

		const todayStr = new Date().toISOString().split("T")[0]!;
		const taskInWork: Task = {
			id: "tw1",
			uid: null,
			list_id: "work-list",
			parent_id: null,
			title: "Work Item",
			description: null,
			due: todayStr,
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
		const taskInInbox: Task = {
			id: "ti1",
			uid: null,
			list_id: "inbox",
			parent_id: null,
			title: "Inbox Item",
			description: null,
			due: todayStr,
			is_all_day: false,
			rrule: null,
			priority: 2,
			location: null,
			url: null,
			completed: false,
			completed_at: null,
			created_at: "2026-01-01",
			updated_at: "2026-01-01",
			deleted_at: null,
		};

		taskStore.allTasks = [taskInWork, taskInInbox];
		taskStore.tasks = [taskInWork];

		expect(taskStore.allTasksList.length).toBe(2);
		expect(taskStore.todayTasks.length).toBe(2);

		// Mock backend delete_list and subsequent get_tasks returning only remaining active tasks
		mockResponses.delete_list = null;
		mockResponses.get_tasks = [taskInInbox];

		await listStore.deleteList("work-list");
		await taskStore.fetchAllTasks();

		expect(taskStore.allTasks.length).toBe(1);
		expect(taskStore.allTasks[0]?.id).toBe("ti1");
		expect(taskStore.allTasksList.some((t) => t.id === "tw1")).toBe(false);
		expect(taskStore.todayTasks.some((t) => t.id === "tw1")).toBe(false);
	});
});

describe("Pinia Tag Store (useTagStore)", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		mockResponses = {};
		mockErrors = {};
		invokeCalls = [];
	});

	test("fetchTags and loadTags retrieve tags with counts from get_tags_with_counts", async () => {
		const tagStore = useTagStore();
		mockResponses.get_tags_with_counts = [
			{
				id: "tag-1",
				name: "urgent",
				color: "#ff0000",
				created_at: "2026-01-01",
				updated_at: "2026-01-01",
				deleted_at: null,
				task_count: 3,
			},
			{
				id: "tag-2",
				name: "backend",
				color: null,
				created_at: "2026-01-01",
				updated_at: "2026-01-01",
				deleted_at: null,
				task_count: 0,
			},
		];

		const result = await tagStore.loadTags();
		expect(result.length).toBe(2);
		expect(invokeCalls[0]?.command).toBe("get_tags_with_counts");

		expect(tagStore.tagsWithCounts.length).toBe(2);
		// Sorted alphabetically: "backend" then "urgent"
		expect(tagStore.tagsWithCounts[0]?.name).toBe("backend");
		expect(tagStore.tagsWithCounts[0]?.taskCount).toBe(0);
		expect(tagStore.tagsWithCounts[1]?.name).toBe("urgent");
		expect(tagStore.tagsWithCounts[1]?.taskCount).toBe(3);
	});

	test("createTag adds tag with 0 count", async () => {
		const tagStore = useTagStore();
		mockResponses.create_tag = {
			id: "tag-new",
			name: "frontend",
			color: "#00ff00",
			created_at: "2026-01-01",
			updated_at: "2026-01-01",
			deleted_at: null,
		};

		const created = await tagStore.createTag("frontend", "#00ff00");
		expect(created.id).toBe("tag-new");
		expect(created.taskCount).toBe(0);
		expect(created.task_count).toBe(0);
		expect(tagStore.tags.length).toBe(1);
		expect(tagStore.tagsWithCounts[0]?.taskCount).toBe(0);
	});
});
