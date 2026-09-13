import { describe, expect, test } from "bun:test";
import type { Task, UpdateTaskInput } from "../src/models/index.ts";
import {
	allocateFreeformPositions,
	calculateExplodedSubtaskPosition,
	calculateYarnCurve,
	computeAutoLayoutPositions,
	findFreeSlotNearParent,
	getFreeformDisplayedTasks,
	persistFreeformPosition,
	persistFreeformPositions,
	selectFreeformTasks,
} from "../src/utils/freeform.ts";
function makeTask(id: string, parentId: string | null = null, completed = false): Task {
	return {
		id,
		uid: null,
		parent_id: parentId,
		list_id: "selected-list",
		title: id,
		description: null,
		due: null,
		is_all_day: false,
		rrule: null,
		priority: null,
		location: null,
		url: null,
		completed,
		completed_at: null,
		created_at: "2026-09-13T00:00:00Z",
		updated_at: "2026-09-13T00:00:00Z",
		deleted_at: null,
	};
}

describe("freeform view behavior", () => {
	test("uses the selected task set unchanged, including subtasks", () => {
		const parent = makeTask("parent");
		const subtask = makeTask("subtask", parent.id);
		const selectedTasks = [parent, subtask];

		expect(selectFreeformTasks(selectedTasks, [parent], [], true, "")).toEqual([parent, subtask]);
		expect(selectFreeformTasks(selectedTasks, [parent], [], false, "")).toEqual([parent]);
		expect(selectFreeformTasks(selectedTasks, [parent], [subtask], true, "sub")).toEqual([subtask]);
	});

	test("persists rounded drag-end coordinates immediately", async () => {
		let received: { input: UpdateTaskInput; options: { debounceMs: number } } | undefined;
		const updateTask = async (
			input: UpdateTaskInput,
			options: { debounceMs: number },
		): Promise<Task> => {
			received = { input, options };
			return makeTask(input.id);
		};

		await persistFreeformPosition("task-1", { x: 183.6, y: 295.5 }, updateTask);

		expect(received).toEqual({
			input: { id: "task-1", freeform_x: 184, freeform_y: 296 },
			options: { debounceMs: 0 },
		});
	});

	test("calculateYarnCurve creates an organic SVG cubic bezier path", () => {
		const start = { x: 100, y: 100 };
		const end = { x: 400, y: 100 };
		const curve = calculateYarnCurve(start, end, 0);

		expect(curve.startsWith("M 100 100 C ")).toBe(true);
		expect(curve.endsWith(" 400 100")).toBe(true);

		// Control points should have positive sag (y > 100)
		// Format: M startX startY C cp1x cp1y, cp2x cp2y, endX endY
		const parts = curve.split(" ");
		const cp1y = Number(parts[5]?.replace(",", "") ?? "0");
		const cp2y = Number(parts[7]?.replace(",", "") ?? "0");
		expect(cp1y).toBeGreaterThan(100);
		expect(cp2y).toBeGreaterThan(100);
	});

	test("calculateYarnCurve handles vertical orientations with organic bow", () => {
		const start = { x: 100, y: 50 };
		const end = { x: 100, y: 300 };
		const curve = calculateYarnCurve(start, end, 0);

		// With absDx < 60, horizontal bow is added to control points
		const parts = curve.split(" ");
		const cp1x = Number(parts[4] ?? "0");
		expect(cp1x).toBeGreaterThan(100);
	});

	test("calculateExplodedSubtaskPosition offsets subtasks from parent", () => {
		const parentPos = { x: 100, y: 100 };
		const pos0 = calculateExplodedSubtaskPosition(parentPos, 0, 224, 132, 24);
		const pos1 = calculateExplodedSubtaskPosition(parentPos, 1, 224, 132, 24);

		expect(pos0.x).toBeGreaterThan(parentPos.x + 224);
		expect(pos0.y).toBe(parentPos.y);
		expect(pos1.y).toBe(parentPos.y + 132 + 24);
	});
	test("findFreeSlotNearParent finds an unoccupied slot near parent without colliding", () => {
		const parentPos = { x: 32, y: 32 };
		const neighborRoot = { x: 280, y: 32, width: 224, height: 132 }; // at col 1
		const occupied = [{ x: 32, y: 32, width: 224, height: 132 }, neighborRoot];

		const slot1 = findFreeSlotNearParent(parentPos, occupied, 224, 132, 24);
		// Must not collide with parent or neighbor root
		const collidesNeighbor =
			Math.abs(slot1.x - neighborRoot.x) < 224 + 24 &&
			Math.abs(slot1.y - neighborRoot.y) < 132 + 24;
		const collidesParent =
			Math.abs(slot1.x - parentPos.x) < 224 + 24 && Math.abs(slot1.y - parentPos.y) < 132 + 24;

		expect(collidesNeighbor).toBe(false);
		expect(collidesParent).toBe(false);

		// Next child occupies slot1 and finds yet another non-colliding slot
		occupied.push({ x: slot1.x, y: slot1.y, width: 224, height: 132 });
		const slot2 = findFreeSlotNearParent(parentPos, occupied, 224, 132, 24);
		const collidesSlot1 =
			Math.abs(slot2.x - slot1.x) < 224 + 24 && Math.abs(slot2.y - slot1.y) < 132 + 24;
		expect(collidesSlot1).toBe(false);
	});

	test("getFreeformDisplayedTasks keeps subtasks inside parent when collapsed", () => {
		const parent = makeTask("parent-1");
		const sub1 = makeTask("sub-1", "parent-1");
		const sub2 = makeTask("sub-2", "parent-1");

		const result = getFreeformDisplayedTasks({
			candidateTasks: [parent, sub1, sub2],
			allTasks: [parent, sub1, sub2],
			isTaskExpanded: () => false,
			includeCompleted: true,
		});

		expect(result.rootTasks.map((t) => t.id)).toEqual(["parent-1"]);
		expect(result.displayedTasks.map((t) => t.id)).toEqual(["parent-1"]);
		expect(result.taskSubtasksMap.get("parent-1")?.map((t) => t.id)).toEqual(["sub-1", "sub-2"]);
	});

	test("getFreeformDisplayedTasks explodes subtasks when parent is expanded", () => {
		const parent = makeTask("parent-1");
		const sub1 = makeTask("sub-1", "parent-1");
		const sub2 = makeTask("sub-2", "parent-1");

		const result = getFreeformDisplayedTasks({
			candidateTasks: [parent, sub1, sub2],
			allTasks: [parent, sub1, sub2],
			isTaskExpanded: (id) => id === "parent-1",
			includeCompleted: true,
		});

		expect(result.rootTasks.map((t) => t.id)).toEqual(["parent-1"]);
		expect(result.displayedTasks.map((t) => t.id)).toEqual(["parent-1", "sub-1", "sub-2"]);
		expect(result.taskSubtasksMap.get("parent-1")?.map((t) => t.id)).toEqual(["sub-1", "sub-2"]);
	});

	test("getFreeformDisplayedTasks treats orphan subtask as root task", () => {
		const orphan = makeTask("orphan", "non-existent-parent");

		const result = getFreeformDisplayedTasks({
			candidateTasks: [orphan],
			allTasks: [orphan],
			isTaskExpanded: () => false,
			includeCompleted: true,
		});

		expect(result.rootTasks.map((t) => t.id)).toEqual(["orphan"]);
		expect(result.displayedTasks.map((t) => t.id)).toEqual(["orphan"]);
	});

	test("getFreeformDisplayedTasks respects includeCompleted", () => {
		const parent = makeTask("parent-1");
		const activeSub = makeTask("sub-active", "parent-1", false);
		const completedSub = makeTask("sub-done", "parent-1", true);

		const result = getFreeformDisplayedTasks({
			candidateTasks: [parent, activeSub, completedSub],
			allTasks: [parent, activeSub, completedSub],
			isTaskExpanded: () => true,
			includeCompleted: false,
		});

		expect(result.displayedTasks.map((t) => t.id)).toEqual(["parent-1", "sub-active"]);
		expect(result.taskSubtasksMap.get("parent-1")?.map((t) => t.id)).toEqual(["sub-active"]);
	});
});

