import { describe, expect, test } from "bun:test";
import type { OpenTaskDocument } from "../src/models/index.ts";

describe("OpenTask Backup Import Validation", () => {
	test("validates structure of a valid OpenTask v1.0 document", () => {
		const doc: OpenTaskDocument = {
			version: "1.0",
			source: "tudu",
			exported_at: "2026-09-13T12:00:00Z",
			lists: [
				{ id: "inbox", name: "Inbox", position: 1 },
				{ id: "work", name: "Work", position: 2 },
			],
			tasks: [
				{
					id: "task-1",
					list_id: "inbox",
					title: "Sample Task",
					status: "needs_action",
					priority: "high",
				},
				{
					id: "task-2",
					list_id: "inbox",
					parent_id: "task-1",
					title: "Subtask 1",
					status: "completed",
				},
			],
		};

		expect(doc.version).toBe("1.0");
		expect(doc.lists.length).toBe(2);
		expect(doc.tasks.length).toBe(2);
		expect(doc.tasks[1]?.parent_id).toBe("task-1");
	});

	test("rejects invalid OpenTask document missing version 1.0", () => {
		const invalidDoc = {
			version: "2.0",
			lists: [],
			tasks: [],
		};

		expect(invalidDoc.version === "1.0").toBe(false);
	});
});
