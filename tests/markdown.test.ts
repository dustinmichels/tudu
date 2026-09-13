import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createPinia, setActivePinia } from "pinia";

mock.module("@tauri-apps/api/core", () => ({
	invoke: async () => null,
}));

import type { List, Task } from "../src/models/index.ts";
import { useListStore } from "../src/stores/lists.ts";
import { useTaskStore } from "../src/stores/tasks.ts";
import {
	copyToClipboard,
	escapeHtml,
	formatTasksAsMarkdown,
	renderMarkdown,
	sanitizeUrl,
} from "../src/utils/markdown.ts";
function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: overrides.id ?? `task-${Math.random().toString(36).slice(2, 8)}`,
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
		created_at: "2026-01-01T00:00:00Z",
		updated_at: "2026-01-01T00:00:00Z",
		deleted_at: null,
		...overrides,
	};
}

function makeList(overrides: Partial<List> = {}): List {
	return {
		id: overrides.id ?? `list-${Math.random().toString(36).slice(2, 8)}`,
		name: "My List",
		color: null,
		icon: null,
		position: 0,
		created_at: "2026-01-01T00:00:00Z",
		updated_at: "2026-01-01T00:00:00Z",
		deleted_at: null,
		...overrides,
	};
}

describe("formatTasksAsMarkdown", () => {
	test("returns empty string when tasks array is empty", () => {
		expect(formatTasksAsMarkdown([])).toBe("");
	});

	test("single list: formats incomplete tasks with - [ ]", () => {
		const tasks = [
			makeTask({ id: "1", title: "task 1", completed: false }),
			makeTask({ id: "2", title: "task 2", completed: false }),
		];
		const result = formatTasksAsMarkdown(tasks);
		expect(result).toBe("- [ ] task 1\n- [ ] task 2");
	});

	test("single list: formats mix of incomplete and complete tasks matching prompt example", () => {
		const tasks = [
			makeTask({ id: "1", title: "task 1", completed: false }),
			makeTask({ id: "2", title: "task 2", completed: false }),
			makeTask({ id: "3", title: "task 3", completed: true }),
		];
		const result = formatTasksAsMarkdown(tasks);
		expect(result).toBe("- [ ] task 1\n- [ ] task 2\n- [x] task 3");
	});

	test("single list: handles subtasks with indentation", () => {
		const parent = makeTask({ id: "p1", title: "Parent task", completed: false });
		const sub1 = makeTask({
			id: "s1",
			parent_id: "p1",
			title: "Subtask 1",
			completed: false,
			position: 1,
		});
		const sub2 = makeTask({
			id: "s2",
			parent_id: "p1",
			title: "Subtask 2",
			completed: true,
			position: 2,
		});
		const other = makeTask({ id: "p2", title: "Other task", completed: true });

		const result = formatTasksAsMarkdown([parent, other], [], {
			allTasks: [parent, sub1, sub2, other],
		});

		expect(result).toBe(
			"- [ ] Parent task\n  - [ ] Subtask 1\n  - [x] Subtask 2\n- [x] Other task",
		);
	});

	test("single list: filters completed subtasks when includeCompleted is false", () => {
		const parent = makeTask({ id: "p1", title: "Parent task", completed: false });
		const sub1 = makeTask({
			id: "s1",
			parent_id: "p1",
			title: "Subtask 1",
			completed: false,
		});
		const sub2 = makeTask({
			id: "s2",
			parent_id: "p1",
			title: "Subtask 2",
			completed: true,
		});

		const result = formatTasksAsMarkdown([parent], [], {
			allTasks: [parent, sub1, sub2],
			includeCompleted: false,
		});

		expect(result).toBe("- [ ] Parent task\n  - [ ] Subtask 1");
	});

	test("multiple lists: breaks tasks down into sections by list", () => {
		const listInbox = makeList({ id: "l-inbox", name: "Inbox", position: 0 });
		const listWork = makeList({ id: "l-work", name: "Work", position: 1 });

		const task1 = makeTask({ id: "1", list_id: "l-inbox", title: "task 1", completed: false });
		const task2 = makeTask({ id: "2", list_id: "l-inbox", title: "task 2", completed: false });
		const task3 = makeTask({ id: "3", list_id: "l-work", title: "task 3", completed: true });

		const result = formatTasksAsMarkdown([task1, task2, task3], [listInbox, listWork]);

		expect(result).toBe("## Inbox\n- [ ] task 1\n- [ ] task 2\n\n## Work\n- [x] task 3");
	});

	test("multiple lists: orders sections by lists array position", () => {
		const listA = makeList({ id: "la", name: "Alpha", position: 0 });
		const listB = makeList({ id: "lb", name: "Beta", position: 1 });

		// Even if Beta tasks are first in tasks array, Alpha section appears first if listA is first in lists
		const taskB = makeTask({ id: "tb", list_id: "lb", title: "Beta task" });
		const taskA = makeTask({ id: "ta", list_id: "la", title: "Alpha task" });

		const result = formatTasksAsMarkdown([taskB, taskA], [listA, listB]);

		expect(result).toBe("## Alpha\n- [ ] Alpha task\n\n## Beta\n- [ ] Beta task");
	});

	test("multiple lists: unclassified or unknown list IDs fall back gracefully", () => {
		const list1 = makeList({ id: "l1", name: "Known List" });
		const task1 = makeTask({ id: "1", list_id: "l1", title: "task 1" });
		const task2 = makeTask({ id: "2", list_id: "unknown-id", title: "task 2" });

		const result = formatTasksAsMarkdown([task1, task2], [list1]);

		expect(result).toBe("## Known List\n- [ ] task 1\n\n## Tasks\n- [ ] task 2");
	});

	test("view with only 1 list represented: does not create section headers", () => {
		const listWork = makeList({ id: "l-work", name: "Work" });
		const task1 = makeTask({ id: "1", list_id: "l-work", title: "task 1" });
		const task2 = makeTask({ id: "2", list_id: "l-work", title: "task 2" });

		const result = formatTasksAsMarkdown([task1, task2], [listWork]);

		expect(result).toBe("- [ ] task 1\n- [ ] task 2");
	});

	test("explicit groupByList: true forces section headers even for 1 list", () => {
		const listWork = makeList({ id: "l-work", name: "Work" });
		const task1 = makeTask({ id: "1", list_id: "l-work", title: "task 1" });

		const result = formatTasksAsMarkdown([task1], [listWork], { groupByList: true });

		expect(result).toBe("## Work\n- [ ] task 1");
	});

	test("explicit groupByList: false disables section headers even for multiple lists", () => {
		const listA = makeList({ id: "la", name: "Alpha" });
		const listB = makeList({ id: "lb", name: "Beta" });

		const taskA = makeTask({ id: "1", list_id: "la", title: "task 1" });
		const taskB = makeTask({ id: "2", list_id: "lb", title: "task 2" });

		const result = formatTasksAsMarkdown([taskA, taskB], [listA, listB], {
			groupByList: false,
		});

		expect(result).toBe("- [ ] task 1\n- [ ] task 2");
	});

	test("title sanitization: trims whitespace, replaces newlines with space, defaults to (Untitled)", () => {
		const task1 = makeTask({ id: "1", title: "   Task with whitespace   " });
		const task2 = makeTask({ id: "2", title: "Line 1\nLine 2\r\nLine 3" });
		const task3 = makeTask({ id: "3", title: "   " });

		const result = formatTasksAsMarkdown([task1, task2, task3]);

		expect(result).toBe("- [ ] Task with whitespace\n- [ ] Line 1 Line 2 Line 3\n- [ ] (Untitled)");
	});
});

