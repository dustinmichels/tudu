import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createPinia, setActivePinia } from "pinia";
import type { Task } from "../src/models/index.ts";

mock.module("@tauri-apps/api/core", () => ({
	invoke: async (command: string, args?: unknown) => {
		if (command === "update_task") {
			const { task } = (args as { task: Record<string, unknown> }) || {};
			return { ...task };
		}
		return null;
	},
}));

import { useTaskStore } from "../src/stores/tasks.ts";
import { useUIStore } from "../src/stores/ui.ts";
import {
	DEFAULT_CARD_HEIGHT,
	DEFAULT_CARD_WIDTH,
	DEFAULT_SUBTASK_CARD_HEIGHT,
	DEFAULT_SUBTASK_CARD_WIDTH,
	allocateFreeformPositions,
	calculateYarnCurve,
	computeAutoLayoutPositions,
	findFreeSlotNearParent,
	getFreeformCardDimensions,
	getFreeformDisplayedTasks,
	isFreeformSubtask,
	persistFreeformPositions,
	selectFreeformTasks,
} from "../src/utils/freeform.ts";

function makeTask(
	id: string,
	parentId: string | null = null,
	title = id,
	completed = false,
	freeform_x?: number,
	freeform_y?: number,
): Task {
	return {
		id,
		uid: null,
		parent_id: parentId,
		list_id: "list-1",
		title,
		description: null,
		due: null,
		is_all_day: false,
		rrule: null,
		priority: null,
		location: null,
		url: null,
		completed,
		completed_at: null,
		freeform_x,
		freeform_y,
		created_at: "2026-09-13T00:00:00Z",
		updated_at: "2026-09-13T00:00:00Z",
		deleted_at: null,
	};
}

