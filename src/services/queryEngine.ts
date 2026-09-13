import type { Task } from "../models/index.ts";
import { type SortOptions, sortTasks } from "../utils/sorting.ts";

export type SmartView = "inbox" | "today" | "tomorrow" | "this_week" | "all" | "trash" | "overdue";

export type CompletionFilter = "all" | "incomplete" | "completed";

export interface SmartListContext {
	inboxListId?: string | null;
	now?: Date;
}

export interface QueryCriteria extends SmartListContext {
	smartView?: SmartView | null;
	listId?: string | null;
	tag?: string | null;
	completion?: CompletionFilter | boolean;
	searchQuery?: string;
	includeSubtasks?: boolean;
	sort?: SortOptions;
}

/**
 * Parses an ISO string or YYYY-MM-DD date string into a local Date object.
 */
export function parseDueDateToLocal(due: string | null | undefined): Date | null {
	if (!due) return null;
	const trimmed = due.trim();
	const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
	if (dateOnlyMatch?.[1] && dateOnlyMatch?.[2] && dateOnlyMatch?.[3]) {
		const year = Number.parseInt(dateOnlyMatch[1], 10);
		const month = Number.parseInt(dateOnlyMatch[2], 10) - 1;
		const day = Number.parseInt(dateOnlyMatch[3], 10);
		return new Date(year, month, day);
	}
	const parsed = new Date(trimmed);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Check if a task's due date is overdue (strictly before today).
 */
export function isOverdue(due: string | null | undefined, now: Date = new Date()): boolean {
	const d = parseDueDateToLocal(due);
	if (!d) return false;

	const startOfToday = new Date(now);
	startOfToday.setHours(0, 0, 0, 0);
	return d < startOfToday;
}

/**
 * Check if a task's due date falls on today.
 */
export function isToday(due: string | null | undefined, now: Date = new Date()): boolean {
	const d = parseDueDateToLocal(due);
	if (!d) return false;

	const startOfToday = new Date(now);
	startOfToday.setHours(0, 0, 0, 0);

	const endOfToday = new Date(now);
	endOfToday.setHours(23, 59, 59, 999);

	return d >= startOfToday && d <= endOfToday;
}

/**
 * Check if a task's due date is today or overdue.
 */
export function isTodayOrOverdue(due: string | null | undefined, now: Date = new Date()): boolean {
	const d = parseDueDateToLocal(due);
	if (!d) return false;

	const endOfToday = new Date(now);
	endOfToday.setHours(23, 59, 59, 999);
	return d <= endOfToday;
}

/**
 * Check if a task's due date falls on tomorrow.
 */
export function isTomorrow(due: string | null | undefined, now: Date = new Date()): boolean {
	const d = parseDueDateToLocal(due);
	if (!d) return false;

	const startOfTomorrow = new Date(now);
	startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
	startOfTomorrow.setHours(0, 0, 0, 0);

	const endOfTomorrow = new Date(now);
	endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
	endOfTomorrow.setHours(23, 59, 59, 999);

	return d >= startOfTomorrow && d <= endOfTomorrow;
}

/**
 * Check if a task's due date is within the next 7 days.
 */
export function isThisWeek(due: string | null | undefined, now: Date = new Date()): boolean {
	const d = parseDueDateToLocal(due);
	if (!d) return false;

	const startOfToday = new Date(now);
	startOfToday.setHours(0, 0, 0, 0);

	const endOf7Days = new Date(now);
	endOf7Days.setDate(endOf7Days.getDate() + 7);
	endOf7Days.setHours(23, 59, 59, 999);

	return d >= startOfToday && d <= endOf7Days;
}

/**
 * Check if a task's due date is within the next 7 days or overdue.
 */
export function isThisWeekOrOverdue(
	due: string | null | undefined,
	now: Date = new Date(),
): boolean {
	const d = parseDueDateToLocal(due);
	if (!d) return false;

	const endOf7Days = new Date(now);
	endOf7Days.setDate(endOf7Days.getDate() + 7);
	endOf7Days.setHours(23, 59, 59, 999);

	return d <= endOf7Days;
}

/**
 * Predicate to check if a task matches a specific SmartView.
 */
export function matchesSmartView(
	task: Task,
	view: SmartView,
	context: SmartListContext = {},
): boolean {
	const now = context.now ?? new Date();

	// Trash view is exclusively for soft-deleted tasks
	if (view === "trash") {
		return task.deleted_at !== null;
	}

	// All other smart views require non-deleted tasks
	if (task.deleted_at !== null) {
		return false;
	}

	switch (view) {
		case "inbox":
			return context.inboxListId != null && task.list_id === context.inboxListId;

		case "today":
			return task.completed
				? isToday(task.due, now) ||
						(isTodayOrOverdue(task.due, now) &&
							task.completed_at !== null &&
							isToday(task.completed_at, now))
				: isTodayOrOverdue(task.due, now);

		case "tomorrow":
			return isTomorrow(task.due, now);

		case "this_week":
			return task.completed ? isThisWeek(task.due, now) : isThisWeekOrOverdue(task.due, now);

		case "overdue":
			return !task.completed && isOverdue(task.due, now);

		case "all":
			return true;

		default:
			return true;
	}
}

/**
 * Filter tasks by a smart view.
 */
export function querySmartList(
	tasks: Task[],
	view: SmartView,
	context: SmartListContext = {},
): Task[] {
	return tasks.filter((t) => matchesSmartView(t, view, context));
}

/**
 * Check if a task matches a text search query across title and description.
 */
export function matchesSearchQuery(task: Task, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return true;

	if (task.title.toLowerCase().includes(q)) return true;
	if (task.description?.toLowerCase().includes(q)) return true;
	if (task.location?.toLowerCase().includes(q)) return true;
	if (task.url?.toLowerCase().includes(q)) return true;

	return false;
}

/**
 * Helper to check if a task matches a tag identifier or name.
 */
function taskMatchesTag(task: Task, tagFilter: string): boolean {
	if (!("tags" in task)) return false;
	const tagsValue = (task as { tags?: unknown }).tags;
	if (!Array.isArray(tagsValue)) return false;

	return tagsValue.some((item) => {
		if (typeof item === "string") return item === tagFilter;
		if (item && typeof item === "object") {
			const id = "id" in item ? String((item as { id: unknown }).id) : "";
			const name = "name" in item ? String((item as { name: unknown }).name) : "";
			return id === tagFilter || name === tagFilter;
		}
		return false;
	});
}

/**
 * Filter and sort tasks according to QueryCriteria.
 */
export function queryTasks(tasks: Task[], criteria: QueryCriteria = {}): Task[] {
	const {
		smartView,
		listId,
		tag,
		completion = "all",
		searchQuery,
		includeSubtasks = true,
		sort,
		inboxListId,
		now = new Date(),
	} = criteria;

	const filtered = tasks.filter((task) => {
		// 1. Smart view / soft-delete handling
		if (smartView) {
			if (!matchesSmartView(task, smartView, { inboxListId, now })) {
				return false;
			}
		} else if (task.deleted_at !== null) {
			// By default, exclude soft-deleted tasks unless smartView === "trash"
			return false;
		}

		// 2. List filter (if smartView is not "trash" or "all")
		if (listId && task.list_id !== listId) {
			return false;
		}

		// 3. Tag filter
		if (tag && !taskMatchesTag(task, tag)) {
			return false;
		}

		// 4. Completion filter
		if (completion === false || completion === "incomplete") {
			if (task.completed) return false;
		} else if (completion === true || completion === "completed") {
			if (!task.completed) return false;
		}

		// 5. Subtasks filter
		if (!includeSubtasks && task.parent_id !== null) {
			return false;
		}

		// 6. Search query
		if (searchQuery && !matchesSearchQuery(task, searchQuery)) {
			return false;
		}

		return true;
	});

	if (sort) {
		return sortTasks(filtered, sort);
	}

	return filtered;
}

/**
 * Calculate task counts for all smart views.
 */
export function getSmartListCounts(
	tasks: Task[],
	context: SmartListContext = {},
): Record<SmartView, { total: number; incomplete: number }> {
	const counts: Record<SmartView, { total: number; incomplete: number }> = {
		inbox: { total: 0, incomplete: 0 },
		today: { total: 0, incomplete: 0 },
		tomorrow: { total: 0, incomplete: 0 },
		this_week: { total: 0, incomplete: 0 },
		all: { total: 0, incomplete: 0 },
		trash: { total: 0, incomplete: 0 },
		overdue: { total: 0, incomplete: 0 },
	};

	for (const task of tasks) {
		if (task.deleted_at !== null) {
			counts.trash.total++;
			if (!task.completed) counts.trash.incomplete++;
			continue;
		}

		// Non-deleted tasks
		counts.all.total++;
		if (!task.completed) counts.all.incomplete++;

		if (matchesSmartView(task, "inbox", context)) {
			counts.inbox.total++;
			if (!task.completed) counts.inbox.incomplete++;
		}

		if (matchesSmartView(task, "today", context)) {
			counts.today.total++;
			if (!task.completed) counts.today.incomplete++;
		}

		if (matchesSmartView(task, "tomorrow", context)) {
			counts.tomorrow.total++;
			if (!task.completed) counts.tomorrow.incomplete++;
		}

		if (matchesSmartView(task, "this_week", context)) {
			counts.this_week.total++;
			if (!task.completed) counts.this_week.incomplete++;
		}

		if (matchesSmartView(task, "overdue", context)) {
			counts.overdue.total++;
			if (!task.completed) counts.overdue.incomplete++;
		}
	}

	return counts;
}
