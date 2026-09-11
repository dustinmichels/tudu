import { beforeEach, describe, expect, test } from "bun:test";
import { createPinia, setActivePinia } from "pinia";
import type { Task } from "../src/models/index.ts";
import {
	getSmartListCounts,
	isThisWeek,
	isTodayOrOverdue,
	isTomorrow,
	matchesSmartView,
	parseDueDateToLocal,
	querySmartList,
	queryTasks,
} from "../src/services/queryEngine.ts";
import { useFilterStore } from "../src/stores/filters.ts";
import { useListStore } from "../src/stores/lists.ts";
import { useTaskStore } from "../src/stores/tasks.ts";
import {
	compareByCompletion,
	compareByDueDate,
	compareByManual,
	compareByPriority,
	compareByTitle,
	sortByDueDate,
	sortByPriority,
	sortByTitle,
	sortTasks,
} from "../src/utils/sorting.ts";

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: overrides.id ?? `t-${Math.random().toString(36).slice(2, 8)}`,
		uid: null,
		parent_id: null,
		list_id: "list-default",
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

describe("Phase 3: Pinia Filter Store (useFilterStore)", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	test("initializes with default filter values", () => {
		const filterStore = useFilterStore();
		expect(filterStore.selectedListId).toBeNull();
		expect(filterStore.selectedTag).toBeNull();
		expect(filterStore.smartView).toBeNull();
		expect(filterStore.includeCompleted).toBeTrue();
		expect(filterStore.searchQuery).toBe("");
		expect(filterStore.sortBy).toBe("priority");
		expect(filterStore.sortOrder).toBe("asc");
		expect(filterStore.hasActiveFilter).toBeFalse();
		expect(filterStore.activeFilterType).toBe("none");
	});

	test("setting list filter updates activeFilterType and clears smartView", () => {
		const filterStore = useFilterStore();
		filterStore.setSmartView("today");
		expect(filterStore.smartView).toBe("today");

		filterStore.setListFilter("list-work");
		expect(filterStore.selectedListId).toBe("list-work");
		expect(filterStore.smartView).toBeNull();
		expect(filterStore.activeFilterType).toBe("list");
		expect(filterStore.hasActiveFilter).toBeTrue();
	});

	test("setting smart view updates activeFilterType and clears selectedListId", () => {
		const filterStore = useFilterStore();
		filterStore.setListFilter("list-work");
		expect(filterStore.selectedListId).toBe("list-work");

		filterStore.setSmartView("tomorrow");
		expect(filterStore.smartView).toBe("tomorrow");
		expect(filterStore.selectedListId).toBeNull();
		expect(filterStore.activeFilterType).toBe("smart_view");
		expect(filterStore.isSmartViewActive("tomorrow")).toBeTrue();
		expect(filterStore.isSmartViewActive("today")).toBeFalse();
	});

	test("tag filter and search query can be set and reset", () => {
		const filterStore = useFilterStore();
		filterStore.setTagFilter("urgent");
		expect(filterStore.selectedTag).toBe("urgent");

		filterStore.setSearchQuery("groceries");
		expect(filterStore.searchQuery).toBe("groceries");
		expect(filterStore.hasActiveFilter).toBeTrue();

		filterStore.resetFilters();
		expect(filterStore.selectedTag).toBeNull();
		expect(filterStore.searchQuery).toBe("");
		expect(filterStore.hasActiveFilter).toBeFalse();
	});

	test("toggleIncludeCompleted flips completion visibility", () => {
		const filterStore = useFilterStore();
		expect(filterStore.includeCompleted).toBeTrue();

		const next1 = filterStore.toggleIncludeCompleted();
		expect(next1).toBeFalse();
		expect(filterStore.includeCompleted).toBeFalse();

		const next2 = filterStore.toggleIncludeCompleted();
		expect(next2).toBeTrue();
		expect(filterStore.includeCompleted).toBeTrue();
	});

	test("setSorting updates sorting field and order", () => {
		const filterStore = useFilterStore();
		filterStore.setSorting("due", "desc");
		expect(filterStore.sortBy).toBe("due");
		expect(filterStore.sortOrder).toBe("desc");
		expect(filterStore.sortOptions).toEqual({
			field: "due",
			order: "desc",
			completedToEnd: true,
		});
	});
});

