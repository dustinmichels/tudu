<script setup lang="ts">
import {
	CalendarDays,
	Check,
	ChevronDown,
	ChevronRight,
	Circle,
	ListTree,
	Menu,
	PanelRight,
	PanelRightClose,
	Sparkles,
	StickyNote,
	Tag as TagIcon,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import type { Task } from "../models/index.ts";
import { useFilterStore } from "../stores/filters.ts";
import { useListStore } from "../stores/lists.ts";
import { useTaskStore } from "../stores/tasks.ts";
import { useUIStore } from "../stores/ui.ts";
import {
	DEFAULT_CARD_HEIGHT,
	DEFAULT_CARD_WIDTH,
	DEFAULT_SUBTASK_BUBBLE_GAP,
	DEFAULT_SUBTASK_CARD_HEIGHT,
	DEFAULT_SUBTASK_CARD_WIDTH,
	allocateFreeformPositions,
	calculateYarnCurve,
	computeAutoLayoutPositions,
	getFreeformCardDimensions,
	getFreeformDisplayedTasks,
	isFreeformSubtask,
	persistFreeformPosition,
	persistFreeformPositions,
	selectFreeformTasks,
	type Point,
} from "../utils/freeform.ts";

const CARD_WIDTH = DEFAULT_CARD_WIDTH;
const CARD_HEIGHT = DEFAULT_CARD_HEIGHT;
const SUBTASK_CARD_WIDTH = DEFAULT_SUBTASK_CARD_WIDTH;
const SUBTASK_CARD_HEIGHT = DEFAULT_SUBTASK_CARD_HEIGHT;
const CARD_GAP = 24;
const SUBTASK_BUBBLE_GAP = DEFAULT_SUBTASK_BUBBLE_GAP;
const BOARD_PADDING = 32;
const DEFAULT_COLUMNS = 4;

function getCardWidth(task: Task): number {
	return getFreeformCardDimensions(task, {
		cardWidth: CARD_WIDTH,
		subtaskCardWidth: SUBTASK_CARD_WIDTH,
	}).width;
}

function getCardMinHeight(task: Task): number {
	return getFreeformCardDimensions(task, {
		cardHeight: CARD_HEIGHT,
		subtaskCardHeight: SUBTASK_CARD_HEIGHT,
	}).height;
}

const filterStore = useFilterStore();
const listStore = useListStore();
const taskStore = useTaskStore();
const uiStore = useUIStore();

const hasActiveSelection = computed(
	() => !!listStore.activeList || !!listStore.activeView || !!filterStore.selectedTag,
);

const headerTitle = computed(() => {
	if (filterStore.selectedTag) return `#${filterStore.selectedTag}`;
	if (listStore.activeList) return listStore.activeList.name;
	const titles: Record<string, string> = {
		inbox: "Inbox",
		all: "All Tasks",
		today: "Today",
		tomorrow: "Tomorrow",
		this_week: "This Week",
		overdue: "Overdue",
		trash: "Trash",
	};
	return listStore.activeView ? (titles[listStore.activeView] ?? "Tasks") : "Freeform";
});

const candidateTasks = computed(() =>
	selectFreeformTasks(
		taskStore.tasks,
		taskStore.incompleteTasks,
		taskStore.filteredTasks,
		taskStore.includeCompleted,
		filterStore.searchQuery,
	),
);

const freeformLayout = computed(() =>
	getFreeformDisplayedTasks({
		candidateTasks: candidateTasks.value,
		allTasks: taskStore.allTasks,
		isTaskExpanded: (id) => uiStore.isTaskSubtasksExpanded(id),
		includeCompleted: taskStore.includeCompleted,
	}),
);

const displayedTasks = computed(() => freeformLayout.value.displayedTasks);
const rootTasks = computed(() => freeformLayout.value.rootTasks);
const taskSubtasksMap = computed(() => freeformLayout.value.taskSubtasksMap);
function getTaskSubtasks(parentId: string): Task[] {
	return taskSubtasksMap.value.get(parentId) ?? [];
}

function getSubtaskCounts(parentId: string): { total: number; incomplete: number } {
	const subtasks = getTaskSubtasks(parentId);
	const total = subtasks.length;
	const incomplete = subtasks.filter((t) => !t.completed).length;
	return { total, incomplete };
}

const transientPositions = ref<Record<string, { x: number; y: number }>>({});

function estimateCardHeight(task: Task): number {
	if (isFreeformSubtask(task)) {
		return SUBTASK_CARD_HEIGHT;
	}
	if (!uiStore.isTaskSubtasksExpanded(task.id)) {
		const subtasksCount = getTaskSubtasks(task.id).length;
		if (subtasksCount > 0) {
			const subtasksHeight = Math.min(112, subtasksCount * 24 + 10);
			return Math.max(CARD_HEIGHT, 110 + subtasksHeight);
		}
	}
	return CARD_HEIGHT;
}

function defaultPosition(index: number) {
	return {
		x: BOARD_PADDING + (index % DEFAULT_COLUMNS) * (CARD_WIDTH + CARD_GAP),
		y: BOARD_PADDING + Math.floor(index / DEFAULT_COLUMNS) * (CARD_HEIGHT + CARD_GAP + 12),
	};
}

const allocatedPositions = computed(() => {
	return allocateFreeformPositions({
		rootTasks: rootTasks.value,
		displayedTasks: displayedTasks.value,
		taskSubtasksMap: taskSubtasksMap.value,
		isTaskExpanded: (id) => uiStore.isTaskSubtasksExpanded(id),
		transientPositions: transientPositions.value,
		cardWidth: CARD_WIDTH,
		cardHeight: CARD_HEIGHT,
		subtaskCardWidth: SUBTASK_CARD_WIDTH,
		subtaskCardHeight: SUBTASK_CARD_HEIGHT,
		cardGap: CARD_GAP,
		subtaskBubbleGap: SUBTASK_BUBBLE_GAP,
		boardPadding: BOARD_PADDING,
		defaultColumns: DEFAULT_COLUMNS,
		estimateCardHeight,
	});
});

function taskPosition(task: Task, index?: number): { x: number; y: number } {
	return (
		transientPositions.value[task.id] ??
		allocatedPositions.value[task.id] ??
		defaultPosition(index ?? 0)
	);
}

interface YarnLine {
	id: string;
	parentId: string;
	subtaskId: string;
	startX: number;
	startY: number;
	endX: number;
	endY: number;
	path: string;
}

const yarnLines = computed<YarnLine[]>(() => {
	const lines: YarnLine[] = [];
	const displayedMap = new Map(
		displayedTasks.value.map((t, idx) => [t.id, { task: t, index: idx }]),
	);

	for (const task of displayedTasks.value) {
		if (!task.parent_id) continue;
		const parentEntry = displayedMap.get(task.parent_id);
		if (!parentEntry) continue;

		const parentPos = taskPosition(parentEntry.task, parentEntry.index);
		const taskPos = taskPosition(task);

		const parentWidth = getCardWidth(parentEntry.task);
		const subtaskWidth = getCardWidth(task);
		const PIN_OFFSET_Y = 10;

		const start = {
			x: parentPos.x + parentWidth / 2,
			y: parentPos.y + PIN_OFFSET_Y,
		};
		const end = {
			x: taskPos.x + subtaskWidth / 2,
			y: taskPos.y + PIN_OFFSET_Y,
		};

		const siblings = getTaskSubtasks(task.parent_id);
		const subIndex = Math.max(
			0,
			siblings.findIndex((s) => s.id === task.id),
		);

		lines.push({
			id: `${task.parent_id}->${task.id}`,
			parentId: task.parent_id,
			subtaskId: task.id,
			startX: start.x,
			startY: start.y,
			endX: end.x,
			endY: end.y,
			path: calculateYarnCurve(start, end, subIndex),
		});
	}

	return lines;
});

function isPinned(taskId: string): boolean {
	return yarnLines.value.some((l) => l.parentId === taskId || l.subtaskId === taskId);
}

const boardSize = computed(() => {
	let width = 1200;
	let height = 800;
	displayedTasks.value.forEach((task, index) => {
		const position = taskPosition(task, index);
		const heightEst = estimateCardHeight(task);
		width = Math.max(width, position.x + getCardWidth(task) + BOARD_PADDING * 2);
		height = Math.max(height, position.y + heightEst + BOARD_PADDING * 2);
	});
	return { width, height };
});

interface DragState {
	task: Task;
	pointerId: number;
	startClientX: number;
	startClientY: number;
	startX: number;
	startY: number;
	moved: boolean;
}

const drag = ref<DragState | null>(null);
let suppressedClickTaskId: string | null = null;

function startDrag(event: PointerEvent, task: Task, index: number) {
	if (event.button !== 0 || (event.target as HTMLElement).closest("button, a")) return;
	const position = taskPosition(task, index);
	drag.value = {
		task,
		pointerId: event.pointerId,
		startClientX: event.clientX,
		startClientY: event.clientY,
		startX: position.x,
		startY: position.y,
		moved: false,
	};
	(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function moveDrag(event: PointerEvent) {
	if (!drag.value || drag.value.pointerId !== event.pointerId) return;
	const dx = event.clientX - drag.value.startClientX;
	const dy = event.clientY - drag.value.startClientY;
	if (!drag.value.moved && Math.hypot(dx, dy) < 4) return;
	drag.value.moved = true;
	transientPositions.value = {
		...transientPositions.value,
		[drag.value.task.id]: {
			x: Math.max(BOARD_PADDING, drag.value.startX + dx),
			y: Math.max(BOARD_PADDING, drag.value.startY + dy),
		},
	};
}

function finishDrag(event: PointerEvent) {
	if (!drag.value || drag.value.pointerId !== event.pointerId) return;
	const finished = drag.value;
	drag.value = null;
	if (!finished.moved) return;

	suppressedClickTaskId = finished.task.id;
	window.setTimeout(() => {
		if (suppressedClickTaskId === finished.task.id) suppressedClickTaskId = null;
	}, 0);

	const position = transientPositions.value[finished.task.id];
	if (!position) return;

	// Persist root/parent tasks. Subtasks are re-positioned on the fly.
	if (!finished.task.parent_id) {
		void persistFreeformPosition(finished.task.id, position, (input, options) =>
			taskStore.updateTask(input, options),
		)
			.catch((error) => console.error("Failed to save freeform position:", error))
			.finally(() => {
				const { [finished.task.id]: _, ...remaining } = transientPositions.value;
				transientPositions.value = remaining;
			});
	}
}
function cancelDrag(event: PointerEvent) {
	if (!drag.value || drag.value.pointerId !== event.pointerId) return;
	const taskId = drag.value.task.id;
	drag.value = null;
	const { [taskId]: _, ...remaining } = transientPositions.value;
	transientPositions.value = remaining;
}

const isAutoLayoutAnimating = ref(false);

async function handleAutoLayout() {
	if (displayedTasks.value.length === 0) return;

	const newPositions = computeAutoLayoutPositions({
		rootTasks: rootTasks.value,
		taskSubtasksMap: taskSubtasksMap.value,
		isTaskExpanded: (id) => uiStore.isTaskSubtasksExpanded(id),
		estimateCardHeight,
		cardWidth: CARD_WIDTH,
		cardHeight: CARD_HEIGHT,
		subtaskCardWidth: SUBTASK_CARD_WIDTH,
		subtaskCardHeight: SUBTASK_CARD_HEIGHT,
		cardGap: CARD_GAP,
		subtaskBubbleGap: SUBTASK_BUBBLE_GAP,
		boardPadding: BOARD_PADDING,
		columns: DEFAULT_COLUMNS,
	});

	// Trigger smooth animation
	isAutoLayoutAnimating.value = true;
	transientPositions.value = { ...newPositions };

	// Persist only root/parent tasks! Subtasks are re-positioned on the fly
	const rootPositions: Record<string, Point> = {};
	for (const root of rootTasks.value) {
		const pos = newPositions[root.id];
		if (pos) {
			rootPositions[root.id] = pos;
		}
	}

	try {
		await persistFreeformPositions(rootPositions, (input, options) =>
			taskStore.updateTask(input, options),
		);
	} catch (error) {
		console.error("Failed to persist auto layout positions:", error);
	} finally {
		window.setTimeout(() => {
			isAutoLayoutAnimating.value = false;
			// Clear transient positions for root tasks whose positions are now saved in the store
			const remaining: Record<string, Point> = {};
			for (const [id, pos] of Object.entries(transientPositions.value)) {
				if (!rootPositions[id]) {
					remaining[id] = pos;
				}
			}
			transientPositions.value = remaining;
		}, 350);
	}
}

function openTask(task: Task) {
	if (suppressedClickTaskId === task.id) {
		suppressedClickTaskId = null;
		return;
	}
	taskStore.setActiveTask(task.id);
	uiStore.toggleDetail(true);
}

function toggleTask(event: MouseEvent, task: Task) {
	event.stopPropagation();
	void taskStore.toggleTask(task.id).catch((error) => {
		console.error("Failed to toggle task:", error);
	});
}

function formatDue(due: string | null): string {
	if (!due) return "";
	const [year, month, day] = due.slice(0, 10).split("-").map(Number);
	if (!year || !month || !day) return due;
	return new Date(year, month - 1, day).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}

function noteClass(task: Task): string {
	const isSub = isFreeformSubtask(task);

	if (task.completed) {
		if (isSub) {
			return "border-zinc-300/80 bg-zinc-100/80 text-zinc-400 dark:border-zinc-700/60 dark:bg-zinc-800/70 dark:text-zinc-500 shadow-xs";
		}
		return "border-zinc-300 bg-zinc-100/95 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/95";
	}

	if (isSub) {
		if (task.priority === 1)
			return "border-rose-300/90 bg-rose-50/80 text-zinc-800 dark:border-rose-700/80 dark:bg-rose-950/70 dark:text-zinc-100 ring-1 ring-rose-200/60 dark:ring-rose-900/40 shadow-xs";
		if (task.priority === 2)
			return "border-amber-300/90 bg-amber-50/80 text-zinc-800 dark:border-amber-700/80 dark:bg-amber-950/70 dark:text-zinc-100 ring-1 ring-amber-200/60 dark:ring-amber-900/40 shadow-xs";
		if (task.priority === 3)
			return "border-sky-300/90 bg-sky-50/80 text-zinc-800 dark:border-sky-700/80 dark:bg-sky-950/70 dark:text-zinc-100 ring-1 ring-sky-200/60 dark:ring-sky-900/40 shadow-xs";
		return "border-amber-300/80 bg-amber-50/75 text-zinc-800 dark:border-amber-700/70 dark:bg-amber-950/50 dark:text-zinc-100 ring-1 ring-amber-200/50 dark:ring-amber-900/30 shadow-xs";
	}

	if (task.priority === 1)
		return "border-rose-300 bg-rose-50/95 dark:border-rose-800 dark:bg-rose-950/90";
	if (task.priority === 2)
		return "border-amber-300 bg-amber-50/95 dark:border-amber-800 dark:bg-amber-950/90";
	if (task.priority === 3)
		return "border-sky-300 bg-sky-50/95 dark:border-sky-800 dark:bg-sky-950/90";
	return "border-yellow-300 bg-yellow-50/95 dark:border-yellow-800 dark:bg-yellow-950/90";
}
</script>

<template>
	<section
		class="flex h-full flex-col overflow-hidden bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
	>
		<header
			class="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-3 py-3 sm:px-4 dark:border-zinc-800"
		>
			<div class="flex min-w-0 items-center gap-2.5">
				<button
					type="button"
					class="-ml-1 shrink-0 cursor-pointer rounded-md p-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 md:hidden dark:text-zinc-300 dark:hover:bg-zinc-800"
					title="Toggle navigation sidebar"
					aria-label="Toggle navigation sidebar"
					@click="uiStore.toggleSidebar()"
				>
					<Menu class="h-5 w-5" />
				</button>
				<StickyNote class="h-5 w-5 shrink-0 text-yellow-500" />
				<div class="min-w-0">
					<h2 class="truncate text-lg font-bold sm:text-xl">{{ headerTitle }}</h2>
					<p class="text-xs text-zinc-500 dark:text-zinc-400">
						{{ displayedTasks.length }} note{{ displayedTasks.length === 1 ? "" : "s" }} · drag
						notes to arrange
					</p>
				</div>
			</div>

			<div class="flex shrink-0 items-center gap-2">
				<!-- Subtasks Display Toggle (mirroring list view) -->
				<button
					v-if="hasActiveSelection"
					type="button"
					@click="uiStore.toggleSubtasksInline()"
					:class="[
						'flex items-center gap-1.5 text-xs px-2 sm:px-2.5 py-1 rounded-md border transition-colors cursor-pointer',
						uiStore.showSubtasksInline
							? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-medium'
							: 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300',
					]"
					:title="
						uiStore.showSubtasksInline
							? 'Collapse subtasks into parent notes'
							: 'Explode subtasks into connected sticky notes'
					"
					data-toggle-subtasks-button
				>
					<ListTree class="h-3.5 w-3.5 shrink-0" />
					<span class="hidden sm:inline">{{
						uiStore.showSubtasksInline ? "Subtasks: Expanded" : "Subtasks: Collapsed"
					}}</span>
				</button>

				<!-- Auto Layout Button -->
				<button
					v-if="hasActiveSelection"
					type="button"
					:disabled="displayedTasks.length === 0"
					@click="handleAutoLayout"
					class="flex items-center gap-1.5 text-xs px-2 sm:px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					title="Auto layout tasks to minimize collisions and organize subtasks"
					data-auto-layout-button
				>
					<Sparkles class="h-3.5 w-3.5 shrink-0 text-amber-500" />
					<span class="hidden sm:inline">Auto Layout</span>
				</button>

				<button
					type="button"
					class="cursor-pointer rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
					:title="uiStore.isDetailOpen ? 'Hide task details' : 'Show task details'"
					:aria-label="uiStore.isDetailOpen ? 'Hide task details' : 'Show task details'"
					@click="uiStore.toggleDetail()"
				>
					<PanelRightClose v-if="uiStore.isDetailOpen" class="h-4 w-4" />
					<PanelRight v-else class="h-4 w-4" />
				</button>
			</div>
		</header>

		<div v-if="!hasActiveSelection" class="flex flex-1 items-center justify-center p-8 text-center">
			<div class="max-w-xs text-zinc-400 dark:text-zinc-500">
				<StickyNote class="mx-auto mb-3 h-12 w-12 stroke-1 text-yellow-500/50" />
				<p class="text-sm font-medium text-zinc-600 dark:text-zinc-300">Choose a list or view</p>
				<p class="mt-1 text-xs">Its tasks will appear here as movable notes.</p>
			</div>
		</div>

		<div
			v-else-if="taskStore.loading && taskStore.tasks.length === 0"
			class="flex flex-1 items-center justify-center text-sm text-zinc-400"
		>
			Loading tasks...
		</div>

		<div
			v-else-if="displayedTasks.length === 0"
			class="flex flex-1 items-center justify-center p-8 text-center"
		>
			<div class="text-zinc-400 dark:text-zinc-500">
				<Check class="mx-auto mb-3 h-12 w-12 stroke-1 text-emerald-500/50" />
				<p class="text-sm font-medium">No tasks to arrange</p>
			</div>
		</div>

		<div v-else class="freeform-scroll flex-1 overflow-auto">
			<div
				class="freeform-board relative"
				:style="{ width: `${boardSize.width}px`, height: `${boardSize.height}px` }"
			>
				<!-- Yarn / string lines connecting parent tasks to exploded subtasks -->
				<svg
					class="pointer-events-none absolute inset-0 z-0 overflow-visible"
					:width="boardSize.width"
					:height="boardSize.height"
				>
					<defs>
						<filter id="yarn-shadow" x="-20%" y="-20%" width="140%" height="140%">
							<feDropShadow
								dx="0"
								dy="2.5"
								stdDeviation="2"
								flood-color="#000000"
								flood-opacity="0.22"
							/>
						</filter>
					</defs>
					<g v-for="yarn in yarnLines" :key="yarn.id" filter="url(#yarn-shadow)">
						<!-- Main yarn string -->
						<path
							:d="yarn.path"
							fill="none"
							class="stroke-rose-600 dark:stroke-rose-400"
							stroke-width="2.5"
							stroke-linecap="round"
						/>
						<!-- Yarn ply twist highlight (dashed strand) -->
						<path
							:d="yarn.path"
							fill="none"
							class="stroke-rose-200 dark:stroke-rose-100"
							stroke-width="1.2"
							stroke-linecap="round"
							stroke-dasharray="5 3"
							opacity="0.85"
						/>
						<!-- Pushpin heads / knots at both endpoints -->
						<circle
							:cx="yarn.startX"
							:cy="yarn.startY"
							r="4"
							class="fill-rose-700 dark:fill-rose-400 stroke-rose-900 dark:stroke-rose-200"
							stroke-width="1"
						/>
						<circle
							:cx="yarn.startX - 1"
							:cy="yarn.startY - 1"
							r="1.2"
							fill="#ffffff"
							opacity="0.8"
						/>
						<circle
							:cx="yarn.endX"
							:cy="yarn.endY"
							r="4"
							class="fill-rose-700 dark:fill-rose-400 stroke-rose-900 dark:stroke-rose-200"
							stroke-width="1"
						/>
						<circle :cx="yarn.endX - 1" :cy="yarn.endY - 1" r="1.2" fill="#ffffff" opacity="0.8" />
					</g>
				</svg>

				<!-- Sticky notes -->
				<article
					v-for="(task, index) in displayedTasks"
					:key="task.id"
					:data-task-id="task.id"
					:data-is-subtask="isFreeformSubtask(task) ? 'true' : 'false'"
					class="absolute flex touch-none select-none flex-col border shadow-sm transition-[box-shadow] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
					:class="[
						isFreeformSubtask(task)
							? 'subtask-note border-dotted rounded-2xl p-2.5 text-xs shadow-xs'
							: 'parent-note rounded-md px-3 py-2.5 text-sm',
						noteClass(task),
						{
							'cursor-grabbing shadow-lg': drag?.task.id === task.id,
							'cursor-grab': drag?.task.id !== task.id,
							'transition-[transform,box-shadow] duration-300 ease-out': drag?.task.id !== task.id,
						},
					]"
					:style="{
						width: `${getCardWidth(task)}px`,
						minHeight: `${getCardMinHeight(task)}px`,
						transform: `translate3d(${taskPosition(task, index).x}px, ${taskPosition(task, index).y}px, 0)`,
						zIndex: drag?.task.id === task.id ? 20 : 2,
					}"
					tabindex="0"
					role="button"
					@click="openTask(task)"
					@keydown.enter="openTask(task)"
					@pointerdown="startDrag($event, task, index)"
					@pointermove="moveDrag"
					@pointerup="finishDrag"
					@pointercancel="cancelDrag"
				>
					<!-- Pinned tack at top-center when yarn connects to this note -->
					<div
						v-if="isPinned(task.id)"
						class="pointer-events-none absolute -top-1.5 left-1/2 z-10 flex -translate-x-1/2 items-center justify-center"
					>
						<div
							class="rounded-full bg-rose-500 border border-rose-700 dark:border-rose-300 shadow-xs flex items-center justify-center"
							:class="isFreeformSubtask(task) ? 'h-3 w-3' : 'h-3.5 w-3.5'"
							title="Pinned with yarn"
						>
							<div class="h-1 w-1 rounded-full bg-white/80 -translate-x-px -translate-y-px"></div>
						</div>
					</div>

					<!-- Main task content -->
					<div class="flex items-start" :class="isFreeformSubtask(task) ? 'gap-1.5' : 'gap-2'">
						<button
							type="button"
							class="mt-0.5 shrink-0 cursor-pointer rounded-full text-zinc-400 transition-colors hover:text-emerald-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
							:title="task.completed ? 'Mark incomplete' : 'Mark complete'"
							:aria-label="task.completed ? 'Mark incomplete' : 'Mark complete'"
							@click="toggleTask($event, task)"
						>
							<Check
								v-if="task.completed"
								:class="isFreeformSubtask(task) ? 'h-3.5 w-3.5' : 'h-4 w-4'"
								class="text-emerald-600"
							/>
							<Circle v-else :class="isFreeformSubtask(task) ? 'h-3.5 w-3.5' : 'h-4 w-4'" />
						</button>
						<div class="min-w-0 flex-1">
							<div
								v-if="task.parent_id"
								class="mb-1 inline-flex items-center gap-1 rounded-full bg-rose-100/90 px-1.5 py-0.5 text-[9px] font-semibold text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/60"
							>
								<ListTree class="h-2.5 w-2.5 shrink-0" />
								<span>Subtask</span>
							</div>
							<p
								:class="[
									isFreeformSubtask(task)
										? 'line-clamp-2 font-medium leading-4 text-xs'
										: 'line-clamp-3 font-medium leading-5 text-sm',
									{ 'line-through': task.completed },
								]"
							>
								{{ task.title }}
							</p>
						</div>
					</div>

					<!-- Subtasks displayed as checkboxes inside parent sticky note when collapsed -->
					<div
						v-if="!uiStore.isTaskSubtasksExpanded(task.id) && getTaskSubtasks(task.id).length > 0"
						class="mt-2.5 pt-2 border-t border-zinc-200/80 dark:border-zinc-700/60 space-y-1 max-h-28 overflow-y-auto pr-0.5"
						@pointerdown.stop
					>
						<div
							v-for="subtask in getTaskSubtasks(task.id)"
							:key="subtask.id"
							class="group/sub flex items-center gap-1.5 py-0.5 text-xs select-none"
						>
							<button
								type="button"
								class="shrink-0 cursor-pointer text-zinc-400 hover:text-emerald-600 transition-colors focus-visible:outline-2 focus-visible:outline-emerald-500"
								:title="subtask.completed ? 'Mark subtask incomplete' : 'Mark subtask complete'"
								:aria-label="
									subtask.completed ? 'Mark subtask incomplete' : 'Mark subtask complete'
								"
								@click.stop="toggleTask($event, subtask)"
							>
								<Check v-if="subtask.completed" class="h-3.5 w-3.5 text-emerald-600" />
								<Circle v-else class="h-3.5 w-3.5 text-zinc-400" />
							</button>
							<span
								class="flex-1 truncate cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100"
								:class="{ 'line-through text-zinc-400 dark:text-zinc-500': subtask.completed }"
								:title="subtask.title"
								@click.stop="openTask(subtask)"
							>
								{{ subtask.title }}
							</span>
						</div>
					</div>

					<!-- Subtasks exploded indicator when expanded -->
					<div
						v-else-if="
							uiStore.isTaskSubtasksExpanded(task.id) && getTaskSubtasks(task.id).length > 0
						"
						class="mt-2 pt-1.5 border-t border-dashed border-rose-300 dark:border-rose-800/70 text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1.5"
					>
						<span class="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse shrink-0"></span>
						<span class="truncate">
							{{ getTaskSubtasks(task.id).length }} subtask{{
								getTaskSubtasks(task.id).length === 1 ? "" : "s"
							}}
							exploded on board
						</span>
					</div>

					<!-- Metadata & Actions Footer -->
					<div
						class="mt-auto flex flex-wrap items-end justify-between"
						:class="[
							isFreeformSubtask(task)
								? 'min-h-4 gap-1 pt-1.5 text-[10px] text-zinc-500 dark:text-zinc-400'
								: 'min-h-5 gap-1.5 pt-3 text-[11px] text-zinc-500 dark:text-zinc-400',
						]"
					>
						<div
							class="flex flex-wrap items-center"
							:class="isFreeformSubtask(task) ? 'gap-1' : 'gap-1.5'"
						>
							<span v-if="task.due" class="flex items-center gap-1">
								<CalendarDays :class="isFreeformSubtask(task) ? 'h-2.5 w-2.5' : 'h-3 w-3'" />{{
									formatDue(task.due)
								}}
							</span>
							<span
								v-for="tag in task.tags?.slice(0, 2)"
								:key="tag.id"
								class="flex items-center gap-0.5 truncate"
							>
								<TagIcon :class="isFreeformSubtask(task) ? 'h-2.5 w-2.5' : 'h-3 w-3'" />{{
									tag.name
								}}
							</span>
						</div>
						<!-- Expand / Collapse subtasks toggle button on parent note -->
						<button
							v-if="getTaskSubtasks(task.id).length > 0"
							type="button"
							class="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border transition-colors cursor-pointer shrink-0"
							:class="[
								uiStore.isTaskSubtasksExpanded(task.id)
									? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
									: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700/60 hover:bg-zinc-200 dark:hover:bg-zinc-700',
							]"
							:title="
								uiStore.isTaskSubtasksExpanded(task.id)
									? 'Collapse subtasks into parent note'
									: `Explode ${getSubtaskCounts(task.id).incomplete} of ${getSubtaskCounts(task.id).total} subtasks onto board`
							"
							:data-subtask-toggle-id="task.id"
							@click.stop="uiStore.toggleTaskSubtasks(task.id)"
						>
							<ChevronDown
								v-if="uiStore.isTaskSubtasksExpanded(task.id)"
								class="h-3 w-3 text-indigo-500 shrink-0"
							/>
							<ChevronRight v-else class="h-3 w-3 text-zinc-400 shrink-0" />
							<ListTree class="h-3 w-3 text-zinc-400 shrink-0" />
							<span
								>{{ getSubtaskCounts(task.id).total - getSubtaskCounts(task.id).incomplete }}/{{
									getSubtaskCounts(task.id).total
								}}</span
							>
						</button>
					</div>
				</article>
			</div>
		</div>
	</section>
</template>

<style scoped>
.freeform-scroll {
	background: #fafafa;
}

.freeform-board {
	background-image: radial-gradient(circle, rgb(161 161 170 / 0.32) 1px, transparent 1px);
	background-size: 24px 24px;
}

:global(.dark) .freeform-scroll {
	background: #18181b;
}

:global(.dark) .freeform-board {
	background-image: radial-gradient(circle, rgb(113 113 122 / 0.35) 1px, transparent 1px);
}
</style>