describe("copyToClipboard", () => {
	const globalScope = globalThis as unknown as {
		navigator?: { clipboard?: { writeText?: (text: string) => Promise<void> } };
		document?: {
			createElement?: (tag: string) => unknown;
			body?: { appendChild?: (node: unknown) => unknown };
			execCommand?: (cmd: string) => boolean;
		};
	};

	beforeEach(() => {
		delete globalScope.navigator;
		delete globalScope.document;
	});

	test("uses navigator.clipboard.writeText when available", async () => {
		let writtenText = "";
		globalScope.navigator = {
			clipboard: {
				writeText: async (text: string) => {
					writtenText = text;
				},
			},
		};

		const success = await copyToClipboard("test clipboard content");
		expect(success).toBe(true);
		expect(writtenText).toBe("test clipboard content");
	});

	test("falls back to document.execCommand when navigator.clipboard fails", async () => {
		let commandCalled = "";
		let capturedValue = "";

		globalScope.navigator = {
			clipboard: {
				writeText: async () => {
					throw new Error("Clipboard write denied");
				},
			},
		};

		globalScope.document = {
			createElement: () => ({
				value: "",
				style: {},
				setAttribute: () => {},
				focus: () => {},
				select: () => {},
				remove: () => {},
			}),
			body: {
				appendChild: (node: unknown) => {
					const el = node as { value?: string };
					capturedValue = el.value ?? "";
					return node;
				},
			},
			execCommand: (cmd: string) => {
				commandCalled = cmd;
				return true;
			},
		};

		const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
		try {
			const success = await copyToClipboard("fallback text");
			expect(success).toBe(true);
			expect(commandCalled).toBe("copy");
			expect(capturedValue).toBe("fallback text");
		} finally {
			warnSpy.mockRestore();
		}
	});
});