describe("Phase 3: Smart List Query Engine", () => {
	const fixedNow = new Date(2026, 8, 10, 12, 0, 0); // Sept 10, 2026

	test("parseDueDateToLocal handles YYYY-MM-DD and ISO formats", () => {
		const d1 = parseDueDateToLocal("2026-09-10");
		expect(d1?.getFullYear()).toBe(2026);
		expect(d1?.getMonth()).toBe(8);
		expect(d1?.getDate()).toBe(10);

		const d2 = parseDueDateToLocal("2026-09-10T15:30:00Z");
		expect(d2).not.toBeNull();

		expect(parseDueDateToLocal(null)).toBeNull();
		expect(parseDueDateToLocal("invalid-date")).toBeNull();
	});

	test("Today smart list includes overdue and today tasks", () => {
		// Overdue
		expect(isTodayOrOverdue("2026-09-08", fixedNow)).toBeTrue();
		expect(isTodayOrOverdue("2026-09-09", fixedNow)).toBeTrue();
		// Today
		expect(isTodayOrOverdue("2026-09-10", fixedNow)).toBeTrue();
		// Tomorrow
		expect(isTodayOrOverdue("2026-09-11", fixedNow)).toBeFalse();
		// Future
		expect(isTodayOrOverdue("2026-09-20", fixedNow)).toBeFalse();
		// No date
		expect(isTodayOrOverdue(null, fixedNow)).toBeFalse();
	});

	test("Tomorrow smart list matches exactly tomorrow's date", () => {
		expect(isTomorrow("2026-09-10", fixedNow)).toBeFalse();
		expect(isTomorrow("2026-09-11", fixedNow)).toBeTrue();
		expect(isTomorrow("2026-09-12", fixedNow)).toBeFalse();
		expect(isTomorrow(null, fixedNow)).toBeFalse();
	});

	test("This Week smart list matches tasks within next 7 days", () => {
		expect(isThisWeek("2026-09-10", fixedNow)).toBeTrue();
		expect(isThisWeek("2026-09-11", fixedNow)).toBeTrue();
		expect(isThisWeek("2026-09-17", fixedNow)).toBeTrue(); // 7 days ahead
		expect(isThisWeek("2026-09-18", fixedNow)).toBeFalse(); // 8 days ahead
		expect(isThisWeek(null, fixedNow)).toBeFalse();
	});

	test("Inbox matches tasks in the inbox list", () => {
		const inboxTask = makeTask({ list_id: "inbox-id" });
		const workTask = makeTask({ list_id: "work-id" });

		expect(
			matchesSmartView(inboxTask, "inbox", { inboxListId: "inbox-id" }),
		).toBeTrue();
		expect(
			matchesSmartView(workTask, "inbox", { inboxListId: "inbox-id" }),
		).toBeFalse();
	});

	test("All Tasks matches all non-deleted tasks", () => {
		const activeTask = makeTask({ deleted_at: null });
		const deletedTask = makeTask({ deleted_at: "2026-09-09T00:00:00Z" });

		expect(matchesSmartView(activeTask, "all")).toBeTrue();
		expect(matchesSmartView(deletedTask, "all")).toBeFalse();
	});

	test("Trash smart list matches soft-deleted tasks exclusively", () => {
		const activeTask = makeTask({ deleted_at: null });
		const deletedTask = makeTask({ deleted_at: "2026-09-09T00:00:00Z" });

		expect(matchesSmartView(deletedTask, "trash")).toBeTrue();
		expect(matchesSmartView(activeTask, "trash")).toBeFalse();

		// Non-trash views reject soft-deleted tasks
		expect(
			matchesSmartView(deletedTask, "today", { now: fixedNow }),
		).toBeFalse();
		expect(
			matchesSmartView(deletedTask, "inbox", { inboxListId: "list-default" }),
		).toBeFalse();
	});

	test("querySmartList filters collection by smart view", () => {
		const tasks: Task[] = [
			makeTask({ id: "1", list_id: "inbox-id", due: "2026-09-10" }), // Inbox, Today, This Week
			makeTask({ id: "2", list_id: "work-id", due: "2026-09-11" }), // Tomorrow, This Week
			makeTask({ id: "3", list_id: "work-id", due: "2026-09-25" }), // Future
			makeTask({ id: "4", deleted_at: "2026-09-01T00:00:00Z" }), // Trash
		];

		const inboxResults = querySmartList(tasks, "inbox", {
			inboxListId: "inbox-id",
		});
		expect(inboxResults.map((t) => t.id)).toEqual(["1"]);

		const todayResults = querySmartList(tasks, "today", { now: fixedNow });
		expect(todayResults.map((t) => t.id)).toEqual(["1"]);

		const tomorrowResults = querySmartList(tasks, "tomorrow", {
			now: fixedNow,
		});
		expect(tomorrowResults.map((t) => t.id)).toEqual(["2"]);

		const thisWeekResults = querySmartList(tasks, "this_week", {
			now: fixedNow,
		});
		expect(thisWeekResults.map((t) => t.id)).toEqual(["1", "2"]);

		const allResults = querySmartList(tasks, "all");
		expect(allResults.map((t) => t.id)).toEqual(["1", "2", "3"]);

		const trashResults = querySmartList(tasks, "trash");
		expect(trashResults.map((t) => t.id)).toEqual(["4"]);
	});

	test("getSmartListCounts calculates incomplete and total counts accurately", () => {
		const tasks: Task[] = [
			makeTask({
				id: "1",
				list_id: "inbox-id",
				due: "2026-09-10",
				completed: false,
			}),
			makeTask({
				id: "2",
				list_id: "inbox-id",
				due: "2026-09-10",
				completed: true,
			}),
			makeTask({
				id: "3",
				list_id: "work-id",
				due: "2026-09-11",
				completed: false,
			}),
			makeTask({
				id: "4",
				deleted_at: "2026-09-01T00:00:00Z",
				completed: false,
			}),
		];

		const counts = getSmartListCounts(tasks, {
			inboxListId: "inbox-id",
			now: fixedNow,
		});

		expect(counts.inbox).toEqual({ total: 2, incomplete: 1 });
		expect(counts.today).toEqual({ total: 2, incomplete: 1 });
		expect(counts.tomorrow).toEqual({ total: 1, incomplete: 1 });
		expect(counts.this_week).toEqual({ total: 3, incomplete: 2 });
		expect(counts.all).toEqual({ total: 3, incomplete: 2 });
		expect(counts.trash).toEqual({ total: 1, incomplete: 1 });
	});

	test("queryTasks combines filters, search query, and sorting", () => {
		const tasks: Task[] = [
			makeTask({
				id: "1",
				title: "Buy milk",
				due: "2026-09-10",
				priority: 1,
				completed: false,
			}),
			makeTask({
				id: "2",
				title: "Read book",
				due: "2026-09-10",
				priority: 3,
				completed: false,
			}),
			makeTask({
				id: "3",
				title: "Buy groceries",
				due: "2026-09-10",
				priority: 2,
				completed: true,
			}),
			makeTask({
				id: "4",
				title: "Write code",
				due: "2026-09-20",
				priority: 1,
				completed: false,
			}),
		];

		// Filter incomplete tasks matching "buy" sorted by priority
		const result = queryTasks(tasks, {
			smartView: "today",
			completion: "incomplete",
			searchQuery: "buy",
			sort: { field: "priority", order: "asc" },
			now: fixedNow,
		});

		expect(result.length).toBe(1);
		expect(result[0]?.title).toBe("Buy milk");
	});
});

