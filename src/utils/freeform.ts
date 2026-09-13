import type { Task, UpdateTaskInput } from "../models/index.ts";

export const DEFAULT_CARD_WIDTH = 224;
export const DEFAULT_CARD_HEIGHT = 132;
export const DEFAULT_SUBTASK_CARD_WIDTH = 184;
export const DEFAULT_SUBTASK_CARD_HEIGHT = 96;
export const DEFAULT_SUBTASK_BUBBLE_GAP = 48;

export interface Point {
	x: number;
	y: number;
}

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export function isFreeformSubtask(task: Task): boolean {
	return Boolean(task.parent_id);
}

export function getFreeformCardDimensions(
	task: Task,
	options?: {
		cardWidth?: number;
		cardHeight?: number;
		subtaskCardWidth?: number;
		subtaskCardHeight?: number;
	},
): { width: number; height: number } {
	const isSub = isFreeformSubtask(task);
	const width = isSub
		? (options?.subtaskCardWidth ?? DEFAULT_SUBTASK_CARD_WIDTH)
		: (options?.cardWidth ?? DEFAULT_CARD_WIDTH);
	const height = isSub
		? (options?.subtaskCardHeight ?? DEFAULT_SUBTASK_CARD_HEIGHT)
		: (options?.cardHeight ?? DEFAULT_CARD_HEIGHT);
	return { width, height };
}

export function selectFreeformTasks(
	tasks: Task[],
	incompleteTasks: Task[],
	filteredTasks: Task[],
	includeCompleted: boolean,
	searchQuery: string,
): Task[] {
	if (searchQuery.trim()) return filteredTasks;
	return includeCompleted ? tasks : incompleteTasks;
}

export function persistFreeformPosition(
	taskId: string,
	position: Point,
	updateTask: (input: UpdateTaskInput, options: { debounceMs: number }) => Promise<unknown>,
): Promise<unknown> {
	return updateTask(
		{
			id: taskId,
			freeform_x: Math.round(position.x),
			freeform_y: Math.round(position.y),
		},
		{ debounceMs: 0 },
	);
}

export async function persistFreeformPositions(
	positions: Record<string, Point>,
	updateTask: (input: UpdateTaskInput, options: { debounceMs: number }) => Promise<unknown>,
): Promise<unknown[]> {
	return Promise.all(
		Object.entries(positions).map(([taskId, pos]) =>
			persistFreeformPosition(taskId, pos, updateTask),
		),
	);
}

export function calculateYarnCurve(start: Point, end: Point, subtaskIndex: number = 0): string {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const dist = Math.hypot(dx, dy);

	// Natural gravity sag based on distance, slightly varied by index
	const baseSag = Math.min(80, Math.max(20, dist * 0.15)) + (subtaskIndex % 3) * 6;

	// Gentle organic horizontal bow when connection is predominantly vertical
	const absDx = Math.abs(dx);
	const hBow = absDx < 60 ? (1 - absDx / 60) * 18 * (subtaskIndex % 2 === 0 ? 1 : -1) : 0;

	const cp1x = Math.round(start.x + dx * 0.25 + hBow);
	const cp1y = Math.round(start.y + dy * 0.25 + baseSag);
	const cp2x = Math.round(start.x + dx * 0.75 + hBow);
	const cp2y = Math.round(start.y + dy * 0.75 + baseSag);

	return `M ${Math.round(start.x)} ${Math.round(start.y)} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${Math.round(end.x)} ${Math.round(end.y)}`;
}

