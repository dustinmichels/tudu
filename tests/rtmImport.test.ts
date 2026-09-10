import { describe, expect, test } from "bun:test";
import rtmSample from "../samples/rememberthemilk_sample.json";
import {
	mapRememberTheMilkToOpenTask,
	type RTMExport,
} from "../src/services/rememberTheMilk.ts";

describe("Remember the Milk import mapping", () => {
	test("converts rememberthemilk_sample.json to valid OpenTask v1.0 document and captures reasonable data", () => {
		const doc = mapRememberTheMilkToOpenTask(rtmSample);

		// Schema-level checks
		expect(doc.version).toBe("1.0");
		expect(doc.source).toBe("rtm");
		expect(typeof doc.exported_at).toBe("string");
		expect(Array.isArray(doc.lists)).toBe(true);
		expect(Array.isArray(doc.tags)).toBe(true);
		expect(Array.isArray(doc.tasks)).toBe(true);

		// Lists capture
		// Sample has 6 standard lists + 2 smart lists
		expect(doc.lists.length).toBe(8);
		const inboxList = doc.lists.find((l) => l.name === "Inbox");
		expect(inboxList).toBeDefined();
		expect(inboxList?.id).toBe("101");
		expect(inboxList?.is_archived).toBe(false);

		const workList = doc.lists.find((l) => l.name === "Work");
		expect(workList).toBeDefined();
		expect(workList?.id).toBe("103");
		expect(workList?.position).toBe(2048);

		const recentSmartList = doc.lists.find((l) => l.name === "Recent");
		expect(recentSmartList).toBeDefined();
		expect(recentSmartList?.extra?.is_smart_list).toBe(true);
		expect(recentSmartList?.extra?.filter).toBe(
			'updatedWithin:"4 day of  today"',
		);

		// Tags capture
		// Sample has 8 tags
		expect(doc.tags).toBeDefined();
		expect(doc.tags?.length).toBe(8);
		const devTag = doc.tags?.find((t) => t.name === "development");
		expect(devTag).toBeDefined();
		expect(devTag?.id).toBe("development");
		expect(devTag?.color).toBe("#e0f2fe");

		// Tasks capture
		// Sample has 18 tasks
		expect(doc.tasks.length).toBe(18);

		// Task 1001: Review Q3 financial summary (P1 priority -> high, due date, postponed count in extra, finance tag)
		const task1001 = doc.tasks.find((t) => t.id === "1001");
		expect(task1001).toBeDefined();
		expect(task1001?.title).toBe(
			"Review Q3 financial summary and tax documents",
		);
		expect(task1001?.priority).toBe("high");
		expect(task1001?.priority_raw).toBe("P1");
		expect(task1001?.due).toBeDefined();
		expect(task1001?.is_all_day).toBe(true);
		expect(task1001?.timezone).toBe("America/New_York");
		expect(task1001?.tags).toEqual(["finance"]);
		expect(task1001?.extra?.postponed).toBe(1);
		expect(task1001?.status).toBe("needs_action");
		// Reminder linked through series_id 2001
		expect(task1001?.reminders).toBeDefined();
		expect(task1001?.reminders?.length).toBe(1);
		expect(task1001?.reminders?.[0]?.trigger).toBe("-P1D");

		// Task 1002: Prepare slides for architectural review meeting (notes + reminder + due time)
		const task1002 = doc.tasks.find((t) => t.id === "1002");
		expect(task1002).toBeDefined();
		expect(task1002?.priority).toBe("high");
		expect(task1002?.is_all_day).toBe(false);
		expect(task1002?.notes).toBeDefined();
		expect(task1002?.notes?.length).toBe(1);
		expect(task1002?.notes?.[0]?.title).toBe("Meeting Agenda & Outline");
		expect(task1002?.notes?.[0]?.content).toContain(
			"Review current architecture bottlenecks",
		);
		expect(task1002?.reminders).toBeDefined();
		expect(task1002?.reminders?.length).toBe(1);

		// Task 1004 & 1005: Parent-child hierarchy
		const task1004 = doc.tasks.find((t) => t.id === "1004");
		const task1005 = doc.tasks.find((t) => t.id === "1005");
		expect(task1004).toBeDefined();
		expect(task1005).toBeDefined();
		expect(task1005?.parent_id).toBe("1004");

		// Task 1005 is completed
		expect(task1005?.status).toBe("completed");
		expect(task1005?.completed_at).toBeDefined();

		// Task 1009 has URL
		const task1009 = doc.tasks.find((t) => t.id === "1009");
		expect(task1009?.url).toBe(
			"https://example.com/papers/consensus-algorithms.pdf",
		);

		// Task with repeats
		const task1003 = doc.tasks.find((t) => t.id === "1003");
		expect(task1003?.extra?.repeat_every).toBe(true);
	});

	test("handles out-of-order subtasks, dangling parents, and missing list_ids safely", () => {
		const messyRtm = {
			lists: [
				{ id: "10", name: "Inbox" },
				{ id: "20", name: "Old Projects", archived: 1 },
			],
			archived_lists: [{ id: "30", name: "Archive 2024" }],
			tasks: [
				// Subtask listed BEFORE parent task
				{
					id: "sub-1",
					name: "Child Task Listed First",
					list_id: "10",
					parent_id: "parent-1",
				},
				{
					id: "parent-1",
					name: "Parent Task Listed Second",
					list_id: "10",
				},
				// Dangling parent_id (parent not in tasks)
				{
					id: "orphan-1",
					name: "Orphaned Task",
					list_id: "10",
					parent_id: "ghost-parent",
				},
				// Task with missing list_id
				{
					id: "no-list-task",
					name: "Task without list_id",
				},
				// Task with unlisted list_id
				{
					id: "unlisted-list-task",
					name: "Task with unlisted list_id",
					list_id: "999",
				},
			],
		};
		const doc = mapRememberTheMilkToOpenTask(messyRtm as unknown as RTMExport);

		// Archived lists captured
		const oldProjects = doc.lists.find((l) => l.id === "20");
		expect(oldProjects?.is_archived).toBe(true);
		const archive2024 = doc.lists.find((l) => l.id === "30");
		expect(archive2024?.is_archived).toBe(true);

		// Unlisted list was auto-added to doc.lists
		const list999 = doc.lists.find((l) => l.id === "999");
		expect(list999).toBeDefined();

		// Parent-first topological ordering: parent-1 must appear before sub-1
		const parentIndex = doc.tasks.findIndex((t) => t.id === "parent-1");
		const childIndex = doc.tasks.findIndex((t) => t.id === "sub-1");
		expect(parentIndex).toBeGreaterThanOrEqual(0);
		expect(childIndex).toBeGreaterThan(parentIndex);
		expect(doc.tasks[childIndex].parent_id).toBe("parent-1");

		// Dangling parent sanitized to null
		const orphan = doc.tasks.find((t) => t.id === "orphan-1");
		expect(orphan?.parent_id).toBeNull();

		// Task without list_id defaulted to Inbox (id 10)
		const noListTask = doc.tasks.find((t) => t.id === "no-list-task");
		expect(noListTask?.list_id).toBe("10");
	});
});
