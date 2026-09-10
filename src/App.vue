<script setup lang="ts">
import { onMounted, watch } from "vue";
import Sidebar from "./components/Sidebar.vue";
import TaskDetail from "./components/TaskDetail.vue";
import TaskList from "./components/TaskList.vue";
import { useListStore } from "./stores/lists.ts";
import { useTaskStore } from "./stores/tasks.ts";

const listStore = useListStore();
const taskStore = useTaskStore();

onMounted(async () => {
	try {
		const lists = await listStore.fetchLists();
		const firstList = lists[0];
		if (firstList && !listStore.activeListId) {
			listStore.setActiveList(firstList.id);
			await taskStore.fetchTasks(firstList.id);
		}
	} catch (err) {
		console.error("Failed to initialize lists on mount:", err);
	}
});

watch(
	() => listStore.activeListId,
	async (newListId) => {
		taskStore.setActiveTask(null);
		if (newListId) {
			try {
				await taskStore.fetchTasks(newListId);
			} catch (err) {
				console.error("Failed to fetch tasks for active list:", err);
			}
		} else {
			taskStore.tasks = [];
		}
	},
);
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden bg-white dark:bg-zinc-900 font-sans text-zinc-900 dark:text-zinc-100 antialiased">
    <!-- Left Pane: Lists Sidebar -->
    <Sidebar class="w-64 shrink-0 h-full" />

    <!-- Center Pane: Tasks List -->
    <TaskList class="flex-1 min-w-0 h-full" />

    <!-- Right Pane: Task Detail -->
    <TaskDetail class="w-80 shrink-0 h-full border-l border-zinc-200 dark:border-zinc-800" />
  </div>
</template>