export function findFreeSlotNearParent(
	parentPos: Point,
	occupiedRects: Rect[],
	cardWidth = 224,
	cardHeight = 132,
	gap = 24,
	boardPadding = 32,
): Point {
	const stepX = cardWidth + gap;
	const stepY = cardHeight + gap;

	const candidates: Array<{ x: number; y: number; score: number }> = [];

	for (let ring = 1; ring <= 15; ring++) {
		for (let r = -ring; r <= ring; r++) {
			for (let c = -ring; c <= ring; c++) {
				if (Math.abs(r) !== ring && Math.abs(c) !== ring) continue;

				const candX = Math.round(parentPos.x + c * stepX);
				const candY = Math.round(parentPos.y + r * stepY);

				if (candX < boardPadding || candY < boardPadding) continue;

				// Prefer rightward (+c) and downward (+r)
				const penalty = (c < 0 ? 30 : 0) + (r < 0 ? 30 : 0);
				const score = (c ** 2 + r ** 2) * 100 + penalty;

				candidates.push({ x: candX, y: candY, score });
			}
		}
	}

	candidates.sort((a, b) => a.score - b.score);

	for (const cand of candidates) {
		const collides = occupiedRects.some((occ) => {
			return (
				cand.x < occ.x + occ.width + gap &&
				cand.x + cardWidth + gap > occ.x &&
				cand.y < occ.y + occ.height + gap &&
				cand.y + cardHeight + gap > occ.y
			);
		});

		if (!collides) {
			return { x: cand.x, y: cand.y };
		}
	}

	return {
		x: Math.max(boardPadding, parentPos.x + stepX),
		y: Math.max(boardPadding, parentPos.y + stepY),
	};
}

export function calculateExplodedSubtaskPosition(
	parentPos: Point,
	subtaskIndex: number,
	cardWidth = DEFAULT_CARD_WIDTH,
	cardHeight = DEFAULT_CARD_HEIGHT,
	gap = 24,
	occupiedRects?: Rect[],
	subtaskWidth?: number,
	subtaskHeight?: number,
): Point {
	const subW = subtaskWidth ?? cardWidth;
	const subH = subtaskHeight ?? cardHeight;
	if (occupiedRects && occupiedRects.length > 0) {
		return findFreeSlotNearParent(parentPos, occupiedRects, subW, subH, gap);
	}
	const offsetX = cardWidth + 48 + (subtaskIndex % 2) * 16;
	const offsetY = subtaskIndex * (subH + gap);
	return {
		x: Math.max(32, Math.round(parentPos.x + offsetX)),
		y: Math.max(32, Math.round(parentPos.y + offsetY)),
	};
}

export interface FreeformDisplayedTasksResult {
	rootTasks: Task[];
	displayedTasks: Task[];
	taskSubtasksMap: Map<string, Task[]>;
}

export function getFreeformDisplayedTasks(params: {
	candidateTasks: Task[];
	allTasks: Task[];
	isTaskExpanded: (taskId: string) => boolean;
	includeCompleted: boolean;
}): FreeformDisplayedTasksResult {
	const { candidateTasks, allTasks, isTaskExpanded, includeCompleted } = params;

	const allKnownTasks = new Map<string, Task>();
	for (const t of allTasks) {
		allKnownTasks.set(t.id, t);
	}
	for (const t of candidateTasks) {
		allKnownTasks.set(t.id, t);
	}

	const candidateIds = new Set(candidateTasks.map((t) => t.id));

	// Group subtasks by parent_id
	const subtasksByParent = new Map<string, Task[]>();
	for (const task of allKnownTasks.values()) {
		if (!task.parent_id || task.deleted_at !== null) continue;
		if (!includeCompleted && task.completed) continue;

		const list = subtasksByParent.get(task.parent_id) ?? [];
		list.push(task);
		subtasksByParent.set(task.parent_id, list);
	}

	// Sort subtasks by completed, then position
	for (const [parentId, list] of subtasksByParent.entries()) {
		list.sort((a, b) => {
			if (a.completed !== b.completed) return a.completed ? 1 : -1;
			return (a.position ?? 0) - (b.position ?? 0);
		});
		subtasksByParent.set(parentId, list);
	}

	// Root tasks: tasks in candidate pool that either have no parent_id
	// or their parent is not in the candidate pool (orphan subtasks)
	const rootTasks: Task[] = [];
	for (const task of candidateTasks) {
		if (!task.parent_id || !candidateIds.has(task.parent_id)) {
			rootTasks.push(task);
		}
	}

	// Displayed tasks: root tasks, plus any exploded subtasks of parents whose subtasks are expanded
	const displayedTasks: Task[] = [];
	const seenIds = new Set<string>();

	for (const root of rootTasks) {
		if (!seenIds.has(root.id)) {
			seenIds.add(root.id);
			displayedTasks.push(root);
		}

		if (isTaskExpanded(root.id)) {
			const subtasks = subtasksByParent.get(root.id) ?? [];
			for (const st of subtasks) {
				if (!seenIds.has(st.id)) {
					seenIds.add(st.id);
					displayedTasks.push(st);
				}
			}
		}
	}

	return {
		rootTasks,
		displayedTasks,
		taskSubtasksMap: subtasksByParent,
	};
}

