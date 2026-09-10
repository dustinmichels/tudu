<script setup lang="ts">
import {
	Calendar,
	CheckCircle2,
	Clock,
	FileText,
	Flag,
	Folder,
	Trash2,
	X,
} from "lucide-vue-next";
import { computed } from "vue";
import { PRIORITY } from "../models/index.ts";
import { useListStore } from "../stores/lists.ts";
import { useTaskStore } from "../stores/tasks.ts";

const listStore = useListStore();
const taskStore = useTaskStore();

const task = computed(() => taskStore.activeTask);

const taskList = computed(() => {
	if (!task.value) return null;
	return listStore.lists.find((l) => l.id === task.value?.list_id) ?? null;
});

function handleClose() {
	taskStore.setActiveTask(null);
}

async function handleToggleComplete() {
	if (!task.value) return;
	try {
		await taskStore.toggleTask(task.value.id);
	} catch (err) {
		console.error("Failed to toggle task:", err);
	}
}

async function handleDelete() {
	if (!task.value) return;
	const confirmDelete = window.confirm(
		"Are you sure you want to delete this task?",
	);
	if (!confirmDelete) return;

	try {
		const id = task.value.id;
		taskStore.setActiveTask(null);
		await taskStore.deleteTask(id);
	} catch (err) {
		console.error("Failed to delete task:", err);
	}
}

function formatDate(dateStr: string | null | undefined): string {
	if (!dateStr) return "None";
	try {
		const d = new Date(dateStr);
		return d.toLocaleString(undefined, {
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
	} catch {
		return dateStr;
	}
}
</script>

<template>
  <aside class="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 select-none overflow-hidden">
    <!-- Empty State -->
    <div
      v-if="!task"
      class="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-400 dark:text-zinc-500"
    >
      <FileText class="w-12 h-12 mb-3 opacity-30 stroke-1" />
      <p class="text-sm font-medium">No task selected</p>
      <p class="text-xs mt-1 text-zinc-400">Select a task from the list to view its details.</p>
    </div>

    <!-- Task Detail View -->
    <div v-else class="flex flex-col h-full">
      <!-- Header -->
      <div class="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <span
          class="text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5"
          :class="[
            task.completed
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
          ]"
        >
          <CheckCircle2 v-if="task.completed" class="w-3.5 h-3.5" />
          <span>{{ task.completed ? 'Completed' : 'In Progress' }}</span>
        </span>

        <button
          type="button"
          @click="handleClose"
          class="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Close details"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Content Body -->
      <div class="flex-1 overflow-y-auto p-4 space-y-5">
        <!-- Title & Checkbox -->
        <div class="flex items-start gap-3">
          <input
            type="checkbox"
            :checked="task.completed"
            @change="handleToggleComplete"
            class="mt-1 w-4 h-4 text-emerald-600 rounded border-zinc-300 focus:ring-emerald-500 cursor-pointer"
          />
          <div class="flex-1">
            <h3
              class="text-base font-semibold leading-snug break-words"
              :class="{ 'line-through text-zinc-400 dark:text-zinc-500': task.completed }"
            >
              {{ task.title }}
            </h3>
          </div>
        </div>

        <!-- Metadata Section -->
        <div class="space-y-3 pt-2 text-sm">
          <!-- List Info -->
          <div class="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
            <Folder class="w-4 h-4 shrink-0 text-zinc-400" />
            <span class="w-20 text-xs font-medium uppercase tracking-wider">List</span>
            <span class="text-zinc-800 dark:text-zinc-200 font-medium truncate">
              {{ taskList ? taskList.name : 'Unknown' }}
            </span>
          </div>

          <!-- Priority Info -->
          <div class="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
            <Flag class="w-4 h-4 shrink-0 text-zinc-400" />
            <span class="w-20 text-xs font-medium uppercase tracking-wider">Priority</span>
            <span class="text-zinc-800 dark:text-zinc-200 font-medium">
              <span v-if="task.priority === PRIORITY.HIGH" class="text-red-600 dark:text-red-400">P1 (High)</span>
              <span v-else-if="task.priority === PRIORITY.MEDIUM" class="text-amber-600 dark:text-amber-400">P2 (Medium)</span>
              <span v-else-if="task.priority === PRIORITY.LOW" class="text-blue-600 dark:text-blue-400">P3 (Low)</span>
              <span v-else class="text-zinc-400">None</span>
            </span>
          </div>

          <!-- Due Date Info -->
          <div class="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
            <Calendar class="w-4 h-4 shrink-0 text-zinc-400" />
            <span class="w-20 text-xs font-medium uppercase tracking-wider">Due</span>
            <span class="text-zinc-800 dark:text-zinc-200">
              {{ formatDate(task.due) }}
            </span>
          </div>

          <!-- Created Timestamp -->
          <div class="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
            <Clock class="w-4 h-4 shrink-0 text-zinc-400" />
            <span class="w-20 text-xs font-medium uppercase tracking-wider">Created</span>
            <span class="text-xs text-zinc-500 dark:text-zinc-400">
              {{ formatDate(task.created_at) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/50 flex items-center justify-between">
        <button
          type="button"
          @click="handleDelete"
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
        >
          <Trash2 class="w-3.5 h-3.5" />
          <span>Delete Task</span>
        </button>

        <span class="text-[11px] text-zinc-400">
          ID: {{ task.id.slice(0, 8) }}...
        </span>
      </div>
    </div>
  </aside>
</template>
