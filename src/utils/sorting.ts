import type { Task } from "../models/index.ts";
import { parseDueDateToLocal } from "../services/queryEngine.ts";

export type SortField = "priority" | "due" | "title" | "manual" | "created_at" | "list" | "tags";
export type SortOrder = "asc" | "desc";

export interface SortOptions {
	field?: SortField | null;
	order?: SortOrder;
	completedToEnd?: boolean;
	manualOrder?: string[] | Map<string, number>;
	listMap?: Map<string, string> | Record<string, string>;
}

/**
 * Compute the next sort state following the 3-state cycle:
 * - Unselected field (or when currently on default priority) sets (field, 'asc')
 * - Active field when 'asc' sets (field, 'desc')
 * - Active field when 'desc' resets to ('priority', 'asc')
 * - Active 'priority' toggles between 'asc' and 'desc'
 */
export function getNextSortState(
	currentField: SortField,
	currentOrder: SortOrder,
	targetField: SortField,
): { field: SortField; order: SortOrder } {
	if (currentField === targetField) {
		if (currentOrder === "asc") {
			return { field: targetField, order: "desc" };
		}
		return { field: "priority", order: "asc" };
	}
	return { field: targetField, order: "asc" };
}

/**
 * Compare two tasks by completion status (incomplete tasks before completed tasks).
 */
export function compareByCompletion(a: Task, b: Task): number {
	const aComp = a.completed ? 1 : 0;
	const bComp = b.completed ? 1 : 0;
	return aComp - bComp;
}

/**
 * Compare two tasks by priority (1 is highest, 2 medium, 3 low, null is none).
 * In both asc and desc, tasks without a priority (null) are placed at the end.
 *
 * asc: 1 -> 2 -> 3 -> null
 * desc: 3 -> 2 -> 1 -> null
 */
export function compareByPriority(a: Task, b: Task, order: SortOrder = "asc"): number {
	const aPrio = a.priority;
	const bPrio = b.priority;

	if (aPrio === null && bPrio === null) return 0;
	if (aPrio === null) return 1;
	if (bPrio === null) return -1;

	return order === "asc" ? aPrio - bPrio : bPrio - aPrio;
}

/**
 * Compare two tasks by due date (chronologically).
 * In both asc and desc, tasks without a due date (null) are placed at the end.
 *
 * asc: earliest due first -> null
 * desc: latest due first -> null
 */
export function compareByDueDate(a: Task, b: Task, order: SortOrder = "asc"): number {
	const aDue = a.due;
	const bDue = b.due;

	if (!aDue && !bDue) return 0;
	if (!aDue) return 1;
	if (!bDue) return -1;

	const aDate = parseDueDateToLocal(aDue);
	const bDate = parseDueDateToLocal(bDue);
	const aTime = aDate ? aDate.getTime() : Number.NaN;
	const bTime = bDate ? bDate.getTime() : Number.NaN;

	if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
	if (Number.isNaN(aTime)) return 1;
	if (Number.isNaN(bTime)) return -1;

	if (aTime === bTime) return 0;
	return order === "asc" ? aTime - bTime : bTime - aTime;
}

/**
 * Compare two tasks alphabetically by title.
 *
 * asc: A -> Z
 * desc: Z -> A
 */
export function compareByTitle(a: Task, b: Task, order: SortOrder = "asc"): number {
	const aTitle = a.title ?? "";
	const bTitle = b.title ?? "";
	const cmp = aTitle.localeCompare(bTitle, undefined, {
		sensitivity: "base",
		numeric: true,
	});
	return order === "asc" ? cmp : -cmp;
}

/**
 * Compare two tasks by creation timestamp.
 *
 * asc: oldest created first -> newest
 * desc: newest created first -> oldest
 */
export function compareByCreatedAt(a: Task, b: Task, order: SortOrder = "asc"): number {
	const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
	const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
	if (aCreated !== bCreated) {
		return order === "asc" ? aCreated - bCreated : bCreated - aCreated;
	}
	return compareByTitle(a, b, order);
}

/**
 * Compare two tasks by list name (or list ID fallback).
 */