export interface CollisionItem {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Iteratively resolves collisions between rectangular items.
 * If fixedIds are provided, those items will not be moved and other
 * items will be pushed away to make space for them.
 * If getGap is provided or parentSubtaskMap is provided, spacing can be tailored
 * (e.g. creating a bubble of space around a parent and its subtasks).
 */
export function resolveCollisions(
	items: CollisionItem[],
	gap = 24,
	boardPadding = 32,
	fixedIds: Set<string> = new Set(),
	maxIterations = 80,
	getGap?: (idA: string, idB: string) => number,
): Record<string, Point> {
	const list = items.map((it) => ({ ...it }));

	for (let iter = 0; iter < maxIterations; iter++) {
		let hadCollision = false;

		for (let i = 0; i < list.length; i++) {
			for (let j = i + 1; j < list.length; j++) {
				const a = list[i]!;
				const b = list[j]!;

				const effectiveGap = getGap ? getGap(a.id, b.id) : gap;
				const overlapX =
					(a.width + b.width) / 2 +
					effectiveGap -
					Math.abs(a.x + a.width / 2 - (b.x + b.width / 2));
				const overlapY =
					(a.height + b.height) / 2 +
					effectiveGap -
					Math.abs(a.y + a.height / 2 - (b.y + b.height / 2));

				if (overlapX > 0 && overlapY > 0) {
					hadCollision = true;
					const aFixed = fixedIds.has(a.id);
					const bFixed = fixedIds.has(b.id);

					if (aFixed && bFixed) {
						continue;
					}

					// Choose push axis: prefer axis of smaller overlap
					const pushX = overlapX < overlapY;

					if (pushX) {
						const aCenterX = a.x + a.width / 2;
						const bCenterX = b.x + b.width / 2;
						const shift = overlapX + 2;

						if (aFixed && !bFixed) {
							b.x += (bCenterX >= aCenterX ? 1 : -1) * shift;
						} else if (bFixed && !aFixed) {
							a.x += (aCenterX >= bCenterX ? 1 : -1) * shift;
						} else {
							const dir = bCenterX >= aCenterX ? 1 : -1;
							a.x -= dir * (shift / 2);
							b.x += dir * (shift / 2);
						}
					} else {
						const aCenterY = a.y + a.height / 2;
						const bCenterY = b.y + b.height / 2;
						const shift = overlapY + 2;

						if (aFixed && !bFixed) {
							b.y += (bCenterY >= aCenterY ? 1 : -1) * shift;
						} else if (bFixed && !aFixed) {
							a.y += (aCenterY >= bCenterY ? 1 : -1) * shift;
						} else {
							const dir = bCenterY >= aCenterY ? 1 : -1;
							a.y -= dir * (shift / 2);
							b.y += dir * (shift / 2);
						}
					}

					if (!aFixed) {
						a.x = Math.max(boardPadding, a.x);
						a.y = Math.max(boardPadding, a.y);
					}
					if (!bFixed) {
						b.x = Math.max(boardPadding, b.x);
						b.y = Math.max(boardPadding, b.y);
					}
				}
			}
		}

		if (!hadCollision) break;
	}

	// Final safety clamp to padding
	for (const it of list) {
		if (!fixedIds.has(it.id)) {
			it.x = Math.max(boardPadding, it.x);
			it.y = Math.max(boardPadding, it.y);
		}
	}

	return list.reduce(
		(acc, it) => {
			acc[it.id] = { x: Math.round(it.x), y: Math.round(it.y) };
			return acc;
		},
		{} as Record<string, Point>,
	);
}

export interface AutoLayoutOptions {
	/** All displayed tasks to position (optional if rootTasks is provided) */
	tasks?: Task[];
	/** Root tasks in desired display order (optional if tasks is provided) */
	rootTasks?: Task[];
	/** Mapping of parent ID to subtasks (optional) */
	taskSubtasksMap?: Map<string, Task[]>;
	/** Predicate returning whether a parent's subtasks are expanded (optional) */
	isTaskExpanded?: (taskId: string) => boolean;
	/** Card width in px (default 224) */
	cardWidth?: number;
	/** Card height in px (default 132) */
	cardHeight?: number;
	/** Subtask card width in px (defaults to cardWidth) */
	subtaskCardWidth?: number;
	/** Subtask card height in px (defaults to cardHeight) */
	subtaskCardHeight?: number;
	/** Gap between cards in px (default 24) */
	cardGap?: number;
	/** Bubble gap between expanded parent/subtask clusters and external tasks in px (default 48) */
	subtaskBubbleGap?: number;
	/** Board padding in px (default 32) */
	boardPadding?: number;
	/** Approximate layout columns (default 4) */
	columns?: number;
	/** Optional function to estimate card height for a task */
	estimateCardHeight?: (task: Task) => number;
	/** Random number generator for organic scatter (defaults to Math.random) */
	random?: () => number;
}

/**
 * Organically arranges tasks in a non-grid corkboard style with controlled randomness.
 * Keeps subtasks close to their parents and eliminates all collisions.
 * Repeated calls with Math.random generate distinct organic layouts.
 */
export function computeAutoLayoutPositions(options: AutoLayoutOptions): Record<string, Point> {
	const {
		cardWidth = DEFAULT_CARD_WIDTH,
		cardHeight = DEFAULT_CARD_HEIGHT,
		subtaskCardWidth,
		subtaskCardHeight,
		cardGap = 24,
		subtaskBubbleGap = DEFAULT_SUBTASK_BUBBLE_GAP,
		boardPadding = 32,
		columns = 4,
		isTaskExpanded = () => true,
		estimateCardHeight,
		random = Math.random,
	} = options;

	// 1. Resolve root tasks
	let roots: Task[] = [];
	if (options.rootTasks && options.rootTasks.length > 0) {
		roots = [...options.rootTasks];
	} else if (options.tasks && options.tasks.length > 0) {
		const taskIds = new Set(options.tasks.map((t) => t.id));
		roots = options.tasks.filter((t) => !t.parent_id || !taskIds.has(t.parent_id));
	} else {
		return {};
	}

	// 2. Resolve subtasks mapping
	const subtasksByParent = new Map<string, Task[]>();
	if (options.taskSubtasksMap) {
		for (const [k, v] of options.taskSubtasksMap.entries()) {
			subtasksByParent.set(k, [...v]);
		}
	} else if (options.tasks) {
		for (const t of options.tasks) {
			if (t.parent_id) {
				const list = subtasksByParent.get(t.parent_id) ?? [];
				list.push(t);
				subtasksByParent.set(t.parent_id, list);
			}
		}
	}

	const numCols = Math.max(1, columns);
	const colBaseWidth = cardWidth + cardGap * 1.35;
	const colHeights: number[] = [];

	// Stagger column starting Y so it's not a rigid row
	for (let c = 0; c < numCols; c++) {
		colHeights.push(boardPadding + Math.round((random() - 0.5) * 36));
	}

	const items: CollisionItem[] = [];
	const getHeight = (task: Task) => (estimateCardHeight ? estimateCardHeight(task) : cardHeight);

	// 3. Layout each root task and its subtasks with organic variation
	for (const root of roots) {
		const expanded = isTaskExpanded(root.id);
		const rawSubtasks = expanded ? (subtasksByParent.get(root.id) ?? []) : [];
		const subtasks = rawSubtasks.filter((st) => st.deleted_at === null);
		const rootH = getHeight(root);

		// Pick among low columns with slight random jitter
		let bestCol = 0;
		let minH = Infinity;
		for (let c = 0; c < numCols; c++) {
			const h = (colHeights[c] ?? boardPadding) + (random() - 0.5) * 40;
			if (h < minH) {
				minH = h;
				bestCol = c;
			}
		}

		// Organic non-grid jitter
		const jitterX = Math.round((random() - 0.5) * 32);
		const jitterY = Math.round((random() - 0.5) * 24);

		const rootX = Math.max(
			boardPadding,
			Math.round(boardPadding + bestCol * colBaseWidth + jitterX),
		);
		const rootY = Math.max(
			boardPadding,
			Math.round((colHeights[bestCol] ?? boardPadding) + jitterY),
		);

		items.push({ id: root.id, x: rootX, y: rootY, width: cardWidth, height: rootH });

		let clusterMaxY = rootY + rootH;

		// Place subtasks adjacent/orbiting the parent note
		if (subtasks.length > 0) {
			const maxRows = 2;
			const subW = subtaskCardWidth ?? cardWidth;
			const subH = subtaskCardHeight ?? cardHeight;
			subtasks.forEach((st, idx) => {
				const subCol = Math.floor(idx / maxRows);
				const subRow = idx % maxRows;
				const stH = getHeight(st);

				// Slight organic scatter so subtasks look like natural sticky notes
				const subJitterX = Math.round((random() - 0.5) * 16);
				const subJitterY = Math.round((random() - 0.5) * 16);

				const subX = Math.max(
					boardPadding,
					rootX + (cardWidth + cardGap) + subCol * (subW + cardGap) + subJitterX,
				);
				const subY = Math.max(boardPadding, rootY + subRow * (subH + cardGap) + subJitterY);

				items.push({ id: st.id, x: subX, y: subY, width: subW, height: stH });
				clusterMaxY = Math.max(clusterMaxY, subY + stH);
			});
		}

		// Update column height with organic gap
		const randomGap = cardGap + Math.round(random() * 20);
		colHeights[bestCol] = clusterMaxY + randomGap;
	}

	// 4. Resolve any collisions between cards with bubble gap around expanded clusters
	const subtaskToParent = new Map<string, string>();
	const parentClusters = new Set<string>();
	for (const root of roots) {
		if (!isTaskExpanded(root.id)) continue;
		const rawSubtasks = subtasksByParent.get(root.id) ?? [];
		const subtasks = rawSubtasks.filter((st) => st.deleted_at === null);
		if (subtasks.length === 0) continue;
		parentClusters.add(root.id);
		for (const st of subtasks) {
			subtaskToParent.set(st.id, root.id);
		}
	}

	const getGap = (idA: string, idB: string): number => {
		const pA = subtaskToParent.get(idA) ?? (parentClusters.has(idA) ? idA : null);
		const pB = subtaskToParent.get(idB) ?? (parentClusters.has(idB) ? idB : null);
		if (!pA && !pB) return cardGap;
		if (pA && pB && pA === pB) return cardGap;
		return subtaskBubbleGap;
	};

	return resolveCollisions(items, cardGap, boardPadding, new Set(), 80, getGap);
}

export interface AllocateFreeformPositionsParams {
	rootTasks: Task[];
	displayedTasks: Task[];
	taskSubtasksMap: Map<string, Task[]>;
	isTaskExpanded: (taskId: string) => boolean;
	transientPositions?: Record<string, Point>;
	cardWidth?: number;
	cardHeight?: number;
	subtaskCardWidth?: number;
	subtaskCardHeight?: number;
	cardGap?: number;
	subtaskBubbleGap?: number;
	boardPadding?: number;
	defaultColumns?: number;
	estimateCardHeight?: (task: Task) => number;
}

/**
 * Positions tasks on the fly for the freeform view:
 * - Keeps track of parent tasks (using saved coordinates, transient drag, or default position)
 * - Positions subtasks on the fly near their parent note
 * - Moves other tasks to make space when subtasks are expanded
 */
export function allocateFreeformPositions(
	params: AllocateFreeformPositionsParams,
): Record<string, Point> {
	const {
		rootTasks,
		displayedTasks,
		taskSubtasksMap,
		isTaskExpanded,
		transientPositions = {},
		cardWidth = DEFAULT_CARD_WIDTH,
		cardHeight = DEFAULT_CARD_HEIGHT,
		subtaskCardWidth,
		subtaskCardHeight,
		cardGap = 24,
		subtaskBubbleGap = DEFAULT_SUBTASK_BUBBLE_GAP,
		boardPadding = 32,
		defaultColumns = 4,
		estimateCardHeight,
	} = params;

	const items: CollisionItem[] = [];
	const fixedIds = new Set<string>();
	const initialPositions: Record<string, Point> = {};

	const getHeight = (task: Task) => (estimateCardHeight ? estimateCardHeight(task) : cardHeight);

	function defaultPosition(index: number): Point {
		return {
			x: boardPadding + (index % defaultColumns) * (cardWidth + cardGap),
			y: boardPadding + Math.floor(index / defaultColumns) * (cardHeight + cardGap + 12),
		};
	}

	// 1. Position root tasks (using transient drag, saved coordinates, or default position)
	rootTasks.forEach((task, index) => {
		const transient = transientPositions[task.id];
		let pos: Point;
		if (transient) {
			pos = transient;
			fixedIds.add(task.id);
		} else if (typeof task.freeform_x === "number" && typeof task.freeform_y === "number") {
			pos = { x: task.freeform_x, y: task.freeform_y };
		} else {
			pos = defaultPosition(index);
		}
		initialPositions[task.id] = pos;
		items.push({
			id: task.id,
			x: pos.x,
			y: pos.y,
			width: cardWidth,
			height: getHeight(task),
		});
	});

	// 2. Position subtasks on the fly near their parent
	for (const root of rootTasks) {
		if (!isTaskExpanded(root.id)) continue;
		const subtasks = (taskSubtasksMap.get(root.id) ?? []).filter((st) => st.deleted_at === null);
		if (subtasks.length === 0) continue;

		const parentPos = initialPositions[root.id] ?? defaultPosition(0);
		fixedIds.add(root.id);

		const maxRows = 2;
		const subW = subtaskCardWidth ?? cardWidth;
		const subH = subtaskCardHeight ?? cardHeight;
		subtasks.forEach((st, idx) => {
			const transient = transientPositions[st.id];
			let subPos: Point;
			if (transient) {
				subPos = transient;
				fixedIds.add(st.id);
			} else {
				const subCol = Math.floor(idx / maxRows);
				const subRow = idx % maxRows;
				subPos = {
					x: parentPos.x + (cardWidth + cardGap) + subCol * (subW + cardGap),
					y: parentPos.y + subRow * (subH + cardGap),
				};
				fixedIds.add(st.id);
			}
			initialPositions[st.id] = subPos;
			items.push({
				id: st.id,
				x: subPos.x,
				y: subPos.y,
				width: subW,
				height: getHeight(st),
			});
		});
	}

	// 3. Any displayed orphan tasks not yet placed
	for (const task of displayedTasks) {
		if (!initialPositions[task.id]) {
			const transient = transientPositions[task.id];
			const pos = transient ?? defaultPosition(items.length);
			if (transient) fixedIds.add(task.id);
			initialPositions[task.id] = pos;
			const isSub = isFreeformSubtask(task);
			const taskW = isSub ? (subtaskCardWidth ?? cardWidth) : cardWidth;
			items.push({
				id: task.id,
				x: pos.x,
				y: pos.y,
				width: taskW,
				height: getHeight(task),
			});
		}
	}

	// 4. Resolve collisions so other tasks move to make space for expanded subtasks.
	// Create a bubble of space around each parent + subtask cluster by enforcing
	// subtaskBubbleGap between any card in the cluster and any external task.
	const subtaskToParent = new Map<string, string>();
	const parentClusters = new Set<string>();

	for (const root of rootTasks) {
		if (!isTaskExpanded(root.id)) continue;
		const subtasks = (taskSubtasksMap.get(root.id) ?? []).filter((st) => st.deleted_at === null);
		if (subtasks.length === 0) continue;
		parentClusters.add(root.id);
		for (const st of subtasks) {
			subtaskToParent.set(st.id, root.id);
		}
	}

	const getGap = (idA: string, idB: string): number => {
		const pA = subtaskToParent.get(idA) ?? (parentClusters.has(idA) ? idA : null);
		const pB = subtaskToParent.get(idB) ?? (parentClusters.has(idB) ? idB : null);

		// If neither is part of an expanded parent-subtask cluster, standard gap
		if (!pA && !pB) return cardGap;
		// If both belong to the exact same parent cluster (e.g. parent & subtask, or two sibling subtasks), keep them close with cardGap
		if (pA && pB && pA === pB) return cardGap;
		// If one belongs to an expanded cluster and the other is outside, push with subtaskBubbleGap!
		return subtaskBubbleGap;
	};

	return resolveCollisions(items, cardGap, boardPadding, fixedIds, 80, getGap);
}