describe("computeAutoLayoutPositions and persistFreeformPositions", () => {
	test("persists multiple task positions simultaneously", async () => {
		const updatedList: Array<{ input: UpdateTaskInput; options: { debounceMs: number } }> = [];
		const updateTask = async (
			input: UpdateTaskInput,
			options: { debounceMs: number },
		): Promise<Task> => {
			updatedList.push({ input, options });
			return makeTask(input.id);
		};

		const positions = {
			t1: { x: 100.2, y: 150.7 },
			t2: { x: 348.9, y: 150.1 },
		};

		await persistFreeformPositions(positions, updateTask);

		expect(updatedList.length).toBe(2);
		expect(updatedList).toContainEqual({
			input: { id: "t1", freeform_x: 100, freeform_y: 151 },
			options: { debounceMs: 0 },
		});
		expect(updatedList).toContainEqual({
			input: { id: "t2", freeform_x: 349, freeform_y: 150 },
			options: { debounceMs: 0 },
		});
	});

	test("arranges root tasks in a non-grid layout with zero collisions", () => {
		const tasks = [makeTask("t1"), makeTask("t2"), makeTask("t3"), makeTask("t4"), makeTask("t5")];

		const CARD_WIDTH = 224;
		const CARD_HEIGHT = 132;
		const CARD_GAP = 24;
		const BOARD_PADDING = 32;

		const positions = computeAutoLayoutPositions({
			rootTasks: tasks,
			cardWidth: CARD_WIDTH,
			cardHeight: CARD_HEIGHT,
			cardGap: CARD_GAP,
			boardPadding: BOARD_PADDING,
			columns: 4,
		});

		// All tasks have positions defined
		for (const t of tasks) {
			expect(positions[t.id]).toBeDefined();
		}

		// Verify zero collisions between all pairs
		const cards = tasks.map((t) => ({
			id: t.id,
			x: positions[t.id]!.x,
			y: positions[t.id]!.y,
			width: CARD_WIDTH,
			height: CARD_HEIGHT,
		}));

		for (let i = 0; i < cards.length - 1; i++) {
			for (let j = i + 1; j < cards.length; j++) {
				const a = cards[i]!;
				const b = cards[j]!;
				const overlapX = a.x < b.x + b.width && a.x + a.width > b.x;
				const overlapY = a.y < b.y + b.height && a.y + a.height > b.y;
				expect(overlapX && overlapY).toBe(false);
			}
		}
	});

	test("produces different outputs when called twice (randomness, not a rigid grid)", () => {
		const tasks = [makeTask("t1"), makeTask("t2"), makeTask("t3"), makeTask("t4")];

		const run1 = computeAutoLayoutPositions({ rootTasks: tasks });
		const run2 = computeAutoLayoutPositions({ rootTasks: tasks });

		// Due to organic jitter and random placement, outputs differ
		const isDifferent = tasks.some(
			(t) => run1[t.id]?.x !== run2[t.id]?.x || run1[t.id]?.y !== run2[t.id]?.y,
		);
		expect(isDifferent).toBe(true);
	});

	test("keeps expanded subtasks adjacent to parent without any collisions", () => {
		const parent = makeTask("parent-1");
		const sub1 = makeTask("sub-1", "parent-1");
		const sub2 = makeTask("sub-2", "parent-1");
		const otherRoot = makeTask("root-2");

		const CARD_WIDTH = 224;
		const CARD_HEIGHT = 132;
		const CARD_GAP = 24;
		const BOARD_PADDING = 32;

		const subtasksMap = new Map<string, Task[]>([["parent-1", [sub1, sub2]]]);

		const positions = computeAutoLayoutPositions({
			rootTasks: [parent, otherRoot],
			taskSubtasksMap: subtasksMap,
			isTaskExpanded: (id) => id === "parent-1",
			cardWidth: CARD_WIDTH,
			cardHeight: CARD_HEIGHT,
			cardGap: CARD_GAP,
			boardPadding: BOARD_PADDING,
			columns: 4,
		});

		const parentPos = positions["parent-1"]!;
		const sub1Pos = positions["sub-1"]!;
		const sub2Pos = positions["sub-2"]!;
		const otherPos = positions["root-2"]!;

		expect(parentPos).toBeDefined();
		expect(sub1Pos).toBeDefined();
		expect(sub2Pos).toBeDefined();
		expect(otherPos).toBeDefined();

		// Subtasks are close to parent (bounded distance)
		const distSub1 = Math.hypot(sub1Pos.x - parentPos.x, sub1Pos.y - parentPos.y);
		const distSub2 = Math.hypot(sub2Pos.x - parentPos.x, sub2Pos.y - parentPos.y);
		expect(distSub1).toBeLessThan(450);
		expect(distSub2).toBeLessThan(450);

		// Verify zero collisions between all pairs of cards
		const cards = [
			{ id: "parent-1", ...parentPos, width: CARD_WIDTH, height: CARD_HEIGHT },
			{ id: "sub-1", ...sub1Pos, width: CARD_WIDTH, height: CARD_HEIGHT },
			{ id: "sub-2", ...sub2Pos, width: CARD_WIDTH, height: CARD_HEIGHT },
			{ id: "root-2", ...otherPos, width: CARD_WIDTH, height: CARD_HEIGHT },
		];

		for (let i = 0; i < cards.length - 1; i++) {
			for (let j = i + 1; j < cards.length; j++) {
				const c1 = cards[i]!;
				const c2 = cards[j]!;
				const overlapX = c1.x < c2.x + c2.width && c1.x + c1.width > c2.x;
				const overlapY = c1.y < c2.y + c2.height && c1.y + c1.height > c2.y;
				const collides = overlapX && overlapY;
				expect(collides).toBe(false);
			}
		}
	});

	test("does not allocate separate positions for collapsed subtasks", () => {
		const parent = makeTask("parent-1");
		const sub1 = makeTask("sub-1", "parent-1");
		const sub2 = makeTask("sub-2", "parent-1");
		const otherRoot = makeTask("root-2");

		const subtasksMap = new Map<string, Task[]>([["parent-1", [sub1, sub2]]]);

		const positions = computeAutoLayoutPositions({
			rootTasks: [parent, otherRoot],
			taskSubtasksMap: subtasksMap,
			isTaskExpanded: () => false, // collapsed
		});

		expect(positions["parent-1"]).toBeDefined();
		expect(positions["root-2"]).toBeDefined();
		expect(positions["sub-1"]).toBeUndefined();
		expect(positions["sub-2"]).toBeUndefined();
	});

	test("moves tasks to make space when subtasks are expanded (allocateFreeformPositions)", () => {
		const rootA = makeTask("A", null, false);
		rootA.freeform_x = 32;
		rootA.freeform_y = 32;

		const rootB = makeTask("B", null, false);
		rootB.freeform_x = 280;
		rootB.freeform_y = 32; // Occupies where subtask A1 wants to go

		const subA1 = makeTask("A1", "A", false);
		const subA2 = makeTask("A2", "A", false);
		const subMap = new Map([["A", [subA1, subA2]]]);

		// 1. When collapsed: A and B retain their positions
		const collapsed = allocateFreeformPositions({
			rootTasks: [rootA, rootB],
			displayedTasks: [rootA, rootB],
			taskSubtasksMap: subMap,
			isTaskExpanded: () => false,
		});
		expect(collapsed["A"]).toEqual({ x: 32, y: 32 });
		expect(collapsed["B"]).toEqual({ x: 280, y: 32 });
		expect(collapsed["A1"]).toBeUndefined();

		// 2. When expanded: A1 and A2 are placed beside A, and B moves to make space!
		const expanded = allocateFreeformPositions({
			rootTasks: [rootA, rootB],
			displayedTasks: [rootA, rootB, subA1, subA2],
			taskSubtasksMap: subMap,
			isTaskExpanded: (id) => id === "A",
		});

		expect(expanded["A"]).toEqual({ x: 32, y: 32 });
		expect(expanded["A1"]).toBeDefined();
		expect(expanded["A2"]).toBeDefined();
		expect(expanded["B"]).toBeDefined();

		// Task B was moved away from (280, 32) so A1 and A2 have room!
		expect(expanded["B"]?.x !== 280 || expanded["B"]?.y !== 32).toBe(true);

		// Zero collisions between any pair
		const allCards = [
			{ id: "A", ...expanded["A"]!, width: 224, height: 132 },
			{ id: "A1", ...expanded["A1"]!, width: 224, height: 132 },
			{ id: "A2", ...expanded["A2"]!, width: 224, height: 132 },
			{ id: "B", ...expanded["B"]!, width: 224, height: 132 },
		];

		for (let i = 0; i < allCards.length - 1; i++) {
			for (let j = i + 1; j < allCards.length; j++) {
				const a = allCards[i]!;
				const b = allCards[j]!;
				const overlapX = a.x < b.x + b.width && a.x + a.width > b.x;
				const overlapY = a.y < b.y + b.height && a.y + a.height > b.y;
				expect(overlapX && overlapY).toBe(false);
			}
		}
	});

	test("handles orphan subtasks as root tasks", () => {
		const orphan = makeTask("orphan", "non-existent-parent");
		const normal = makeTask("normal");

		const positions = computeAutoLayoutPositions({
			rootTasks: [orphan, normal],
			columns: 4,
		});

		expect(positions["orphan"]).toBeDefined();
		expect(positions["normal"]).toBeDefined();
	});
});