describe("Store integration: copying a particular list vs copying a view", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	test("copying a particular list formats single list markdown without section headers", () => {
		const listStore = useListStore();
		const taskStore = useTaskStore();

		const list1 = makeList({ id: "list-work", name: "Work", position: 0 });
		const list2 = makeList({ id: "list-personal", name: "Personal", position: 1 });
		listStore.lists = [list1, list2];
		listStore.setActiveList("list-work");

		const task1 = makeTask({ id: "t1", list_id: "list-work", title: "task 1", completed: false });
		const task2 = makeTask({ id: "t2", list_id: "list-work", title: "task 2", completed: false });
		const task3 = makeTask({ id: "t3", list_id: "list-work", title: "task 3", completed: true });
		taskStore.tasks = [task1, task2, task3];
		taskStore.allTasks = [task1, task2, task3];

		const markdown = formatTasksAsMarkdown(taskStore.tasks, listStore.sortedLists, {
			allTasks: taskStore.allTasks,
			includeCompleted: taskStore.includeCompleted,
		});

		expect(markdown).toBe("- [ ] task 1\n- [ ] task 2\n- [x] task 3");
	});

	test("copying a view with multiple lists breaks down into sections by list", () => {
		const listStore = useListStore();
		const taskStore = useTaskStore();

		const listInbox = makeList({ id: "list-inbox", name: "Inbox", position: 0 });
		const listWork = makeList({ id: "list-work", name: "Work", position: 1 });
		listStore.lists = [listInbox, listWork];
		listStore.setActiveView("today");

		const task1 = makeTask({ id: "t1", list_id: "list-inbox", title: "task 1", completed: false });
		const task2 = makeTask({ id: "t2", list_id: "list-inbox", title: "task 2", completed: false });
		const task3 = makeTask({ id: "t3", list_id: "list-work", title: "task 3", completed: true });
		taskStore.tasks = [task1, task2, task3];
		taskStore.allTasks = [task1, task2, task3];

		const markdown = formatTasksAsMarkdown(taskStore.tasks, listStore.sortedLists, {
			allTasks: taskStore.allTasks,
			includeCompleted: taskStore.includeCompleted,
		});

		expect(markdown).toBe("## Inbox\n- [ ] task 1\n- [ ] task 2\n\n## Work\n- [x] task 3");
	});
});

describe("escapeHtml", () => {
	test("escapes ampersands, angle brackets, and quotes", () => {
		expect(escapeHtml("a & b < c > d \"e\" 'f'")).toBe(
			"a &amp; b &lt; c &gt; d &quot;e&quot; &#39;f&#39;",
		);
	});
});

describe("sanitizeUrl", () => {
	test("allows valid http, https, and mailto URLs", () => {
		expect(sanitizeUrl("https://example.com/path?q=1")).toBe("https://example.com/path?q=1");
		expect(sanitizeUrl("http://localhost:3000")).toBe("http://localhost:3000");
		expect(sanitizeUrl("mailto:test@example.com")).toBe("mailto:test@example.com");
	});

	test("rejects unsafe or malformed URLs", () => {
		expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
		expect(sanitizeUrl("data:text/html,evil")).toBeNull();
		expect(sanitizeUrl("https://example.com with spaces")).toBeNull();
		expect(sanitizeUrl("   ")).toBeNull();
	});
});

