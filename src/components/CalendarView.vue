<script setup lang="ts">
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
import { computed, onMounted, ref, watch } from "vue";
import type { Task } from "../models/index.ts";
import { getTasks } from "../services/api.ts";
import { parseDueDateToLocal } from "../services/queryEngine.ts";
import { useListStore } from "../stores/lists.ts";
import { useTagStore } from "../stores/tags.ts";
import { useTaskStore } from "../stores/tasks.ts";
import { useUIStore } from "../stores/ui.ts";

const listStore = useListStore();
const tagStore = useTagStore();
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

const filterListId = ref<string>("");
const filterTag = ref<string>("");

const calendarTasks = ref<Task[]>([]);
const loading = ref(false);

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

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchCalendarTasks() {
	loading.value = true;
	try {
		const tasks = await getTasks(
			filterListId.value || null,
			true, // include completed
			null, // no smart view
			filterTag.value || null,
		);
		calendarTasks.value = tasks.filter((t) => t.due !== null && t.deleted_at === null);
	} catch (err) {
		console.error("Failed to fetch calendar tasks:", err);
		calendarTasks.value = [];
	} finally {
		loading.value = false;
	}
}

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

// ── Watchers ──────────────────────────────────────────────────────────────────

watch([filterListId, filterTag], fetchCalendarTasks);

onMounted(fetchCalendarTasks);
</script>

<template>
	<div class="flex flex-col h-full bg-white dark:bg-zinc-900 overflow-hidden">
		<!-- Toolbar -->
		<div
			class="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 shrink-0"
		>
			<!-- Month navigation -->
			<div class="flex items-center gap-1">
				<button
					type="button"
					@click="prevMonth"
					class="p-1.5 rounded-md text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
					title="Previous month"
				>
					<ChevronLeft class="w-4 h-4" />
				</button>
				<h2 class="text-base font-semibold text-zinc-900 dark:text-zinc-100 w-44 text-center">
					{{ monthLabel }}
				</h2>
				<button
					type="button"
					@click="nextMonth"
					class="p-1.5 rounded-md text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
					title="Next month"
				>
					<ChevronRight class="w-4 h-4" />
				</button>
				<button
					type="button"
					@click="goToToday"
					class="ml-1 px-2.5 py-1 text-xs font-medium rounded-md border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
				>
					Today
				</button>
			</div>

			<!-- Filters -->
			<div class="flex items-center gap-2">
				<!-- List filter -->
				<select
					v-model="filterListId"
					class="text-sm rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
				>
					<option value="">All Lists</option>
					<option v-for="list in listStore.sortedLists" :key="list.id" :value="list.id">
						{{ list.name }}
					</option>
				</select>

				<!-- Tag filter -->
				<select
					v-model="filterTag"
					class="text-sm rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
				>
					<option value="">All Tags</option>
					<option v-for="tag in tagStore.tagsWithCounts" :key="tag.name" :value="tag.name">
						{{ tag.name }}
					</option>
				</select>

				<!-- Loading indicator -->
				<div
					v-if="loading"
					class="w-4 h-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"
				/>
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
		<div class="flex-1 min-h-0 overflow-y-auto">
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
		</div>

		<!-- Empty state -->
		<div
			v-if="!loading && calendarTasks.length === 0"
			class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
		>
			<p class="text-sm text-zinc-400 dark:text-zinc-500">No tasks with due dates</p>
		</div>
	</div>
</template>
