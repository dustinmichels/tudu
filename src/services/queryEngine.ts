import type { Task } from "../models/index.ts";
import { type SortOptions, sortTasks } from "../utils/sorting.ts";

export type SmartView =
	| "inbox"
	| "next_actions"
	| "waiting_on"
	| "someday_maybe"
	| "today"
	| "tomorrow"
	| "this_week"
	| "all"
	| "trash"
	| "overdue";

export type CompletionFilter = "all" | "incomplete" | "completed";

export interface SmartListContext {
	inboxListId?: string | null;
	now?: Date;
	lists?: Array<{ id: string; name: string }>;
	listMap?: Map<string, string> | Record<string, string>;
	nextActionsListId?: string | null;
	waitingOnListId?: string | null;
	somedayMaybeListId?: string | null;
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
 * Helper to retrieve list name from context given a list_id.
 */
function getListNameFromContext(
	listId: string | null | undefined,
	context: SmartListContext,
): string | null {
	if (!listId) return null;
	if (context.listMap) {
		if (context.listMap instanceof Map) {
			const val = context.listMap.get(listId);
			if (val) return val;
		} else if (typeof context.listMap === "object") {
			const val = (context.listMap as Record<string, string>)[listId];
			if (val) return val;
		}
	}
	if (context.lists && Array.isArray(context.lists)) {
		const found = context.lists.find((l) => l.id === listId);
		if (found?.name) return found.name;
	}
	return null;
}

/**
 * Check if a task has a tag containing 'waiting' (e.g. '@waiting', '#waiting', 'waiting').
 */
function hasWaitingTag(task: Task): boolean {
	if ("tags" in task && Array.isArray((task as { tags?: unknown }).tags)) {
		for (const item of (task as { tags?: unknown[] }).tags!) {
			let name = "";
			if (typeof item === "string") {
				name = item;
			} else if (
				item &&
				typeof item === "object" &&
				"name" in item &&
				typeof (item as { name?: unknown }).name === "string"
			) {
				name = (item as { name: string }).name;
			}
			if (name.toLowerCase().includes("waiting")) {
				return true;
			}
		}
	}
	if (task.title) {
		const tokens = task.title.split(/\s+/);
		for (const token of tokens) {
			if (
				(token.startsWith("#") || token.startsWith("@")) &&
				token.toLowerCase().includes("waiting")
			) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Check if a task has a tag containing 'someday' (e.g. '#someday', '@someday', 'someday', 'someday/maybe').
 */
function hasSomedayTag(task: Task): boolean {
	if ("tags" in task && Array.isArray((task as { tags?: unknown }).tags)) {
		for (const item of (task as { tags?: unknown[] }).tags!) {
			let name = "";
			if (typeof item === "string") {
				name = item;
			} else if (
				item &&
				typeof item === "object" &&
				"name" in item &&
				typeof (item as { name?: unknown }).name === "string"
			) {
				name = (item as { name: string }).name;
			}
			if (name.toLowerCase().includes("someday")) {
				return true;
			}
		}
	}
	if (task.title) {
		const tokens = task.title.split(/\s+/);
		for (const token of tokens) {
			if (
				(token.startsWith("#") || token.startsWith("@")) &&
				token.toLowerCase().includes("someday")
			) {
				return true;
			}
		}
	}
	return false;
}

export function isNextActionsListName(name: string | null | undefined): boolean {
	if (!name) return false;
	const n = name.toLowerCase().trim();
	return n === "next actions" || n === "next action";
}

export function isWaitingOnListName(name: string | null | undefined): boolean {
	if (!name) return false;
	const n = name.toLowerCase().trim();
	return n === "waiting on" || n === "waiting" || n === "waiting for";
}

export function isSomedayMaybeListName(name: string | null | undefined): boolean {
	if (!name) return false;
	const n = name.toLowerCase().trim();
	return (
		n === "someday/maybe" || n === "someday / maybe" || n === "someday" || n === "someday maybe"
	);
}

export function isGtdListName(name: string | null | undefined): boolean {
	return isNextActionsListName(name) || isWaitingOnListName(name) || isSomedayMaybeListName(name);
}

/**
 * Check if task is in 'Waiting on' list (case-insensitive).
 */
function isWaitingOnList(listId: string | null | undefined, context: SmartListContext): boolean {
	if (!listId) return false;
	if (context.waitingOnListId && listId === context.waitingOnListId) return true;
	return isWaitingOnListName(getListNameFromContext(listId, context));
}

/**
 * Check if task is in 'Someday/Maybe' or 'Someday' list (case-insensitive).
 */
function isSomedayMaybeList(listId: string | null | undefined, context: SmartListContext): boolean {
	if (!listId) return false;
	if (context.somedayMaybeListId && listId === context.somedayMaybeListId) return true;
	return isSomedayMaybeListName(getListNameFromContext(listId, context));
}

/**
 * Check if task is in 'Next actions' list (case-insensitive).
 */
function isNextActionsList(listId: string | null | undefined, context: SmartListContext): boolean {
	if (!listId) return false;
	if (context.nextActionsListId && listId === context.nextActionsListId) return true;
	return isNextActionsListName(getListNameFromContext(listId, context));
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

		case "next_actions": {
			if (task.completed) return false;
			const isWaiting = hasWaitingTag(task) || isWaitingOnList(task.list_id, context);
			if (isWaiting) return false;
			const isSomeday = hasSomedayTag(task) || isSomedayMaybeList(task.list_id, context);
			if (isSomeday) return false;
			const isDueEligible =
				!task.due || isTodayOrOverdue(task.due, now) || isNextActionsList(task.list_id, context);
			return isDueEligible;
		}

		case "waiting_on":
			if (task.completed) return false;
			return hasWaitingTag(task) || isWaitingOnList(task.list_id, context);

		case "someday_maybe":
			if (task.completed) return false;
			return hasSomedayTag(task) || isSomedayMaybeList(task.list_id, context);
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
			if (
				!matchesSmartView(task, smartView, {
					inboxListId,
					now,
					lists: criteria.lists,
					listMap: criteria.listMap,
					nextActionsListId: criteria.nextActionsListId,
					waitingOnListId: criteria.waitingOnListId,
					somedayMaybeListId: criteria.somedayMaybeListId,
				})
			) {
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
		next_actions: { total: 0, incomplete: 0 },
		waiting_on: { total: 0, incomplete: 0 },
		someday_maybe: { total: 0, incomplete: 0 },
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

		if (matchesSmartView(task, "next_actions", context)) {
			counts.next_actions.total++;
			if (!task.completed) counts.next_actions.incomplete++;
		}

		if (matchesSmartView(task, "waiting_on", context)) {
			counts.waiting_on.total++;
			if (!task.completed) counts.waiting_on.incomplete++;
		}

		if (matchesSmartView(task, "someday_maybe", context)) {
			counts.someday_maybe.total++;
			if (!task.completed) counts.someday_maybe.incomplete++;
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
