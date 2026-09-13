import { describe, expect, test } from "bun:test";
import type { Task } from "../src/models/index.ts";
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

describe("Sorting Utilities", () => {
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

	test("compareByDueDate handles mixed date-only and ISO timestamps without UTC timezone drift", () => {
		const tDateOnly = makeTask({ id: "date-only", due: "2026-09-12" });
		const tEarlierISO = makeTask({ id: "earlier-iso", due: "2026-09-11T12:00:00Z" });
		const tLaterISO = makeTask({ id: "later-iso", due: "2026-09-13T12:00:00Z" });

		const sorted = sortByDueDate([tLaterISO, tDateOnly, tEarlierISO], "asc");
		expect(sorted.map((t) => t.id)).toEqual(["earlier-iso", "date-only", "later-iso"]);
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

		expect(sorted.map((t) => t.id)).toEqual(["p2-pending", "p3-pending", "p1-done"]);
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
