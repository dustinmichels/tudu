import { describe, expect, test } from "bun:test";
import type { Task } from "../src/models/index.ts";
import {
	getSmartListCounts,
	isOverdue,
	isThisWeek,
	isThisWeekOrOverdue,
	isToday,
	isTodayOrOverdue,
	isTomorrow,
	matchesSmartView,
	parseDueDateToLocal,
	querySmartList,
	queryTasks,
} from "../src/services/queryEngine.ts";

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

describe("Smart List Query Engine - Helper Date Predicates", () => {
	const fixedNow = new Date(2026, 8, 10, 12, 0, 0); // Sept 10, 2026

	test("isToday strictly matches dates on the current day", () => {
		expect(isToday("2026-09-10", fixedNow)).toBeTrue();
		expect(isToday("2026-09-10T08:30:00", fixedNow)).toBeTrue();
		expect(isToday("2026-09-10T23:59:59", fixedNow)).toBeTrue();

		// Yesterday / Overdue
		expect(isToday("2026-09-09", fixedNow)).toBeFalse();
		expect(isToday("2026-08-10", fixedNow)).toBeFalse();

		// Tomorrow / Future
		expect(isToday("2026-09-11", fixedNow)).toBeFalse();
		expect(isToday("2026-09-20", fixedNow)).toBeFalse();

		// Null or invalid
		expect(isToday(null, fixedNow)).toBeFalse();
		expect(isToday(undefined, fixedNow)).toBeFalse();
		expect(isToday("invalid", fixedNow)).toBeFalse();
	});

	test("isThisWeekOrOverdue matches any date up to 7 days in future, including overdue", () => {
		// Overdue
		expect(isThisWeekOrOverdue("2026-08-01", fixedNow)).toBeTrue();
		expect(isThisWeekOrOverdue("2026-09-09", fixedNow)).toBeTrue();

		// Today
		expect(isThisWeekOrOverdue("2026-09-10", fixedNow)).toBeTrue();

		// Tomorrow through 7 days ahead
		expect(isThisWeekOrOverdue("2026-09-11", fixedNow)).toBeTrue();
		expect(isThisWeekOrOverdue("2026-09-17", fixedNow)).toBeTrue();

		// 8+ days ahead
		expect(isThisWeekOrOverdue("2026-09-18", fixedNow)).toBeFalse();
		expect(isThisWeekOrOverdue("2026-10-01", fixedNow)).toBeFalse();

		// Null or invalid
		expect(isThisWeekOrOverdue(null, fixedNow)).toBeFalse();
		expect(isThisWeekOrOverdue(undefined, fixedNow)).toBeFalse();
	});
});

