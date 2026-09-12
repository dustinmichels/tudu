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