describe("Phase 3: Sorting Utilities", () => {
	test("compareByPriority sorts P1 -> P2 -> P3 -> null in ascending order", () => {
		const t1 = makeTask({ id: "1", priority: 1 });
		const t2 = makeTask({ id: "2", priority: 2 });
		const t3 = makeTask({ id: "3", priority: 3 });
		const tNone = makeTask({ id: "4", priority: null });

		expect(compareByPriority(t1, t2, "asc")).toBeLessThan(0);
		expect(compareByPriority(t2, t1, "asc")).toBeGreaterThan(0);
		expect(compareByPriority(t1, tNone, "asc")).toBeLessThan(0);
		expect(compareByPriority(tNone, t1, "asc")).toBeGreaterThan(0);

		const sortedAsc = sortByPriority([t3, tNone, t1, t2], "asc");
		expect(sortedAsc.map((t) => t.id)).toEqual(["1", "2", "3", "4"]);

		const sortedDesc = sortByPriority([t3, tNone, t1, t2], "desc");
		expect(sortedDesc.map((t) => t.id)).toEqual(["3", "2", "1", "4"]);
	});

	test("compareByDueDate sorts earliest first with nulls at the end", () => {
		const tEarly = makeTask({ id: "early", due: "2026-09-01" });
		const tLate = makeTask({ id: "late", due: "2026-09-15" });
		const tNoDue = makeTask({ id: "no-due", due: null });

		expect(compareByDueDate(tEarly, tLate, "asc")).toBeLessThan(0);
		expect(compareByDueDate(tLate, tEarly, "asc")).toBeGreaterThan(0);
		expect(compareByDueDate(tEarly, tNoDue, "asc")).toBeLessThan(0);

		const sortedAsc = sortByDueDate([tLate, tNoDue, tEarly], "asc");
		expect(sortedAsc.map((t) => t.id)).toEqual(["early", "late", "no-due"]);

		const sortedDesc = sortByDueDate([tLate, tNoDue, tEarly], "desc");
		expect(sortedDesc.map((t) => t.id)).toEqual(["late", "early", "no-due"]);
	});

	test("compareByTitle sorts alphabetically case-insensitively", () => {
		const tA = makeTask({ id: "A", title: "apple" });
		const tB = makeTask({ id: "B", title: "Banana" });
		const tC = makeTask({ id: "C", title: "cherry" });

		expect(compareByTitle(tA, tB, "asc")).toBeLessThan(0);
		expect(compareByTitle(tB, tA, "asc")).toBeGreaterThan(0);

		const sortedAsc = sortByTitle([tB, tC, tA], "asc");
		expect(sortedAsc.map((t) => t.id)).toEqual(["A", "B", "C"]);

		const sortedDesc = sortByTitle([tB, tC, tA], "desc");
		expect(sortedDesc.map((t) => t.id)).toEqual(["C", "B", "A"]);
	});

	test("compareByManual uses custom manual order or falls back to created_at", () => {
		const t1 = makeTask({ id: "id-1", created_at: "2026-01-01" });
		const t2 = makeTask({ id: "id-2", created_at: "2026-01-02" });
		const t3 = makeTask({ id: "id-3", created_at: "2026-01-03" });

		expect(compareByManual(t1, t2, "asc")).toBeLessThan(0);
		expect(compareByManual(t2, t1, "asc")).toBeGreaterThan(0);

		// Manual order specified as an array of IDs
		const manualOrder = ["id-3", "id-1", "id-2"];
		const sortedManual = sortTasks([t1, t2, t3], {
			field: "manual",
			manualOrder,
		});
		expect(sortedManual.map((t) => t.id)).toEqual(["id-3", "id-1", "id-2"]);

		// Fallback to created_at
		const sortedCreated = sortTasks([t3, t1, t2], { field: "manual" });
		expect(sortedCreated.map((t) => t.id)).toEqual(["id-1", "id-2", "id-3"]);
	});

	test("completedToEnd keeps completed tasks at bottom regardless of sort criteria", () => {
		const tP1Done = makeTask({ id: "p1-done", priority: 1, completed: true });
		const tP3Pending = makeTask({
			id: "p3-pending",
			priority: 3,
			completed: false,
		});
		const tP2Pending = makeTask({
			id: "p2-pending",
			priority: 2,
			completed: false,
		});

		const sorted = sortTasks([tP1Done, tP3Pending, tP2Pending], {
			field: "priority",
			order: "asc",
			completedToEnd: true,
		});

		expect(sorted.map((t) => t.id)).toEqual([
			"p2-pending",
			"p3-pending",
			"p1-done",
		]);
	});

	test("compareByCompletion sorts incomplete tasks before completed tasks", () => {
		const t1 = makeTask({ id: "t1", completed: false });
		const t2 = makeTask({ id: "t2", completed: true });
		const t3 = makeTask({ id: "t3", completed: false });
		const t4 = makeTask({ id: "t4", completed: true });

		const sorted = [t2, t1, t4, t3].sort(compareByCompletion);
		expect(sorted.map((t) => t.id)).toEqual(["t1", "t3", "t2", "t4"]);
	});
});