describe("Smart List Query Engine - Today View Alignment", () => {
	const fixedNow = new Date(2026, 8, 10, 12, 0, 0); // Sept 10, 2026

	test("matchesSmartView('today') includes overdue and today tasks when incomplete", () => {
		const overdueTask = makeTask({ due: "2026-09-08", completed: false });
		const todayTask = makeTask({ due: "2026-09-10", completed: false });
		const tomorrowTask = makeTask({ due: "2026-09-11", completed: false });
		const noDueDateTask = makeTask({ due: null, completed: false });

		expect(matchesSmartView(overdueTask, "today", { now: fixedNow })).toBeTrue();
		expect(matchesSmartView(todayTask, "today", { now: fixedNow })).toBeTrue();
		expect(matchesSmartView(tomorrowTask, "today", { now: fixedNow })).toBeFalse();
		expect(matchesSmartView(noDueDateTask, "today", { now: fixedNow })).toBeFalse();
	});

	test("matchesSmartView('today') ONLY matches strictly today when completed", () => {
		const overdueCompleted = makeTask({ due: "2026-09-08", completed: true });
		const yesterdayCompleted = makeTask({ due: "2026-09-09", completed: true });
		const todayCompleted = makeTask({ due: "2026-09-10", completed: true });
		const tomorrowCompleted = makeTask({ due: "2026-09-11", completed: true });
		const noDueDateCompleted = makeTask({ due: null, completed: true });

		// Crucial fix: old completed tasks should NOT match Today view
		expect(matchesSmartView(overdueCompleted, "today", { now: fixedNow })).toBeFalse();
		expect(matchesSmartView(yesterdayCompleted, "today", { now: fixedNow })).toBeFalse();

		// Completed today DOES match
		expect(matchesSmartView(todayCompleted, "today", { now: fixedNow })).toBeTrue();

		// Tomorrow / no due date do not match
		expect(matchesSmartView(tomorrowCompleted, "today", { now: fixedNow })).toBeFalse();
		expect(matchesSmartView(noDueDateCompleted, "today", { now: fixedNow })).toBeFalse();
	});

	test("matchesSmartView('today') keeps overdue tasks completed today visible", () => {
		const overdueCompletedToday = makeTask({
			due: "2026-09-08",
			completed: true,
			completed_at: "2026-09-10T10:00:00Z",
		});
		const overdueCompletedPast = makeTask({
			due: "2026-09-08",
			completed: true,
			completed_at: "2026-09-09T10:00:00Z",
		});

		expect(matchesSmartView(overdueCompletedToday, "today", { now: fixedNow })).toBeTrue();
		expect(matchesSmartView(overdueCompletedPast, "today", { now: fixedNow })).toBeFalse();
	});
});

describe("Smart List Query Engine - This Week View Alignment", () => {
	const fixedNow = new Date(2026, 8, 10, 12, 0, 0); // Sept 10, 2026

	test("matchesSmartView('this_week') includes overdue tasks when incomplete", () => {
		const overdueTask = makeTask({ due: "2026-09-05", completed: false });
		const yesterdayTask = makeTask({ due: "2026-09-09", completed: false });
		const todayTask = makeTask({ due: "2026-09-10", completed: false });
		const inThreeDaysTask = makeTask({ due: "2026-09-13", completed: false });
		const inSevenDaysTask = makeTask({ due: "2026-09-17", completed: false });
		const inEightDaysTask = makeTask({ due: "2026-09-18", completed: false });
		const noDueDateTask = makeTask({ due: null, completed: false });

		// Incomplete overdue tasks match backend SQL rule (date(t.due) <= date('now', '+7 days'))
		expect(matchesSmartView(overdueTask, "this_week", { now: fixedNow })).toBeTrue();
		expect(matchesSmartView(yesterdayTask, "this_week", { now: fixedNow })).toBeTrue();
		expect(matchesSmartView(todayTask, "this_week", { now: fixedNow })).toBeTrue();
		expect(matchesSmartView(inThreeDaysTask, "this_week", { now: fixedNow })).toBeTrue();
		expect(matchesSmartView(inSevenDaysTask, "this_week", { now: fixedNow })).toBeTrue();
		expect(matchesSmartView(inEightDaysTask, "this_week", { now: fixedNow })).toBeFalse();
		expect(matchesSmartView(noDueDateTask, "this_week", { now: fixedNow })).toBeFalse();
	});

	test("matchesSmartView('this_week') excludes overdue tasks when completed", () => {
		const overdueCompleted = makeTask({ due: "2026-09-05", completed: true });
		const yesterdayCompleted = makeTask({ due: "2026-09-09", completed: true });
		const todayCompleted = makeTask({ due: "2026-09-10", completed: true });
		const inThreeDaysCompleted = makeTask({ due: "2026-09-13", completed: true });
		const inSevenDaysCompleted = makeTask({ due: "2026-09-17", completed: true });
		const inEightDaysCompleted = makeTask({ due: "2026-09-18", completed: true });

		// Completed overdue tasks should NOT appear in this_week
		expect(matchesSmartView(overdueCompleted, "this_week", { now: fixedNow })).toBeFalse();
		expect(matchesSmartView(yesterdayCompleted, "this_week", { now: fixedNow })).toBeFalse();

		// Completed tasks within today..+7 days DO match
		expect(matchesSmartView(todayCompleted, "this_week", { now: fixedNow })).toBeTrue();
		expect(matchesSmartView(inThreeDaysCompleted, "this_week", { now: fixedNow })).toBeTrue();
		expect(matchesSmartView(inSevenDaysCompleted, "this_week", { now: fixedNow })).toBeTrue();
		expect(matchesSmartView(inEightDaysCompleted, "this_week", { now: fixedNow })).toBeFalse();
	});
});

