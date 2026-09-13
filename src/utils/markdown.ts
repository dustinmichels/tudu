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

/**
 * Safely escapes raw HTML special characters to prevent tag and attribute injection.
 */
export function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Validates that a URL uses safe protocols (strictly https?:// or mailto:).
 * Rejects control characters, whitespace, and unsafe protocols like javascript:.
 */
export function sanitizeUrl(rawUrl: string): string | null {
	const trimmed = rawUrl.trim();
	if (!trimmed || /\s/.test(trimmed)) {
		return null;
	}
	if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) {
		return trimmed;
	}
	return null;
}

/**
 * Formats inline markdown constructs (code, links, bold, italic, strike) with HTML escaping.
 */
export function formatInlineMarkdown(text: string): string {
	// 1. Extract inline code blocks so formatting inside them is preserved and tags are escaped
	const codeTokens: string[] = [];
	let formatted = text.replace(/`([^`]+)`/g, (_match, code) => {
		const token = `__CODE_TOKEN_${codeTokens.length}__`;
		const escapedCode = escapeHtml(code);
		codeTokens.push(
			`<code class="px-1 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-xs font-mono text-zinc-800 dark:text-zinc-200">${escapedCode}</code>`,
		);
		return token;
	});

	// 2. Safe links: validate protocol and attribute-encode
	const linkTokens: string[] = [];
	formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, linkText, linkTarget) => {
		const token = `__LINK_TOKEN_${linkTokens.length}__`;
		const safeTarget = sanitizeUrl(linkTarget);
		const escapedText = escapeHtml(linkText);
		if (!safeTarget) {
			linkTokens.push(escapedText);
		} else {
			const encodedTarget = escapeHtml(safeTarget);
			linkTokens.push(
				`<a href="${encodedTarget}" target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400 underline hover:text-blue-700">${escapedText}</a>`,
			);
		}
		return token;
	});

	// 3. Escape remaining HTML in text
	formatted = escapeHtml(formatted);

	// 4. Bold, italic, strike
	formatted = formatted.replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>");
	formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
	formatted = formatted.replace(/\*(.*?)\*/g, "<em>$1</em>");
	formatted = formatted.replace(/~~(.*?)~~/g, "<del>$1</del>");

	// 5. Restore link tokens
	linkTokens.forEach((linkHtml, idx) => {
		formatted = formatted.replace(`__LINK_TOKEN_${idx}__`, linkHtml);
	});

	// 6. Restore code tokens
	codeTokens.forEach((codeHtml, idx) => {
		formatted = formatted.replace(`__CODE_TOKEN_${idx}__`, codeHtml);
	});

	return formatted;
}

/**
 * Renders markdown note content into structured, sanitized HTML with proper block nesting.
 */
