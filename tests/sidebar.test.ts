import { beforeEach, describe, expect, test } from "bun:test";
import { createPinia, setActivePinia } from "pinia";
import type { Task } from "../src/models/index.ts";
import { useFilterStore } from "../src/stores/filters.ts";
import { useListStore } from "../src/stores/lists.ts";
import { useTagStore } from "../src/stores/tags.ts";
import { useTaskStore } from "../src/stores/tasks.ts";

function makeTask(partial: Partial<Task>): Task {
	return {
		id: "task-1",
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
		status: "needs_action",
		start: null,
		duration: null,
		timezone: null,
		percent_complete: 0,
		color: null,
		position: 0,
		geo_latitude: null,
		geo_longitude: null,
		geo: null,
		extra: null,
		created_at: "2026-09-10T10:00:00Z",
		updated_at: "2026-09-10T10:00:00Z",
		deleted_at: null,
		...partial,
	};
}

describe("Left Sidebar (Navigation & Lists)", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	describe("1. Smart views with real-time badges", () => {
		test("taskStore computes real-time badges for inbox, all, today, tomorrow, this_week, and trash", () => {
			const listStore = useListStore();
			const taskStore = useTaskStore();

			listStore.lists = [
				{
					id: "inbox-1",
					name: "Inbox",
					color: null,
					position: 0,
					created_at: "2026-09-10T00:00:00Z",
					updated_at: "2026-09-10T00:00:00Z",
					deleted_at: null,
				},
			];

			const now = new Date();
			const todayStr = now.toISOString().slice(0, 10);
			const tomorrow = new Date(now);
			tomorrow.setDate(tomorrow.getDate() + 1);
			const tomorrowStr = tomorrow.toISOString().slice(0, 10);

			taskStore.allTasks = [
				// Task in inbox (also due today)
				makeTask({
					id: "t1",
					list_id: "inbox-1",
					due: todayStr,
					completed: false,
				}),
				// Task due tomorrow
				makeTask({
					id: "t2",
					list_id: "work-1",
					due: tomorrowStr,
					completed: false,
				}),
				// Completed task (should not count towards incomplete badges)
				makeTask({
					id: "t3",
					list_id: "inbox-1",
					due: todayStr,
					completed: true,
				}),
				// Soft-deleted task (counts toward trash)
				makeTask({
					id: "t4",
					list_id: "inbox-1",
					completed: false,
					deleted_at: "2026-09-10T10:00:00Z",
				}),
			];

			expect(taskStore.countInbox).toBe(1);
			expect(taskStore.countToday).toBe(1);
			expect(taskStore.countTomorrow).toBe(1);
			expect(taskStore.countThisWeek).toBe(2);
			expect(taskStore.countAll).toBe(2);
			expect(taskStore.countTrash).toBe(1);
		});
	});

	describe("2. Custom list counts and overdue badges", () => {
		test("getListCount and getListOverdueCount calculate incomplete and overdue tasks per list", () => {
			const taskStore = useTaskStore();

			taskStore.allTasks = [
				// Overdue incomplete task in list-work
				makeTask({
					id: "t1",
					list_id: "list-work",
					due: "2020-01-01",
					completed: false,
				}),
				// Future incomplete task in list-work
				makeTask({
					id: "t2",
					list_id: "list-work",
					due: "2099-01-01",
					completed: false,
				}),
				// Overdue completed task in list-work (should NOT count as overdue or incomplete)
				makeTask({
					id: "t3",
					list_id: "list-work",
					due: "2020-01-01",
					completed: true,
				}),
				// Soft-deleted task in list-work
				makeTask({
					id: "t4",
					list_id: "list-work",
					due: "2020-01-01",
					completed: false,
					deleted_at: "2026-09-10T10:00:00Z",
				}),
				// Task in another list
				makeTask({
					id: "t5",
					list_id: "list-personal",
					due: "2020-01-01",
					completed: false,
				}),
			];

			expect(taskStore.getListCount("list-work")).toBe(2);
			expect(taskStore.getListOverdueCount("list-work")).toBe(1);

			expect(taskStore.getListCount("list-personal")).toBe(1);
			expect(taskStore.getListOverdueCount("list-personal")).toBe(1);

			expect(taskStore.getListCount("non-existent")).toBe(0);
			expect(taskStore.getListOverdueCount("non-existent")).toBe(0);
		});
	});

	describe("3. Tag extraction and filter navigation", () => {
		test("tagStore extracts unique tags and calculates real-time task counts", () => {
			const tagStore = useTagStore();
			const taskStore = useTaskStore();

			tagStore.tags = [
				{
					id: "tag-1",
					name: "frontend",
					color: "#10b981",
					created_at: "2026-09-10T00:00:00Z",
					updated_at: "2026-09-10T00:00:00Z",
					deleted_at: null,
					task_count: 0,
					taskCount: 0,
				},
				{
					id: "tag-2",
					name: "backend",
					color: null,
					created_at: "2026-09-10T00:00:00Z",
					updated_at: "2026-09-10T00:00:00Z",
					deleted_at: null,
					task_count: 0,
					taskCount: 0,
				},
			];

			taskStore.allTasks = [
				// Active task with string tags
				{
					...makeTask({ id: "t1", completed: false }),
					tags: ["frontend", "urgent"],
				} as unknown as Task,
				// Active task with object tags
				{
					...makeTask({ id: "t2", completed: false }),
					tags: [{ id: "tag-1", name: "frontend" }],
				} as unknown as Task,
				// Completed task with tag
				{
					...makeTask({ id: "t3", completed: true }),
					tags: ["urgent"],
				} as unknown as Task,
			];

			const tags = tagStore.tagsWithCounts;
			expect(tags.length).toBe(3); // frontend, backend, urgent

			const frontendTag = tags.find((t) => t.name === "frontend");
			expect(frontendTag?.taskCount).toBe(2);

			const backendTag = tags.find((t) => t.name === "backend");
			expect(backendTag?.taskCount).toBe(0);

			const urgentTag = tags.find((t) => t.name === "urgent");
			expect(urgentTag?.taskCount).toBe(1); // completed task t3 does not increment taskCount
		});

		test("tag filter navigation updates filterStore and coordinates with list selection", () => {
			const filterStore = useFilterStore();
			const listStore = useListStore();

			listStore.setActiveList("list-1");
			expect(listStore.activeListId).toBe("list-1");

			// Setting tag filter
			filterStore.setTagFilter("urgent");
			expect(filterStore.selectedTag).toBe("urgent");

			// Resetting tag filter
			filterStore.setTagFilter(null);
			expect(filterStore.selectedTag).toBeNull();
		});
	});

	describe("4. DefaultView type expansion", () => {
		test("listStore accepts expanded DefaultView including inbox, all, and trash", () => {
			const listStore = useListStore();

			listStore.setActiveView("inbox");
			expect(listStore.activeView).toBe("inbox");
			expect(listStore.activeListId).toBeNull();

			listStore.setActiveView("all");
			expect(listStore.activeView).toBe("all");

			listStore.setActiveView("trash");
			expect(listStore.activeView).toBe("trash");

			listStore.setActiveView("today");
			expect(listStore.activeView).toBe("today");

			listStore.setActiveList("list-1");
			expect(listStore.activeListId).toBe("list-1");
			expect(listStore.activeView).toBeNull();
		});
	});

	describe("5. GTD special lists and customLists filtering", () => {
		test("customLists excludes Inbox and GTD lists (Next actions, Waiting on, Someday/Maybe)", () => {
			const listStore = useListStore();

			listStore.lists = [
				{
					id: "inbox-1",
					name: "Inbox",
					color: null,
					position: 0,
					created_at: "2026-09-10T00:00:00Z",
					updated_at: "2026-09-10T00:00:00Z",
					deleted_at: null,
				},
				{
					id: "next-1",
					name: "Next actions",
					color: "#f59e0b",
					position: 1,
					created_at: "2026-09-10T00:00:00Z",
					updated_at: "2026-09-10T00:00:00Z",
					deleted_at: null,
				},
				{
					id: "wait-1",
					name: "Waiting on",
					color: "#f97316",
					position: 2,
					created_at: "2026-09-10T00:00:00Z",
					updated_at: "2026-09-10T00:00:00Z",
					deleted_at: null,
				},
				{
					id: "someday-1",
					name: "Someday/Maybe",
					color: "#eab308",
					position: 3,
					created_at: "2026-09-10T00:00:00Z",
					updated_at: "2026-09-10T00:00:00Z",
					deleted_at: null,
				},
				{
					id: "work-1",
					name: "Work",
					color: "#3b82f6",
					position: 4,
					created_at: "2026-09-10T00:00:00Z",
					updated_at: "2026-09-10T00:00:00Z",
					deleted_at: null,
				},
				{
					id: "personal-1",
					name: "Personal",
					color: "#10b981",
					position: 5,
					created_at: "2026-09-10T00:00:00Z",
					updated_at: "2026-09-10T00:00:00Z",
					deleted_at: null,
				},
			];

			expect(listStore.customLists.map((l) => l.name)).toEqual(["Work", "Personal"]);
			expect(listStore.nextActionsList?.id).toBe("next-1");
			expect(listStore.waitingOnList?.id).toBe("wait-1");
			expect(listStore.somedayMaybeList?.id).toBe("someday-1");
		});

		test("listStore accepts GTD views: next_actions, waiting_on, and someday_maybe", () => {
			const listStore = useListStore();

			listStore.setActiveView("next_actions");
			expect(listStore.activeView).toBe("next_actions");
			expect(listStore.activeListId).toBeNull();

			listStore.setActiveView("waiting_on");
			expect(listStore.activeView).toBe("waiting_on");
			expect(listStore.activeListId).toBeNull();

			listStore.setActiveView("someday_maybe");
			expect(listStore.activeView).toBe("someday_maybe");
			expect(listStore.activeListId).toBeNull();
		});
	});
});