describe("Smart List Query Engine - queryTasks and getSmartListCounts", () => {
	const fixedNow = new Date(2026, 8, 10, 12, 0, 0); // Sept 10, 2026

	test("queryTasks properly filters completed vs incomplete for today view", () => {
		const tasks: Task[] = [
			makeTask({ id: "t1", due: "2026-09-08", completed: false }), // Overdue incomplete
			makeTask({ id: "t2", due: "2026-09-08", completed: true }), // Overdue completed (must NOT show in today)
			makeTask({ id: "t3", due: "2026-09-10", completed: false }), // Today incomplete
			makeTask({ id: "t4", due: "2026-09-10", completed: true }), // Today completed (shows when completion includes completed)
			makeTask({ id: "t5", due: "2026-09-12", completed: false }), // Future incomplete
		];

		// When completion === "all" (show completed is toggled ON)
		const allToday = queryTasks(tasks, {
			smartView: "today",
			completion: "all",
			now: fixedNow,
		});
		// Should include t1 (overdue incomplete), t3 (today incomplete), t4 (today completed)
		// MUST NOT include t2 (overdue completed)!
		expect(allToday.map((t) => t.id).sort()).toEqual(["t1", "t3", "t4"]);

		// When completion === "incomplete" (default)
		const incompleteToday = queryTasks(tasks, {
			smartView: "today",
			completion: "incomplete",
			now: fixedNow,
		});
		expect(incompleteToday.map((t) => t.id).sort()).toEqual(["t1", "t3"]);

		// When completion === "completed"
		const completedToday = queryTasks(tasks, {
			smartView: "today",
			completion: "completed",
			now: fixedNow,
		});
		expect(completedToday.map((t) => t.id)).toEqual(["t4"]);
	});

	test("queryTasks properly filters completed vs incomplete for this_week view", () => {
		const tasks: Task[] = [
			makeTask({ id: "t1", due: "2026-09-08", completed: false }), // Overdue incomplete (shows in this_week)
			makeTask({ id: "t2", due: "2026-09-08", completed: true }), // Overdue completed (must NOT show)
			makeTask({ id: "t3", due: "2026-09-10", completed: false }), // Today incomplete
			makeTask({ id: "t4", due: "2026-09-13", completed: true }), // In week completed
			makeTask({ id: "t5", due: "2026-09-25", completed: false }), // Way in future
		];

		// When completion === "all"
		const allWeek = queryTasks(tasks, {
			smartView: "this_week",
			completion: "all",
			now: fixedNow,
		});
		// Should include t1 (overdue incomplete), t3 (today incomplete), t4 (in week completed)
		// Excludes t2 (overdue completed) and t5 (future)
		expect(allWeek.map((t) => t.id).sort()).toEqual(["t1", "t3", "t4"]);

		// When completion === "incomplete"
		const incompleteWeek = queryTasks(tasks, {
			smartView: "this_week",
			completion: "incomplete",
			now: fixedNow,
		});
		expect(incompleteWeek.map((t) => t.id).sort()).toEqual(["t1", "t3"]);

		// When completion === "completed"
		const completedWeek = queryTasks(tasks, {
			smartView: "this_week",
			completion: "completed",
			now: fixedNow,
		});
		expect(completedWeek.map((t) => t.id)).toEqual(["t4"]);
	});

	test("getSmartListCounts counts accurately without pollution from old completed tasks", () => {
		const tasks: Task[] = [
			makeTask({ id: "t1", due: "2026-09-08", completed: false }), // Overdue incomplete
			makeTask({ id: "t2", due: "2026-09-08", completed: true }), // Overdue completed
			makeTask({ id: "t3", due: "2026-09-10", completed: false }), // Today incomplete
			makeTask({ id: "t4", due: "2026-09-10", completed: true }), // Today completed
			makeTask({ id: "t5", due: "2026-09-12", completed: false }), // In week incomplete
			makeTask({ id: "t6", due: "2026-09-12", completed: true }), // In week completed
		];

		const counts = getSmartListCounts(tasks, { now: fixedNow });

		// Today:
		// Incomplete: t1 (overdue), t3 (today) -> 2
		// Total: t1 (overdue incomplete), t3 (today incomplete), t4 (today completed) -> 3 (t2 overdue completed NOT included!)
		expect(counts.today).toEqual({ total: 3, incomplete: 2 });

		// This Week:
		// Incomplete: t1 (overdue), t3 (today), t5 (in week) -> 3
		// Total: t1, t3, t4, t5, t6 -> 5 (t2 overdue completed NOT included!)
		expect(counts.this_week).toEqual({ total: 5, incomplete: 3 });
	});
});

