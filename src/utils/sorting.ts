import type { Task } from "../models/index.ts";

export type SortField = "priority" | "due" | "title" | "manual" | "created_at";
export type SortOrder = "asc" | "desc";

export interface SortOptions {
	field?: SortField;
	order?: SortOrder;
	completedToEnd?: boolean;
	manualOrder?: string[] | Map<string, number>;
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
	const aP = a.priority;
	const bP = b.priority;

	if (aP === bP) return 0;
	if (aP === null || aP === undefined) return 1;
	if (bP === null || bP === undefined) return -1;

	return order === "asc" ? aP - bP : bP - aP;
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

	const aTime = new Date(aDue).getTime();
	const bTime = new Date(bDue).getTime();

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

	// Fallback to created_at
	const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
	const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
	if (aCreated !== bCreated) {
		return order === "asc" ? aCreated - bCreated : bCreated - aCreated;
	}
	return compareByTitle(a, b, order);
}

/**
 * Build a comparator function based on SortOptions.
 */
export function createTaskComparator(options: SortOptions = {}): (a: Task, b: Task) => number {
	const { field = "priority", order = "asc", completedToEnd = false, manualOrder } = options;

	return (a: Task, b: Task): number => {
		// Completed tasks sent to the bottom if requested
		if (completedToEnd && a.completed !== b.completed) {
			return compareByCompletion(a, b);
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
				cmp = compareByManual(a, b, order);
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

export function sortByPriority(
	tasks: Task[],
	order: SortOrder = "asc",
	completedToEnd = false,
): Task[] {
	return sortTasks(tasks, { field: "priority", order, completedToEnd });
}

export function sortByDueDate(
	tasks: Task[],
	order: SortOrder = "asc",
	completedToEnd = false,
): Task[] {
	return sortTasks(tasks, { field: "due", order, completedToEnd });
}

export function sortByTitle(
	tasks: Task[],
	order: SortOrder = "asc",
	completedToEnd = false,
): Task[] {
	return sortTasks(tasks, { field: "title", order, completedToEnd });
}

export function sortByManual(
	tasks: Task[],
	order: SortOrder = "asc",
	completedToEnd = false,
	manualOrder?: string[] | Map<string, number>,
): Task[] {
	return sortTasks(tasks, {
		field: "manual",
		order,
		completedToEnd,
		manualOrder,
	});
}