export function renderMarkdown(content: string): string {
	if (!content || !content.trim()) return "";

	const lines = content.split(/\r?\n/);
	const blocks: string[] = [];

	let inCodeBlock = false;
	let codeLines: string[] = [];

	let currentListType: "ul" | "ol" | null = null;
	let listItems: string[] = [];

	let inBlockquote = false;
	let blockquoteLines: string[] = [];

	let paragraphLines: string[] = [];

	function flushParagraph() {
		if (paragraphLines.length > 0) {
			const formatted = paragraphLines.map((l) => formatInlineMarkdown(l)).join("<br />");
			blocks.push(`<p class="my-1 leading-relaxed">${formatted}</p>`);
			paragraphLines = [];
		}
	}

	function flushList() {
		if (currentListType && listItems.length > 0) {
			const tag = currentListType;
			const listClass =
				tag === "ul" ? "list-disc ml-5 my-1.5 space-y-0.5" : "list-decimal ml-5 my-1.5 space-y-0.5";
			blocks.push(`<${tag} class="${listClass}">${listItems.join("")}</${tag}>`);
			listItems = [];
			currentListType = null;
		}
	}

	function flushBlockquote() {
		if (inBlockquote && blockquoteLines.length > 0) {
			const formatted = blockquoteLines.map((l) => formatInlineMarkdown(l)).join("<br />");
			blocks.push(
				`<blockquote class="border-l-2 border-zinc-300 dark:border-zinc-700 pl-3 my-1.5 italic text-zinc-600 dark:text-zinc-400">${formatted}</blockquote>`,
			);
			blockquoteLines = [];
			inBlockquote = false;
		}
	}

	function flushAll() {
		flushParagraph();
		flushList();
		flushBlockquote();
	}

	for (const line of lines) {
		// Code block delimiter (```)
		if (line.trim().startsWith("```")) {
			if (inCodeBlock) {
				const escaped = codeLines.map(escapeHtml).join("\n");
				blocks.push(
					`<pre class="bg-zinc-100 dark:bg-zinc-900 p-2 rounded text-xs font-mono overflow-x-auto my-2 border border-zinc-200 dark:border-zinc-800"><code>${escaped}</code></pre>`,
				);
				codeLines = [];
				inCodeBlock = false;
			} else {
				flushAll();
				inCodeBlock = true;
				codeLines = [];
			}
			continue;
		}

		if (inCodeBlock) {
			codeLines.push(line);
			continue;
		}

		// Blank line closes active paragraph, list, or blockquote
		if (!line.trim()) {
			flushAll();
			continue;
		}

		// Horizontal rule: ---, ***, ___
		if (/^(?:---|\*\*\*|___)\s*$/.test(line.trim())) {
			flushAll();
			blocks.push('<hr class="my-2 border-zinc-200 dark:border-zinc-800" />');
			continue;
		}

		// Headings: # H1, ## H2, ### H3, #### H4...
		const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
		if (headingMatch && headingMatch[1] && headingMatch[2] !== undefined) {
			flushAll();
			const level = headingMatch[1].length;
			const text = headingMatch[2];
			const inline = formatInlineMarkdown(text);
			if (level === 1) {
				blocks.push(
					`<h2 class="font-extrabold text-lg mt-3 mb-1.5 text-zinc-900 dark:text-zinc-100">${inline}</h2>`,
				);
			} else if (level === 2) {
				blocks.push(
					`<h3 class="font-bold text-base mt-2 mb-1 text-zinc-900 dark:text-zinc-100">${inline}</h3>`,
				);
			} else if (level === 3) {
				blocks.push(
					`<h4 class="font-bold text-sm mt-2 mb-1 text-zinc-900 dark:text-zinc-100">${inline}</h4>`,
				);
			} else {
				blocks.push(
					`<h5 class="font-bold text-xs mt-1.5 mb-1 text-zinc-900 dark:text-zinc-100">${inline}</h5>`,
				);
			}
			continue;
		}

		// Blockquotes: > text
		const blockquoteMatch = line.match(/^>\s?(.*)$/);
		if (blockquoteMatch && blockquoteMatch[1] !== undefined) {
			flushParagraph();
			flushList();
			inBlockquote = true;
			blockquoteLines.push(blockquoteMatch[1]);
			continue;
		} else if (inBlockquote) {
			flushBlockquote();
		}

		// Unordered list items: - item or * item
		const ulMatch = line.match(/^\s*[-*]\s+(.*)$/);
		if (ulMatch && ulMatch[1] !== undefined) {
			flushParagraph();
			flushBlockquote();
			if (currentListType && currentListType !== "ul") {
				flushList();
			}
			currentListType = "ul";

			// Check for checklist item: [ ] or [x]
			const checkMatch = ulMatch[1].match(/^\[([ xX])\]\s+(.*)$/);
			if (checkMatch && checkMatch[1] && checkMatch[2] !== undefined) {
				const checked = checkMatch[1].toLowerCase() === "x";
				const itemText = formatInlineMarkdown(checkMatch[2]);
				listItems.push(
					`<li class="text-sm list-none -ml-4 flex items-center gap-1.5"><input type="checkbox" disabled ${checked ? "checked " : ""}class="rounded pointer-events-none" /><span>${itemText}</span></li>`,
				);
			} else {
				const itemText = formatInlineMarkdown(ulMatch[1]);
				listItems.push(`<li class="text-sm">${itemText}</li>`);
			}
			continue;
		}

		// Ordered list items: 1. item
		const olMatch = line.match(/^\s*\d+\.\s+(.*)$/);
		if (olMatch && olMatch[1] !== undefined) {
			flushParagraph();
			flushBlockquote();
			if (currentListType && currentListType !== "ol") {
				flushList();
			}
			currentListType = "ol";
			const itemText = formatInlineMarkdown(olMatch[1]);
			listItems.push(`<li class="text-sm">${itemText}</li>`);
			continue;
		}

		// Regular paragraph text
		if (currentListType) {
			flushList();
		}
		paragraphLines.push(line);
	}

	if (inCodeBlock) {
		const escaped = codeLines.map(escapeHtml).join("\n");
		blocks.push(
			`<pre class="bg-zinc-100 dark:bg-zinc-900 p-2 rounded text-xs font-mono overflow-x-auto my-2 border border-zinc-200 dark:border-zinc-800"><code>${escaped}</code></pre>`,
		);
	}

	flushAll();

	return blocks.join("");
}