describe("Smart List Query Engine - Date Predicates", () => {
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

	test("isOverdue matches dates strictly before today", () => {
		expect(isOverdue("2026-09-08", fixedNow)).toBeTrue();
		expect(isOverdue("2026-09-09", fixedNow)).toBeTrue();
		expect(isOverdue("2026-09-10", fixedNow)).toBeFalse();
		expect(isOverdue("2026-09-11", fixedNow)).toBeFalse();
		expect(isOverdue(null, fixedNow)).toBeFalse();
	});

	test("isTodayOrOverdue includes overdue and today but not future", () => {
		expect(isTodayOrOverdue("2026-09-08", fixedNow)).toBeTrue();
		expect(isTodayOrOverdue("2026-09-09", fixedNow)).toBeTrue();
		expect(isTodayOrOverdue("2026-09-10", fixedNow)).toBeTrue();
		expect(isTodayOrOverdue("2026-09-11", fixedNow)).toBeFalse();
		expect(isTodayOrOverdue("2026-09-20", fixedNow)).toBeFalse();
		expect(isTodayOrOverdue(null, fixedNow)).toBeFalse();
	});

	test("isTomorrow matches exactly tomorrow's date", () => {
		expect(isTomorrow("2026-09-10", fixedNow)).toBeFalse();
		expect(isTomorrow("2026-09-11", fixedNow)).toBeTrue();
		expect(isTomorrow("2026-09-12", fixedNow)).toBeFalse();
		expect(isTomorrow(null, fixedNow)).toBeFalse();
	});

	test("isThisWeek matches tasks within the next 7 days", () => {
		expect(isThisWeek("2026-09-10", fixedNow)).toBeTrue();
		expect(isThisWeek("2026-09-11", fixedNow)).toBeTrue();
		expect(isThisWeek("2026-09-17", fixedNow)).toBeTrue(); // 7 days ahead
		expect(isThisWeek("2026-09-18", fixedNow)).toBeFalse(); // 8 days ahead
		expect(isThisWeek(null, fixedNow)).toBeFalse();
	});
});

