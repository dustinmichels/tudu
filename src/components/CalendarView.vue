<script setup lang="ts">
import {
	AlertCircle,
	Calendar,
	CalendarDays,
	CalendarRange,
	CheckSquare,
	ChevronLeft,
	ChevronRight,
	Inbox,
	ListFilter,
	Menu,
	PanelRight,
	PanelRightClose,
	Sunrise,
	Tag as TagIcon,
	Trash2,
} from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";
import type { Task } from "../models/index.ts";
import { parseDueDateToLocal } from "../services/queryEngine.ts";
import { useFilterStore } from "../stores/filters.ts";
import { useListStore } from "../stores/lists.ts";
import { useTaskStore } from "../stores/tasks.ts";
import { useUIStore } from "../stores/ui.ts";
import { getListIcon } from "../utils/icons.ts";

const filterStore = useFilterStore();
const listStore = useListStore();
const taskStore = useTaskStore();
const uiStore = useUIStore();

// ── State ────────────────────────────────────────────────────────────────────

function todayMidnight(): Date {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	return d;
}

const today = todayMidnight();

const currentYear = ref(today.getFullYear());
const currentMonth = ref(today.getMonth()); // 0-indexed
const loading = ref(false);

// ── Active list / selection info ─────────────────────────────────────────────

const activeList = computed(() => listStore.activeList);
const hasActiveSelection = computed(
	() => !!listStore.activeList || !!listStore.activeView || !!filterStore.selectedTag,
);

const viewTitle = computed(() => {
	if (filterStore.selectedTag) return `#${filterStore.selectedTag}`;
	if (listStore.activeView === "inbox") return "Inbox";
	if (listStore.activeView === "all") return "All Tasks";
	if (listStore.activeView === "today") return "Today";
	if (listStore.activeView === "tomorrow") return "Tomorrow";
	if (listStore.activeView === "this_week") return "This Week";
	if (listStore.activeView === "overdue") return "Overdue";
	if (listStore.activeView === "trash") return "Trash";
	return null;
});

const headerTitle = computed(() => {
	if (viewTitle.value) return viewTitle.value;
	return activeList.value ? activeList.value.name : "All Tasks";
});

// ── Month navigation ──────────────────────────────────────────────────────────

const MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const monthLabel = computed(() => `${MONTH_NAMES[currentMonth.value]} ${currentYear.value}`);

function prevMonth() {
	if (currentMonth.value === 0) {
		currentMonth.value = 11;
		currentYear.value--;
	} else {
		currentMonth.value--;
	}
}

function nextMonth() {
	if (currentMonth.value === 11) {
		currentMonth.value = 0;
		currentYear.value++;
	} else {
		currentMonth.value++;
	}
}

function goToToday() {
	const t = todayMidnight();
	currentYear.value = t.getFullYear();
	currentMonth.value = t.getMonth();
}

// ── Filtered Calendar Tasks ──────────────────────────────────────────────────

const calendarTasks = computed<Task[]>(() => {
	const source = hasActiveSelection.value ? taskStore.tasks : taskStore.allTasks;
	const isTrash = listStore.activeView === "trash";

	return source.filter((t) => {
		if (t.due === null) return false;
		if (isTrash) return t.deleted_at !== null;
		if (t.deleted_at !== null) return false;
		if (!taskStore.includeCompleted && t.completed) return false;
		return true;
	});
});

// ── Calendar grid ─────────────────────────────────────────────────────────────

interface CalendarCell {
	date: Date;
	inMonth: boolean;
	isToday: boolean;
	tasks: Task[];
}

const calendarCells = computed<CalendarCell[]>(() => {
	const year = currentYear.value;
	const month = currentMonth.value;

	const firstDay = new Date(year, month, 1);
	const startDow = firstDay.getDay(); // 0 = Sunday

	// Anchor: the Sunday on or before the 1st
	const gridStart = new Date(year, month, 1 - startDow);

	const cells: CalendarCell[] = [];

	for (let i = 0; i < 42; i++) {
		const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);

		const inMonth = date.getMonth() === month && date.getFullYear() === year;
		const isToday = date.getTime() === today.getTime();

		const dayTasks = calendarTasks.value.filter((t) => {
			const d = parseDueDateToLocal(t.due);
			if (!d) return false;
			d.setHours(0, 0, 0, 0);
			return d.getTime() === date.getTime();
		});

		// High priority first, then by title
		dayTasks.sort((a, b) => {
			const ap = a.priority ?? 4;
			const bp = b.priority ?? 4;
			if (ap !== bp) return ap - bp;
			return a.title.localeCompare(b.title);
		});

		cells.push({ date, inMonth, isToday, tasks: dayTasks });
	}

	// Drop the last row if entirely out-of-month
	const last7 = cells.slice(35);
	if (last7.every((c) => !c.inMonth)) {
		return cells.slice(0, 35);
	}
	return cells;
});