export function compareByList(
	a: Task,
	b: Task,
	order: SortOrder = "asc",
	listMap?: Map<string, string> | Record<string, string>,
): number {
	const getListName = (listId: string): string => {
		if (!listMap) return listId.toLowerCase();
		if (listMap instanceof Map) {
			return (listMap.get(listId) ?? listId).toLowerCase();
		}
		return (listMap[listId] ?? listId).toLowerCase();
	};

	const la = getListName(a.list_id);
	const lb = getListName(b.list_id);

	if (la !== lb) {
		const cmp = la.localeCompare(lb);
		return order === "asc" ? cmp : -cmp;
	}
	return compareByTitle(a, b, "asc");
}

/**
 * Compare two tasks by their first tag name alphabetically.
 * Tasks without tags are placed at the end in both asc and desc orders.
 */
export function compareByTags(a: Task, b: Task, order: SortOrder = "asc"): number {
	const aTag = a.tags?.[0]?.name?.toLowerCase() ?? null;
	const bTag = b.tags?.[0]?.name?.toLowerCase() ?? null;

	if (aTag === null && bTag === null) return 0;
	if (aTag === null) return 1;
	if (bTag === null) return -1;

	if (aTag !== bTag) {
		const cmp = aTag.localeCompare(bTag);
		return order === "asc" ? cmp : -cmp;
	}
	return compareByTitle(a, b, "asc");
}

/**
 * Compare two tasks by manual order or creation timestamp.
 * If manual order array/map is supplied, it ranks by index; otherwise by created_at.
 */
export function compareByManual(
	a: Task,
	b: Task,
	order: SortOrder = "asc",
	manualOrder?: string[] | Map<string, number>,
): number {
	if (manualOrder) {
		const getIndex = (id: string): number => {
			if (Array.isArray(manualOrder)) {
				const idx = manualOrder.indexOf(id);
				return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
			}
			return manualOrder.get(id) ?? Number.MAX_SAFE_INTEGER;
		};

		const aIdx = getIndex(a.id);
		const bIdx = getIndex(b.id);
		if (aIdx !== bIdx) {
			return order === "asc" ? aIdx - bIdx : bIdx - aIdx;
		}
	}

	return compareByCreatedAt(a, b, order);
}

/**
 * Build a comparator function based on SortOptions.
 */
export function createTaskComparator(options: SortOptions = {}): (a: Task, b: Task) => number {
	const field = options.field !== undefined ? options.field : "priority";
	const { order = "asc", completedToEnd = false, manualOrder, listMap } = options;

	return (a: Task, b: Task): number => {
		// Completed tasks sent to the bottom if requested
		if (completedToEnd && a.completed !== b.completed) {
			return compareByCompletion(a, b);
		}

		if (!field) {
			return 0;
		}

		let cmp = 0;
		switch (field) {
			case "priority":
				cmp = compareByPriority(a, b, order);
				if (cmp === 0) cmp = compareByDueDate(a, b, "asc");
				if (cmp === 0) cmp = compareByTitle(a, b, "asc");
				break;

			case "due":
				cmp = compareByDueDate(a, b, order);
				if (cmp === 0) cmp = compareByPriority(a, b, "asc");
				if (cmp === 0) cmp = compareByTitle(a, b, "asc");
				break;

			case "title":
				cmp = compareByTitle(a, b, order);
				if (cmp === 0) cmp = compareByPriority(a, b, "asc");
				if (cmp === 0) cmp = compareByDueDate(a, b, "asc");
				break;

			case "manual":
				cmp = compareByManual(a, b, order, manualOrder);
				break;

			case "created_at":
				cmp = compareByCreatedAt(a, b, order);
				break;

			case "list":
				cmp = compareByList(a, b, order, listMap);
				if (cmp === 0) cmp = compareByPriority(a, b, "asc");
				if (cmp === 0) cmp = compareByDueDate(a, b, "asc");
				break;

			case "tags":
				cmp = compareByTags(a, b, order);
				if (cmp === 0) cmp = compareByPriority(a, b, "asc");
				if (cmp === 0) cmp = compareByDueDate(a, b, "asc");
				break;

			default:
				cmp = 0;
		}

		return cmp;
	};
}

/**
 * Sort a collection of tasks returning a new array without mutating the original.
 */
export function sortTasks(tasks: Task[], options: SortOptions = {}): Task[] {
	const comparator = createTaskComparator(options);
	return [...tasks].sort(comparator);
}
