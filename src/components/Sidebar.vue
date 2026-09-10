<script setup lang="ts">
import { CheckCircle2, FolderPlus, Plus, Trash2 } from "lucide-vue-next";
import { ref } from "vue";
import { useListStore } from "../stores/lists.ts";
import { useTaskStore } from "../stores/tasks.ts";

const listStore = useListStore();
const taskStore = useTaskStore();

const newListName = ref("");
const isCreating = ref(false);

async function handleCreateList() {
	const name = newListName.value.trim();
	if (!name) return;

	try {
		isCreating.value = true;
		const created = await listStore.createList(name);
		newListName.value = "";
		listStore.setActiveList(created.id);
		await taskStore.fetchTasks(created.id);
	} catch (err) {
		console.error("Failed to create list:", err);
	} finally {
		isCreating.value = false;
	}
}

async function handleSelectList(id: string) {
	listStore.setActiveList(id);
	taskStore.setActiveTask(null);
	await taskStore.fetchTasks(id);
}

async function handleDeleteList(event: MouseEvent, id: string) {
	event.stopPropagation();
	const confirmDelete = window.confirm(
		"Are you sure you want to delete this list?",
	);
	if (!confirmDelete) return;

	try {
		await listStore.deleteList(id);
		if (listStore.activeListId) {
			await taskStore.fetchTasks(listStore.activeListId);
		} else {
			taskStore.tasks = [];
		}
	} catch (err) {
		console.error("Failed to delete list:", err);
	}
}
</script>

<template>
  <aside class="flex flex-col h-full bg-zinc-100 dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 select-none">
    <!-- App Header -->
    <div class="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
      <div class="flex items-center gap-2 font-bold text-lg tracking-tight">
        <CheckCircle2 class="w-6 h-6 text-emerald-500 shrink-0" />
        <span>TuDu</span>
      </div>
      <span class="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
        {{ listStore.lists.length }} {{ listStore.lists.length === 1 ? 'list' : 'lists' }}
      </span>
    </div>

    <!-- Lists Section -->
    <div class="flex-1 overflow-y-auto px-3 py-3 space-y-1">
      <div class="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 px-2 py-1">
        My Lists
      </div>

      <div v-if="listStore.loading && listStore.lists.length === 0" class="px-2 py-4 text-sm text-zinc-400">
        Loading lists...
      </div>

      <div v-else-if="listStore.lists.length === 0" class="px-2 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
        <FolderPlus class="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No lists yet.</p>
        <p class="text-xs text-zinc-400">Create one below to start.</p>
      </div>

      <div
        v-for="list in listStore.sortedLists"
        :key="list.id"
        @click="handleSelectList(list.id)"
        class="group flex items-center justify-between px-2.5 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
        :class="[
          list.id === listStore.activeListId
            ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 font-semibold shadow-xs'
            : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60'
        ]"
      >
        <div class="flex items-center gap-2.5 min-w-0">
          <span
            class="w-2.5 h-2.5 rounded-full shrink-0"
            :style="{ backgroundColor: list.color || '#10b981' }"
          />
          <span class="truncate">{{ list.name }}</span>
        </div>

        <button
          type="button"
          title="Delete list"
          class="opacity-0 group-hover:opacity-100 hover:text-red-500 p-1 rounded transition-opacity"
          @click="handleDeleteList($event, list.id)"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- New List Input -->
    <div class="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
      <form @submit.prevent="handleCreateList" class="flex items-center gap-1.5">
        <input
          v-model="newListName"
          type="text"
          placeholder="New list..."
          :disabled="isCreating"
          class="flex-1 min-w-0 px-2.5 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
        />
        <button
          type="submit"
          :disabled="isCreating || !newListName.trim()"
          class="p-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white transition-colors cursor-pointer"
          title="Create list"
        >
          <Plus class="w-4 h-4" />
        </button>
      </form>
    </div>
  </aside>
</template>