// ── Task interaction ──────────────────────────────────────────────────────────

function openTask(task: Task) {
	taskStore.setActiveTask(task.id);
	uiStore.toggleDetail(true);
}

// ── Chip styling ──────────────────────────────────────────────────────────────

function chipClass(task: Task): string {
	const base =
		"w-full text-left text-xs px-1.5 py-0.5 rounded truncate cursor-pointer transition-opacity hover:opacity-80";
	const color = task.completed
		? "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500 line-through"
		: priorityColor(task.priority);
	return `${base} ${color}`;
}

function priorityColor(priority: number | null): string {
	switch (priority) {
		case 1:
			return "bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300";
		case 2:
			return "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300";
		case 3:
			return "bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300";
		default:
			return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
	}
}

onMounted(async () => {
	if (hasActiveSelection.value && taskStore.tasks.length === 0) {
		loading.value = true;
		try {
			await taskStore.fetchTasks();
		} catch (err) {
			console.error("Failed to fetch tasks in calendar view:", err);
		} finally {
			loading.value = false;
		}
	}
});
</script>

<template>
	<div class="flex flex-col h-full bg-white dark:bg-zinc-900 overflow-hidden">
		<!-- Header -->
		<div
			class="p-3 sm:p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0"
		>
			<!-- Left: Mobile Hamburger & Active List Info -->
			<div class="flex items-center gap-2.5 min-w-0">
				<button
					type="button"
					@click="uiStore.toggleSidebar()"
					class="md:hidden p-1.5 -ml-1 rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
					title="Toggle Navigation Sidebar"
				>
					<Menu class="w-5 h-5" />
				</button>

				<div class="min-w-0">
					<h2 class="text-lg sm:text-xl font-bold truncate flex items-center gap-2">
						<TagIcon v-if="filterStore.selectedTag" class="w-5 h-5 text-emerald-500 shrink-0" />
						<Inbox
							v-else-if="
								(activeList && activeList.name.toLowerCase() === 'inbox') ||
								listStore.activeView === 'inbox'
							"
							class="w-5 h-5 text-blue-500 shrink-0"
						/>
						<CheckSquare
							v-else-if="listStore.activeView === 'all'"
							class="w-5 h-5 text-indigo-500 shrink-0"
						/>
						<Calendar
							v-else-if="listStore.activeView === 'today'"
							class="w-5 h-5 text-emerald-500 shrink-0"
						/>
						<Sunrise
							v-else-if="listStore.activeView === 'tomorrow'"
							class="w-5 h-5 text-amber-500 shrink-0"
						/>
						<CalendarRange
							v-else-if="listStore.activeView === 'this_week'"
							class="w-5 h-5 text-purple-500 shrink-0"
						/>
						<AlertCircle
							v-else-if="listStore.activeView === 'overdue'"
							class="w-5 h-5 text-red-500 shrink-0"
						/>
						<Trash2
							v-else-if="listStore.activeView === 'trash'"
							class="w-5 h-5 text-rose-500 shrink-0"
						/>
						<component
							:is="getListIcon(activeList?.icon)"
							v-else-if="activeList"
							class="w-5 h-5 shrink-0"
							:class="activeList.color ? '' : 'text-emerald-500'"
							:style="activeList.color ? { color: activeList.color } : {}"
						/>
						<CalendarDays v-else class="w-5 h-5 text-teal-500 shrink-0" />

						<span>{{ headerTitle }}</span>
						<span
							class="text-xs font-normal text-zinc-400 dark:text-zinc-500 self-center hidden sm:inline"
							>(Calendar)</span
						>
					</h2>
					<p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
						{{ calendarTasks.length }} scheduled task{{ calendarTasks.length === 1 ? "" : "s" }}
					</p>
				</div>
			</div>

			<!-- Right: Month navigation, View mode toggle, Completed filter & Detail pane -->
			<div class="flex items-center gap-2 sm:gap-2.5 shrink-0">
				<!-- Month navigation -->
				<div class="flex items-center gap-0.5 sm:gap-1">
					<button
						type="button"
						@click="prevMonth"
						class="p-1 sm:p-1.5 rounded-md text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
						title="Previous month"
					>
						<ChevronLeft class="w-4 h-4" />
					</button>
					<h3
						class="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100 w-28 sm:w-36 text-center select-none truncate"
					>
						{{ monthLabel }}
					</h3>
					<button
						type="button"
						@click="nextMonth"
						class="p-1 sm:p-1.5 rounded-md text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
						title="Next month"
					>
						<ChevronRight class="w-4 h-4" />
					</button>
					<button
						type="button"
						@click="goToToday"
						class="ml-0.5 px-2 py-0.5 text-xs font-medium rounded-md border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
					>
						Today
					</button>
				</div>

				<!-- Completed tasks filter toggle -->
				<button
					type="button"
					@click="
						() => {
							const next = !taskStore.includeCompleted;
							taskStore.setIncludeCompleted(next);
							filterStore.setIncludeCompleted(next);
						}
					"
					class="hidden sm:flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-600 dark:text-zinc-300 cursor-pointer"
					:title="
						taskStore.includeCompleted ? 'Hide completed tasks (⌘H)' : 'Show completed tasks (⌘H)'
					"
				>
					<ListFilter class="w-3.5 h-3.5" />
					<span class="hidden md:inline">{{
						taskStore.includeCompleted ? "Showing all" : "Active only"
					}}</span>
				</button>

				<!-- Toggle Right Detail Pane -->
				<button
					type="button"
					@click="uiStore.toggleDetail()"
					:title="uiStore.isDetailOpen ? 'Collapse task details' : 'Expand task details'"
					class="p-1 sm:p-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer"
				>
					<PanelRightClose v-if="uiStore.isDetailOpen" class="w-4 h-4" />
					<PanelRight v-else class="w-4 h-4" />
				</button>
			</div>
		</div>

		<!-- Day-of-week header row -->
		<div class="grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
			<div
				v-for="day in DAY_NAMES"
				:key="day"
				class="py-2 text-center text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide"
				:class="{ 'text-zinc-600 dark:text-zinc-300': day === 'Sun' || day === 'Sat' }"
			>
				{{ day }}
			</div>
		</div>

		<!-- Calendar grid -->
		<div class="flex-1 min-h-0 overflow-y-auto relative">
			<div
				class="grid grid-cols-7 h-full"
				:style="{
					gridTemplateRows: `repeat(${calendarCells.length / 7}, minmax(5rem, 1fr))`,
				}"
			>
				<div
					v-for="(cell, idx) in calendarCells"
					:key="idx"
					class="border-r border-b border-zinc-200 dark:border-zinc-800 p-1.5 min-h-20 overflow-hidden flex flex-col gap-0.5"
					:class="[
						!cell.inMonth && 'bg-zinc-50 dark:bg-zinc-950/60',
						cell.isToday && 'bg-emerald-50/60 dark:bg-emerald-950/20',
					]"
				>
					<!-- Date number -->
					<span
						class="text-xs font-medium self-end mb-0.5 w-6 h-6 flex items-center justify-center rounded-full shrink-0"
						:class="[
							cell.isToday
								? 'bg-emerald-500 text-white font-bold'
								: cell.inMonth
									? 'text-zinc-800 dark:text-zinc-200'
									: 'text-zinc-400 dark:text-zinc-600',
						]"
					>
						{{ cell.date.getDate() }}
					</span>

					<!-- Task chips (max 3 visible) -->
					<button
						v-for="task in cell.tasks.slice(0, 3)"
						:key="task.id"
						:data-task-id="task.id"
						type="button"
						:class="chipClass(task)"
						:title="task.title"
						@click="openTask(task)"
					>
						{{ task.title }}
					</button>

					<!-- Overflow indicator -->
					<span
						v-if="cell.tasks.length > 3"
						class="text-xs text-zinc-400 dark:text-zinc-500 pl-1 cursor-default"
					>
						+{{ cell.tasks.length - 3 }} more
					</span>
				</div>
			</div>

			<!-- Empty state -->
			<div
				v-if="!loading && calendarTasks.length === 0"
				class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
			>
				<p class="text-sm text-zinc-400 dark:text-zinc-500">
					No tasks with due dates in {{ headerTitle }}
				</p>
			</div>
		</div>
	</div>
</template>