describe("Freeform View Subtasks and Yarn Lines Integration", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	test("subtasks are kept inside parent sticky note when collapsed", () => {
		const uiStore = useUIStore();
		const taskStore = useTaskStore();

		const parent = makeTask("p1", null, "Parent Project");
		const sub1 = makeTask("s1", "p1", "Subtask 1");
		const sub2 = makeTask("s2", "p1", "Subtask 2");

		taskStore.tasks = [parent, sub1, sub2];
		taskStore.allTasks = [parent, sub1, sub2];

		// Subtasks are collapsed by default
		expect(uiStore.showSubtasksInline).toBe(false);
		expect(uiStore.isTaskSubtasksExpanded("p1")).toBe(false);

		const layout = getFreeformDisplayedTasks({
			candidateTasks: selectFreeformTasks(
				taskStore.tasks,
				taskStore.incompleteTasks,
				taskStore.filteredTasks,
				taskStore.includeCompleted,
				"",
			),
			allTasks: taskStore.allTasks,
			isTaskExpanded: (id) => uiStore.isTaskSubtasksExpanded(id),
			includeCompleted: taskStore.includeCompleted,
		});

		// Only parent note is displayed on the board
		expect(layout.displayedTasks.map((t) => t.id)).toEqual(["p1"]);
		expect(layout.rootTasks.map((t) => t.id)).toEqual(["p1"]);

		// Subtasks are accessible via taskSubtasksMap to render as checkboxes inside the note
		const insideSubtasks = layout.taskSubtasksMap.get("p1") ?? [];
		expect(insideSubtasks.map((t) => t.id)).toEqual(["s1", "s2"]);
		expect(insideSubtasks.map((t) => t.title)).toEqual(["Subtask 1", "Subtask 2"]);
	});

	test("global toggle explodes subtasks into their own sticky notes", () => {
		const uiStore = useUIStore();
		const taskStore = useTaskStore();

		const parent = makeTask("p1", null, "Parent Project");
		const sub1 = makeTask("s1", "p1", "Subtask 1");
		const sub2 = makeTask("s2", "p1", "Subtask 2");

		taskStore.tasks = [parent, sub1, sub2];
		taskStore.allTasks = [parent, sub1, sub2];

		// Toggle global expand
		uiStore.toggleSubtasksInline();
		expect(uiStore.showSubtasksInline).toBe(true);
		expect(uiStore.isTaskSubtasksExpanded("p1")).toBe(true);

		const layout = getFreeformDisplayedTasks({
			candidateTasks: selectFreeformTasks(
				taskStore.tasks,
				taskStore.incompleteTasks,
				taskStore.filteredTasks,
				taskStore.includeCompleted,
				"",
			),
			allTasks: taskStore.allTasks,
			isTaskExpanded: (id) => uiStore.isTaskSubtasksExpanded(id),
			includeCompleted: taskStore.includeCompleted,
		});

		// All 3 notes are now displayed on the board
		expect(layout.displayedTasks.map((t) => t.id)).toEqual(["p1", "s1", "s2"]);
	});

	test("per-task toggle explodes only that parent's subtasks", () => {
		const uiStore = useUIStore();
		const taskStore = useTaskStore();

		const parent1 = makeTask("p1", null, "Parent 1");
		const sub1 = makeTask("s1", "p1", "Subtask 1");
		const parent2 = makeTask("p2", null, "Parent 2");
		const sub2 = makeTask("s2", "p2", "Subtask 2");

		taskStore.tasks = [parent1, sub1, parent2, sub2];
		taskStore.allTasks = [parent1, sub1, parent2, sub2];

		// Explode only parent1
		uiStore.toggleTaskSubtasks("p1");
		expect(uiStore.isTaskSubtasksExpanded("p1")).toBe(true);
		expect(uiStore.isTaskSubtasksExpanded("p2")).toBe(false);

		const layout = getFreeformDisplayedTasks({
			candidateTasks: selectFreeformTasks(
				taskStore.tasks,
				taskStore.incompleteTasks,
				taskStore.filteredTasks,
				taskStore.includeCompleted,
				"",
			),
			allTasks: taskStore.allTasks,
			isTaskExpanded: (id) => uiStore.isTaskSubtasksExpanded(id),
			includeCompleted: taskStore.includeCompleted,
		});

		// p1 and its exploded child s1 are displayed, plus p2 (whose child s2 remains collapsed inside)
		expect(layout.displayedTasks.map((t) => t.id)).toEqual(["p1", "s1", "p2"]);
		expect(layout.taskSubtasksMap.get("p2")?.map((t) => t.id)).toEqual(["s2"]);
	});

	test("yarn line calculation connects parent pushpin to subtask pushpin with cubic bezier", () => {
		const CARD_WIDTH = 224;
		const PIN_OFFSET_X = CARD_WIDTH / 2; // 112
		const PIN_OFFSET_Y = 10;

		const parentPos = { x: 32, y: 32 };
		const subtaskPos = { x: 280, y: 188 };

		const start = {
			x: parentPos.x + PIN_OFFSET_X,
			y: parentPos.y + PIN_OFFSET_Y,
		};
		const end = {
			x: subtaskPos.x + PIN_OFFSET_X,
			y: subtaskPos.y + PIN_OFFSET_Y,
		};

		const path = calculateYarnCurve(start, end, 0);

		// Path connects start to end
		expect(path.startsWith(`M ${start.x} ${start.y} C `)).toBe(true);
		expect(path.endsWith(` ${end.x} ${end.y}`)).toBe(true);

		// Control points have natural sag
		const parts = path.split(" ");
		const cp1y = Number(parts[5]?.replace(",", "") ?? "0");
		const cp2y = Number(parts[7]?.replace(",", "") ?? "0");
		expect(cp1y).toBeGreaterThan(start.y);
		expect(cp2y).toBeGreaterThan(start.y);
	});

	test("collision-free placement prevents exploded subtasks from overlapping roots or peers", () => {
		const CARD_WIDTH = 224;
		const CARD_HEIGHT = 132;
		const GAP = 24;

		const parentPos = { x: 32, y: 32 };
		// Root grid occupies (32, 32), (280, 32), (528, 32), (776, 32)
		const occupied = [
			{ x: 32, y: 32, width: CARD_WIDTH, height: CARD_HEIGHT },
			{ x: 280, y: 32, width: CARD_WIDTH, height: CARD_HEIGHT },
			{ x: 528, y: 32, width: CARD_WIDTH, height: CARD_HEIGHT },
			{ x: 776, y: 32, width: CARD_WIDTH, height: CARD_HEIGHT },
		];

		const sub1Slot = findFreeSlotNearParent(parentPos, occupied, CARD_WIDTH, CARD_HEIGHT, GAP);
		occupied.push({ x: sub1Slot.x, y: sub1Slot.y, width: CARD_WIDTH, height: CARD_HEIGHT });

		const sub2Slot = findFreeSlotNearParent(parentPos, occupied, CARD_WIDTH, CARD_HEIGHT, GAP);
		occupied.push({ x: sub2Slot.x, y: sub2Slot.y, width: CARD_WIDTH, height: CARD_HEIGHT });

		// Both subtask slots must be distinct and non-overlapping with any occupied note
		expect(sub1Slot).not.toEqual(sub2Slot);

		for (let i = 0; i < occupied.length - 1; i++) {
			for (let j = i + 1; j < occupied.length; j++) {
				const r1 = occupied[i]!;
				const r2 = occupied[j]!;
				const overlapX = Math.abs(r1.x - r2.x) < CARD_WIDTH + GAP;
				const overlapY = Math.abs(r1.y - r2.y) < CARD_HEIGHT + GAP;
				expect(overlapX && overlapY).toBe(false);
			}
		}
	});

	test("collapsing subtasks folds them back inside parent note", () => {
		const uiStore = useUIStore();
		const taskStore = useTaskStore();

		const parent = makeTask("p1", null, "Parent");
		const sub = makeTask("s1", "p1", "Sub");

		taskStore.tasks = [parent, sub];
		taskStore.allTasks = [parent, sub];

		// Expand
		uiStore.toggleTaskSubtasks("p1");
		let layout = getFreeformDisplayedTasks({
			candidateTasks: [parent, sub],
			allTasks: [parent, sub],
			isTaskExpanded: (id) => uiStore.isTaskSubtasksExpanded(id),
			includeCompleted: true,
		});
		expect(layout.displayedTasks.length).toBe(2);

		// Collapse
		uiStore.toggleTaskSubtasks("p1");
		layout = getFreeformDisplayedTasks({
			candidateTasks: [parent, sub],
			allTasks: [parent, sub],
			isTaskExpanded: (id) => uiStore.isTaskSubtasksExpanded(id),
			includeCompleted: true,
		});
		expect(layout.displayedTasks.length).toBe(1);
		expect(layout.displayedTasks[0]?.id).toBe("p1");
		expect(layout.taskSubtasksMap.get("p1")?.length).toBe(1);
	});

	test("auto layout reassigns positions of all tasks, eliminates collisions and keeps subtasks close to parents", async () => {
		const uiStore = useUIStore();
		const taskStore = useTaskStore();

		// Create tasks with overlapping/bad initial positions
		const p1 = makeTask("p1", null, "Parent 1", false, 50, 50);
		const s1 = makeTask("s1", "p1", "Subtask 1", false, 50, 50); // Overlapping p1!
		const s2 = makeTask("s2", "p1", "Subtask 2", false, 50, 50); // Overlapping p1!
		const p2 = makeTask("p2", null, "Parent 2", false, 100, 100);

		taskStore.tasks = [p1, s1, s2, p2];
		taskStore.allTasks = [p1, s1, s2, p2];

		// Expand p1's subtasks
		uiStore.toggleTaskSubtasks("p1");

		const layout = getFreeformDisplayedTasks({
			candidateTasks: taskStore.tasks,
			allTasks: taskStore.allTasks,
			isTaskExpanded: (id) => uiStore.isTaskSubtasksExpanded(id),
			includeCompleted: true,
		});

		expect(layout.displayedTasks.length).toBe(4);

		const newPositions = computeAutoLayoutPositions({
			rootTasks: layout.rootTasks,
			taskSubtasksMap: layout.taskSubtasksMap,
			isTaskExpanded: (id) => uiStore.isTaskSubtasksExpanded(id),
			columns: 4,
		});

		// Persist parent tasks to the store (subtasks are positioned on the fly)
		const rootPositions = {
			p1: newPositions["p1"]!,
			p2: newPositions["p2"]!,
		};
		await persistFreeformPositions(rootPositions, (input, options) =>
			taskStore.updateTask(input, options),
		);

		// Parent tasks have updated positions in the store
		const updatedP1 = taskStore.tasks.find((t) => t.id === "p1");
		const updatedP2 = taskStore.tasks.find((t) => t.id === "p2");

		expect(updatedP1?.freeform_x).toBe(newPositions["p1"]?.x);
		expect(updatedP1?.freeform_y).toBe(newPositions["p1"]?.y);
		expect(updatedP2?.freeform_x).toBe(newPositions["p2"]?.x);
		expect(updatedP2?.freeform_y).toBe(newPositions["p2"]?.y);

		// Subtasks are close to parent (short distance, organic clustering)
		const distS1 = Math.hypot(
			newPositions["s1"]!.x - newPositions["p1"]!.x,
			newPositions["s1"]!.y - newPositions["p1"]!.y,
		);
		const distS2 = Math.hypot(
			newPositions["s2"]!.x - newPositions["p1"]!.x,
			newPositions["s2"]!.y - newPositions["p1"]!.y,
		);
		expect(distS1).toBeLessThan(450);
		expect(distS2).toBeLessThan(450);

		const CARD_W = 224;
		const CARD_H = 132;
		const cards = [
			{ id: "p1", x: newPositions["p1"]!.x, y: newPositions["p1"]!.y },
			{ id: "s1", x: newPositions["s1"]!.x, y: newPositions["s1"]!.y },
			{ id: "s2", x: newPositions["s2"]!.x, y: newPositions["s2"]!.y },
			{ id: "p2", x: newPositions["p2"]!.x, y: newPositions["p2"]!.y },
		];

		for (let i = 0; i < cards.length - 1; i++) {
			for (let j = i + 1; j < cards.length; j++) {
				const a = cards[i]!;
				const b = cards[j]!;
				const overlapX = a.x < b.x + CARD_W && a.x + CARD_W > b.x;
				const overlapY = a.y < b.y + CARD_H && a.y + CARD_H > b.y;
				expect(overlapX && overlapY).toBe(false);
			}
		}
	});

	test("formats and sizes subtasks differently than parent tasks in freeform view", () => {
		const parent = makeTask("p1", null, "Parent Project");
		const subtask = makeTask("s1", "p1", "Subtask Note");

		// Subtask identification
		expect(isFreeformSubtask(parent)).toBe(false);
		expect(isFreeformSubtask(subtask)).toBe(true);

		// Parent dimensions vs Subtask dimensions: subtask is smaller
		const parentDims = getFreeformCardDimensions(parent);
		const subtaskDims = getFreeformCardDimensions(subtask);

		expect(parentDims.width).toBe(DEFAULT_CARD_WIDTH); // 224
		expect(parentDims.height).toBe(DEFAULT_CARD_HEIGHT); // 132
		expect(subtaskDims.width).toBe(DEFAULT_SUBTASK_CARD_WIDTH); // 184
		expect(subtaskDims.height).toBe(DEFAULT_SUBTASK_CARD_HEIGHT); // 96

		expect(subtaskDims.width).toBeLessThan(parentDims.width);
		expect(subtaskDims.height).toBeLessThan(parentDims.height);
	});

	test("allocateFreeformPositions allocates space for smaller subtasks without collision", () => {
		const parent = makeTask("p1", null, "Parent", false, 32, 32);
		const sub1 = makeTask("s1", "p1", "Sub 1");
		const sub2 = makeTask("s2", "p1", "Sub 2");
		const subMap = new Map([["p1", [sub1, sub2]]]);

		const positions = allocateFreeformPositions({
			rootTasks: [parent],
			displayedTasks: [parent, sub1, sub2],
			taskSubtasksMap: subMap,
			isTaskExpanded: () => true,
			cardWidth: DEFAULT_CARD_WIDTH,
			cardHeight: DEFAULT_CARD_HEIGHT,
			subtaskCardWidth: DEFAULT_SUBTASK_CARD_WIDTH,
			subtaskCardHeight: DEFAULT_SUBTASK_CARD_HEIGHT,
		});

		expect(positions["p1"]).toEqual({ x: 32, y: 32 });
		expect(positions["s1"]).toBeDefined();
		expect(positions["s2"]).toBeDefined();

		// First subtask should be placed directly next to parent card
		const expectedFirstSubX = 32 + DEFAULT_CARD_WIDTH + 24; // 32 + 224 + 24 = 280
		expect(positions["s1"]?.x).toBe(expectedFirstSubX);
		expect(positions["s1"]?.y).toBe(32);

		// Second subtask is placed below the first (maxRows = 2)
		expect(positions["s2"]?.x).toBe(expectedFirstSubX);
		expect(positions["s2"]?.y).toBe(32 + DEFAULT_SUBTASK_CARD_HEIGHT + 24);
	});
	test("creates a bubble of space around parent and subtasks, pushing other tasks further away", () => {
		const parent = makeTask("p1", null, "Parent", false, 32, 32);
		const sub1 = makeTask("s1", "p1", "Sub 1");
		const otherRoot = makeTask("p2", null, "Other Task", false, 280, 32);
		const subMap = new Map([["p1", [sub1]]]);

		// Standard gap is 24, bubble gap is 48
		const positions = allocateFreeformPositions({
			rootTasks: [parent, otherRoot],
			displayedTasks: [parent, sub1, otherRoot],
			taskSubtasksMap: subMap,
			isTaskExpanded: (id) => id === "p1",
			cardWidth: DEFAULT_CARD_WIDTH,
			cardHeight: DEFAULT_CARD_HEIGHT,
			subtaskCardWidth: DEFAULT_SUBTASK_CARD_WIDTH,
			subtaskCardHeight: DEFAULT_SUBTASK_CARD_HEIGHT,
			cardGap: 24,
			subtaskBubbleGap: 48,
		});

		// Subtask s1 is kept close to parent p1 (with cardGap 24)
		const subGap = positions["s1"]!.x - (positions["p1"]!.x + DEFAULT_CARD_WIDTH);
		expect(subGap).toBe(24);

		// Other root task p2 was pushed away, respecting the bubble gap (at least 48px from s1 or p1)
		const p2Pos = positions["p2"]!;
		const s1Pos = positions["s1"]!;
		const p1Pos = positions["p1"]!;

		// Distance between other task p2 and the parent-subtask cluster cards
		const gapFromS1X = Math.abs(p2Pos.x - (s1Pos.x + DEFAULT_SUBTASK_CARD_WIDTH));
		const gapFromS1Y = Math.abs(p2Pos.y - (s1Pos.y + DEFAULT_SUBTASK_CARD_HEIGHT));
		const gapFromP1Y = Math.abs(p2Pos.y - (p1Pos.y + DEFAULT_CARD_HEIGHT));

		// p2 should be pushed away by at least 48px in either X or Y
		const isPushedWithBubble = gapFromS1X >= 48 || gapFromS1Y >= 48 || gapFromP1Y >= 48;
		expect(isPushedWithBubble).toBe(true);
	});
});
