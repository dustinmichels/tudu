import type { List, Task } from "../models/index.ts";

export interface FormatMarkdownOptions {
	/**
	 * Full list of all tasks (including subtasks) used to look up children.
	 * If omitted, subtasks will be inferred from `tasks`.
	 */
	allTasks?: Task[];
	/**
	 * Whether to include completed subtasks. Defaults to true.
	 */
	includeCompleted?: boolean;
	/**
	 * Explicitly force or disable sectioning by list.
	 * If undefined (default), automatically groups into sections when tasks span > 1 distinct lists.
	 */
	groupByList?: boolean;
}

/**
 * Formats a collection of tasks into GitHub-flavored Markdown checklists.
 *
 * For a single list:
 * - [ ] task 1
 * - [ ] task 2
 * - [x] task 3
 *
 * For multiple lists (e.g. copying a view with multiple lists):
 * ## List 1
 * - [ ] task 1
 * - [x] task 2
 *
 * ## List 2
 * - [ ] task 3
 */
export function formatTasksAsMarkdown(
	tasks: Task[],
	lists: List[] = [],
	options: FormatMarkdownOptions = {},
): string {
	if (!tasks || tasks.length === 0) {
		return "";
	}

	const includeCompleted = options.includeCompleted ?? true;
	const pool = options.allTasks && options.allTasks.length > 0 ? options.allTasks : tasks;

	// Build subtasks map by parent ID
	const subtasksByParentId = new Map<string, Task[]>();
	for (const t of pool) {
		if (t.parent_id && t.deleted_at === null) {
			if (!includeCompleted && t.completed) {
				continue;
			}
			const existing = subtasksByParentId.get(t.parent_id) ?? [];
			existing.push(t);
			subtasksByParentId.set(t.parent_id, existing);
		}
	}

	// Sort subtasks matching TaskRow order: completed sink to bottom, then by position
	for (const children of subtasksByParentId.values()) {
		children.sort((a, b) => {
			if (a.completed !== b.completed) {
				return a.completed ? 1 : -1;
			}
			return (a.position ?? 0) - (b.position ?? 0);
		});
	}

	// Helper to format a single task and its children recursively
	function formatTaskLines(task: Task, depth = 0, visited = new Set<string>()): string[] {
		if (visited.has(task.id)) return [];
		visited.add(task.id);

		const indent = "  ".repeat(depth);
		const check = task.completed ? "x" : " ";
		const cleanedTitle = (task.title || "").replace(/\r?\n/g, " ").trim() || "(Untitled)";
		const lines = [`${indent}- [${check}] ${cleanedTitle}`];

		const children = subtasksByParentId.get(task.id);
		if (children && children.length > 0) {
			for (const child of children) {
				lines.push(...formatTaskLines(child, depth + 1, visited));
			}
		}

		return lines;
	}

	// Known task IDs in pool to differentiate true subtasks from orphan tasks
	const knownTaskIds = new Set(pool.map((t) => t.id));

	// Filter root tasks: tasks with no parent_id or whose parent is not in the pool
	const rootTasks = tasks.filter((t) => !t.parent_id || !knownTaskIds.has(t.parent_id));
	if (rootTasks.length === 0) {
		return "";
	}

	// Determine distinct lists
	const distinctListIds = Array.from(
		new Set(rootTasks.map((t) => t.list_id).filter((id): id is string => Boolean(id))),
	);

	const shouldGroupByList =
		options.groupByList !== undefined ? options.groupByList : distinctListIds.length > 1;

	if (!shouldGroupByList) {
		const lines: string[] = [];
		const visited = new Set<string>();
		for (const task of rootTasks) {
			lines.push(...formatTaskLines(task, 0, visited));
		}
		return lines.join("\n");
	}

	// Group root tasks by list ID
	const listNameMap = new Map<string, string>();
	for (const l of lists) {
		listNameMap.set(l.id, l.name);
	}

	const tasksByListId = new Map<string, Task[]>();
	for (const task of rootTasks) {
		const lid = task.list_id || "unclassified";
		const group = tasksByListId.get(lid) ?? [];
		group.push(task);
		tasksByListId.set(lid, group);
	}

	// Order sections by `lists` array order, then any remaining lists
	const orderedListIds: string[] = [];
	for (const l of lists) {
		if (tasksByListId.has(l.id)) {
			orderedListIds.push(l.id);
		}
	}
	for (const lid of tasksByListId.keys()) {
		if (!orderedListIds.includes(lid)) {
			orderedListIds.push(lid);
		}
	}

	const sections: string[] = [];
	for (const lid of orderedListIds) {
		const groupTasks = tasksByListId.get(lid);
		if (!groupTasks || groupTasks.length === 0) continue;

		const listName = listNameMap.get(lid) ?? (lid === "unclassified" ? "Other" : "Tasks");
		const sectionLines: string[] = [];
		const visited = new Set<string>();
		for (const task of groupTasks) {
			sectionLines.push(...formatTaskLines(task, 0, visited));
		}

		if (sectionLines.length > 0) {
			sections.push(`## ${listName}\n${sectionLines.join("\n")}`);
		}
	}

	return sections.join("\n\n");
}

/**
 * Copies text to the clipboard using `navigator.clipboard` or fallback to `document.execCommand`.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
	if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch (err) {
			console.warn("navigator.clipboard.writeText failed, falling back to textarea copy:", err);
		}
	}

	if (typeof document !== "undefined") {
		try {
			const textArea = document.createElement("textarea");
			textArea.value = text;
			textArea.style.position = "fixed";
			textArea.style.left = "-999999px";
			textArea.style.top = "-999999px";
			textArea.setAttribute("readonly", "");
			document.body.appendChild(textArea);
			textArea.focus();
			textArea.select();
			const successful = document.execCommand("copy");
			textArea.remove();
			return successful;
		} catch (err) {
			console.error("execCommand fallback failed to copy to clipboard:", err);
			return false;
		}
	}

	return false;
}
