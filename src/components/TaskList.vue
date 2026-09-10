<script setup lang="ts">
import {
	Calendar,
	CheckCircle2,
	CheckSquare,
	Circle,
	CornerDownLeft,
	ListFilter,
	Trash2,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import { PRIORITY } from "../models/index.ts";
import { useListStore } from "../stores/lists.ts";
import { useTaskStore } from "../stores/tasks.ts";

const listStore = useListStore();
const taskStore = useTaskStore();

const newTaskTitle = ref("");
const isAdding = ref(false);

const activeList = computed(() => listStore.activeList);

const visibleTasks = computed(() => {
	if (taskStore.includeCompleted) {
		return taskStore.tasks;
	}
	return taskStore.incompleteTasks;
});

async function handleAddTask() {
	const title = newTaskTitle.value.trim();
	if (!title || !activeList.value) return;

	try {
		isAdding.value = true;
		const created = await taskStore.addTask({
			title,
			list_id: activeList.value.id,
		});
		newTaskTitle.value = "";
		taskStore.setActiveTask(created.id);
	} catch (err) {
		console.error("Failed to add task:", err);
	} finally {
		isAdding.value = false;
	}
}

async function handleToggleComplete(event: MouseEvent, taskId: string) {
	event.stopPropagation();
	try {
		await taskStore.toggleTask(taskId);
	} catch (err) {
		console.error("Failed to toggle task:", err);
	}
}

async function handleDeleteTask(event: MouseEvent, taskId: string) {
	event.stopPropagation();
	try {
		await taskStore.deleteTask(taskId);
	} catch (err) {
		console.error("Failed to delete task:", err);
	}
}

function handleSelectTask(taskId: string) {
	taskStore.setActiveTask(taskId);
}

function formatDue(dateStr: string | null): string {
	if (!dateStr) return "";
	try {
		const date = new Date(dateStr);
		return date.toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
		});
	} catch {
		return dateStr;
	}
}
</script>

<template>
  <section class="flex flex-col h-full bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 select-none overflow-hidden">
    <!-- List Header -->
    <div class="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
      <div class="min-w-0">
        <h2 class="text-xl font-bold truncate flex items-center gap-2">
          <span
            v-if="activeList"
            class="w-3 h-3 rounded-full shrink-0 inline-block"
            :style="{ backgroundColor: activeList.color || '#10b981' }"
          />
          <span>{{ activeList ? activeList.name : 'No List Selected' }}</span>
        </h2>
        <p v-if="activeList" class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          {{ taskStore.incompleteTasks.length }} pending, {{ taskStore.completedTasks.length }} completed
        </p>
      </div>

      <!-- Completed tasks toggle filter -->
      <div v-if="activeList" class="flex items-center gap-2">
        <button
          type="button"
          @click="taskStore.setIncludeCompleted(!taskStore.includeCompleted)"
          class="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-600 dark:text-zinc-300 cursor-pointer"
          :title="taskStore.includeCompleted ? 'Hide completed tasks' : 'Show completed tasks'"
        >
          <ListFilter class="w-3.5 h-3.5" />
          <span>{{ taskStore.includeCompleted ? 'Showing all' : 'Active only' }}</span>
        </button>
      </div>
    </div>

    <!-- Quick Add Input -->
    <div v-if="activeList" class="p-3 border-b border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/50">
      <form @submit.prevent="handleAddTask" class="relative flex items-center">
        <input
          v-model="newTaskTitle"
          type="text"
          :placeholder="`Add a task to ${activeList.name}...`"
          :disabled="isAdding"
          class="w-full pl-3 pr-10 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 shadow-2xs"
        />
        <button
          type="submit"
          :disabled="isAdding || !newTaskTitle.trim()"
          class="absolute right-2 p-1 text-zinc-400 hover:text-emerald-600 disabled:opacity-30 disabled:hover:text-zinc-400 transition-colors cursor-pointer"
          title="Add task"
        >
          <CornerDownLeft class="w-4 h-4" />
        </button>
      </form>
    </div>

    <!-- Tasks List Container -->
    <div class="flex-1 overflow-y-auto p-3 space-y-1">
      <!-- Empty state: No active list -->
      <div v-if="!activeList" class="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-400 dark:text-zinc-500">
        <CheckSquare class="w-12 h-12 mb-3 opacity-40 stroke-1" />
        <p class="text-sm font-medium">Select a list from the sidebar</p>
        <p class="text-xs mt-1">Or create a new list to get started.</p>
      </div>

      <!-- Loading state -->
      <div v-else-if="taskStore.loading && taskStore.tasks.length === 0" class="py-8 text-center text-sm text-zinc-400">
        Loading tasks...
      </div>

      <!-- Empty state: Active list has no tasks -->
      <div v-else-if="visibleTasks.length === 0" class="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-400 dark:text-zinc-500">
        <CheckCircle2 class="w-12 h-12 mb-3 text-emerald-500/40 stroke-1" />
        <p class="text-sm font-medium">All clear!</p>
        <p class="text-xs mt-1">No tasks to display. Add one using the input above.</p>
      </div>

      <!-- Tasks list -->
      <div
        v-for="task in visibleTasks"
        :key="task.id"
        @click="handleSelectTask(task.id)"
        class="group flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border text-sm cursor-pointer transition-all"
        :class="[
          task.id === taskStore.activeTaskId
            ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800/80 shadow-2xs'
            : 'border-zinc-100 dark:border-zinc-800/80 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:border-zinc-200 dark:hover:border-zinc-700'
        ]"
      >
        <!-- Task Checkbox & Title -->
        <div class="flex items-center gap-3 min-w-0 flex-1">
          <button
            type="button"
            @click="handleToggleComplete($event, task.id)"
            class="shrink-0 text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer"
            :title="task.completed ? 'Mark incomplete' : 'Mark complete'"
          >
            <CheckCircle2 v-if="task.completed" class="w-5 h-5 text-emerald-600 dark:text-emerald-500" />
            <Circle v-else class="w-5 h-5 text-zinc-300 dark:text-zinc-600 hover:text-emerald-500" />
          </button>

          <span
            class="truncate text-sm font-medium"
            :class="[
              task.completed
                ? 'line-through text-zinc-400 dark:text-zinc-500 font-normal'
                : 'text-zinc-800 dark:text-zinc-200'
            ]"
          >
            {{ task.title }}
          </span>
        </div>

        <!-- Task Metadata Badges & Actions -->
        <div class="flex items-center gap-2 shrink-0">
          <!-- Priority indicator -->
          <span
            v-if="task.priority === PRIORITY.HIGH"
            class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400"
          >
            P1
          </span>
          <span
            v-else-if="task.priority === PRIORITY.MEDIUM"
            class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400"
          >
            P2
          </span>
          <span
            v-else-if="task.priority === PRIORITY.LOW"
            class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400"
          >
            P3
          </span>

          <!-- Due date badge -->
          <span
            v-if="task.due"
            class="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded"
          >
            <Calendar class="w-3 h-3" />
            <span>{{ formatDue(task.due) }}</span>
          </span>

          <!-- Delete action -->
          <button
            type="button"
            title="Delete task"
            class="opacity-0 group-hover:opacity-100 hover:text-red-500 p-1 text-zinc-400 transition-opacity"
            @click="handleDeleteTask($event, task.id)"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