describe("Smart List Query Engine - View Matching", () => {
	const fixedNow = new Date(2026, 8, 10, 12, 0, 0); // Sept 10, 2026

	test("Overdue smart list matches incomplete tasks strictly before today", () => {
		const overdueIncomplete = makeTask({ due: "2026-09-08", completed: false });
		const overdueCompleted = makeTask({ due: "2026-09-08", completed: true });
		const todayTask = makeTask({ due: "2026-09-10", completed: false });
		const futureTask = makeTask({ due: "2026-09-15", completed: false });
		const deletedOverdue = makeTask({
			due: "2026-09-08",
			completed: false,
			deleted_at: "2026-09-09T00:00:00Z",
		});

		expect(matchesSmartView(overdueIncomplete, "overdue", { now: fixedNow })).toBeTrue();
		expect(matchesSmartView(overdueCompleted, "overdue", { now: fixedNow })).toBeFalse();
		expect(matchesSmartView(todayTask, "overdue", { now: fixedNow })).toBeFalse();
		expect(matchesSmartView(futureTask, "overdue", { now: fixedNow })).toBeFalse();
		expect(matchesSmartView(deletedOverdue, "overdue", { now: fixedNow })).toBeFalse();
	});

	test("Inbox matches tasks in the inbox list", () => {
		const inboxTask = makeTask({ list_id: "inbox-id" });
		const workTask = makeTask({ list_id: "work-id" });

		expect(matchesSmartView(inboxTask, "inbox", { inboxListId: "inbox-id" })).toBeTrue();
		expect(matchesSmartView(workTask, "inbox", { inboxListId: "inbox-id" })).toBeFalse();
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
		expect(matchesSmartView(deletedTask, "today", { now: fixedNow })).toBeFalse();
		expect(matchesSmartView(deletedTask, "inbox", { inboxListId: "list-default" })).toBeFalse();
	});
});

describe("Smart List Query Engine - Collection Queries", () => {
	const fixedNow = new Date(2026, 8, 10, 12, 0, 0); // Sept 10, 2026

	test("querySmartList filters collection by smart view", () => {
		const tasks: Task[] = [
			makeTask({ id: "0", list_id: "work-id", due: "2026-09-08", completed: false }), // Overdue
			makeTask({ id: "1", list_id: "inbox-id", due: "2026-09-10" }), // Inbox, Today, This Week
			makeTask({ id: "2", list_id: "work-id", due: "2026-09-11" }), // Tomorrow, This Week
			makeTask({ id: "3", list_id: "work-id", due: "2026-09-25" }), // Future
			makeTask({ id: "4", deleted_at: "2026-09-01T00:00:00Z" }), // Trash
		];

		const overdueResults = querySmartList(tasks, "overdue", { now: fixedNow });
		expect(overdueResults.map((t) => t.id)).toEqual(["0"]);

		const inboxResults = querySmartList(tasks, "inbox", {
			inboxListId: "inbox-id",
		});
		expect(inboxResults.map((t) => t.id)).toEqual(["1"]);

		const todayResults = querySmartList(tasks, "today", { now: fixedNow });
		expect(todayResults.map((t) => t.id)).toEqual(["0", "1"]);

		const tomorrowResults = querySmartList(tasks, "tomorrow", {
			now: fixedNow,
		});
		expect(tomorrowResults.map((t) => t.id)).toEqual(["2"]);

		const thisWeekResults = querySmartList(tasks, "this_week", {
			now: fixedNow,
		});
		expect(thisWeekResults.map((t) => t.id)).toEqual(["0", "1", "2"]);

		const allResults = querySmartList(tasks, "all");
		expect(allResults.map((t) => t.id)).toEqual(["0", "1", "2", "3"]);

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
			makeTask({
				id: "5",
				list_id: "work-id",
				due: "2026-09-08",
				completed: false,
			}),
		];

		const counts = getSmartListCounts(tasks, {
			inboxListId: "inbox-id",
			now: fixedNow,
		});

		expect(counts.inbox).toEqual({ total: 2, incomplete: 1 });
		expect(counts.today).toEqual({ total: 3, incomplete: 2 });
		expect(counts.tomorrow).toEqual({ total: 1, incomplete: 1 });
		expect(counts.this_week).toEqual({ total: 4, incomplete: 3 });
		expect(counts.all).toEqual({ total: 4, incomplete: 3 });
		expect(counts.trash).toEqual({ total: 1, incomplete: 1 });
		expect(counts.overdue).toEqual({ total: 1, incomplete: 1 });
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