describe("Phase 3: Task Store Smart Lists and Reactive Integration", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	test("taskStore exposes reactive smart lists and counts", () => {
		const listStore = useListStore();
		listStore.lists = [
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

		const taskStore = useTaskStore();
		const todayStr = new Date().toISOString().slice(0, 10);
		const tomorrowDate = new Date();
		tomorrowDate.setDate(tomorrowDate.getDate() + 1);
		const tomorrowStr = tomorrowDate.toISOString().slice(0, 10);

		taskStore.allTasks = [
			makeTask({ id: "t-inbox", list_id: "inbox-1", completed: false }),
			makeTask({
				id: "t-today",
				list_id: "inbox-1",
				due: todayStr,
				completed: false,
			}),
			makeTask({
				id: "t-tomorrow",
				list_id: "other",
				due: tomorrowStr,
				completed: false,
			}),
			makeTask({ id: "t-deleted", deleted_at: "2026-01-01T00:00:00Z" }),
		];

		expect(taskStore.inboxTasks.length).toBe(2);
		expect(taskStore.todayTasks.length).toBe(1);
		expect(taskStore.tomorrowTasks.length).toBe(1);
		expect(taskStore.allTasksList.length).toBe(3);
		expect(taskStore.trashTasks.length).toBe(1);

		expect(taskStore.countInbox).toBe(2);
		expect(taskStore.countToday).toBe(1);
		expect(taskStore.countTomorrow).toBe(1);
		expect(taskStore.countTrash).toBe(1);
	});
});