describe("renderMarkdown", () => {
	test("returns empty string for empty or whitespace content", () => {
		expect(renderMarkdown("")).toBe("");
		expect(renderMarkdown("   \n\t  ")).toBe("");
	});

	test("escapes HTML to prevent script and tag injection", () => {
		const result = renderMarkdown("<script>alert('xss')</script> & <b>bold</b>");
		expect(result).not.toContain("<script>");
		expect(result).toContain("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
		expect(result).toContain("&amp;");
	});

	test("renders headings h1, h2, h3, h4 without trailing br", () => {
		const result = renderMarkdown("# Heading 1\n## Heading 2\n### Heading 3\n#### Heading 4");
		expect(result).toContain(
			'<h2 class="font-extrabold text-lg mt-3 mb-1.5 text-zinc-900 dark:text-zinc-100">Heading 1</h2>',
		);
		expect(result).toContain(
			'<h3 class="font-bold text-base mt-2 mb-1 text-zinc-900 dark:text-zinc-100">Heading 2</h3>',
		);
		expect(result).toContain(
			'<h4 class="font-bold text-sm mt-2 mb-1 text-zinc-900 dark:text-zinc-100">Heading 3</h4>',
		);
		expect(result).toContain(
			'<h5 class="font-bold text-xs mt-1.5 mb-1 text-zinc-900 dark:text-zinc-100">Heading 4</h5>',
		);
		expect(result).not.toContain("<br />");
	});

	test("wraps list items properly in ul and ol containers", () => {
		const ulResult = renderMarkdown("- Item 1\n- Item 2\n- Item 3");
		expect(ulResult).toBe(
			'<ul class="list-disc ml-5 my-1.5 space-y-0.5"><li class="text-sm">Item 1</li><li class="text-sm">Item 2</li><li class="text-sm">Item 3</li></ul>',
		);

		const olResult = renderMarkdown("1. First\n2. Second");
		expect(olResult).toBe(
			'<ol class="list-decimal ml-5 my-1.5 space-y-0.5"><li class="text-sm">First</li><li class="text-sm">Second</li></ol>',
		);
	});

	test("renders checklists with checkboxes in ul container", () => {
		const result = renderMarkdown("- [ ] Unchecked\n- [x] Checked");
		expect(result).toContain('<ul class="list-disc ml-5 my-1.5 space-y-0.5">');
		expect(result).toContain('type="checkbox"');
		expect(result).toContain("checked");
		expect(result).toContain("Unchecked");
		expect(result).toContain("Checked");
	});

	test("sanitizes links: allows safe http/https/mailto, neutralizes javascript", () => {
		const safeResult = renderMarkdown(
			"[Safe](https://example.com) and [Email](mailto:user@example.com)",
		);
		expect(safeResult).toContain(
			'<a href="https://example.com" target="_blank" rel="noopener noreferrer"',
		);
		expect(safeResult).toContain(
			'<a href="mailto:user@example.com" target="_blank" rel="noopener noreferrer"',
		);

		const unsafeResult = renderMarkdown("[Unsafe](javascript:alert(1))");
		expect(unsafeResult).not.toContain('href="javascript:');
		expect(unsafeResult).not.toContain("<a");
		expect(unsafeResult).toContain("Unsafe");
	});

	test("formats inline code, bold, italic, and strikethrough", () => {
		const result = renderMarkdown("`code` and **bold** and *italic* and ~~deleted~~");
		expect(result).toContain(
			'<code class="px-1 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-xs font-mono text-zinc-800 dark:text-zinc-200">code</code>',
		);
		expect(result).toContain("<strong>bold</strong>");
		expect(result).toContain("<em>italic</em>");
		expect(result).toContain("<del>deleted</del>");
	});

	test("renders code blocks in pre/code without trailing br", () => {
		const result = renderMarkdown("```\nconst x = 1;\nconst y = 2;\n```");
		expect(result).toBe(
			'<pre class="bg-zinc-100 dark:bg-zinc-900 p-2 rounded text-xs font-mono overflow-x-auto my-2 border border-zinc-200 dark:border-zinc-800"><code>const x = 1;\nconst y = 2;</code></pre>',
		);
	});

	test("renders blockquotes with italic style", () => {
		const result = renderMarkdown("> Quote line 1\n> Quote line 2");
		expect(result).toBe(
			'<blockquote class="border-l-2 border-zinc-300 dark:border-zinc-700 pl-3 my-1.5 italic text-zinc-600 dark:text-zinc-400">Quote line 1<br />Quote line 2</blockquote>',
		);
	});
});
