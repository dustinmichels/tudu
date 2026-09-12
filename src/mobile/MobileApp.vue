<script setup lang="ts">
import { Calendar, FolderKanban, Inbox, Plus, Settings } from "lucide-vue-next";
import { onMounted, ref } from "vue";
import { useFilterStore } from "../stores/filters.ts";
import { useListStore } from "../stores/lists.ts";
import { useTagStore } from "../stores/tags.ts";
import { useTaskStore } from "../stores/tasks.ts";
import { useUIStore } from "../stores/ui.ts";

const filterStore = useFilterStore();
const listStore = useListStore();
const tagStore = useTagStore();
const taskStore = useTaskStore();
const uiStore = useUIStore();

type MobileTab = "inbox" | "today" | "lists" | "settings";
const activeTab = ref<MobileTab>("inbox");

function switchTab(tab: MobileTab) {
	activeTab.value = tab;
	filterStore.setTagFilter(null);
	if (tab === "inbox") {
		listStore.setActiveView("inbox");
	} else if (tab === "today") {
		listStore.setActiveView("today");
	}
}

onMounted(async () => {
	try {
		await Promise.all([listStore.fetchLists(), taskStore.fetchAllTasks(), tagStore.fetchTags()]);
	} catch (err) {
		console.error("Failed to initialize mobile app on mount:", err);
	}
});
</script>

<template>
	<div
		class="flex flex-col h-screen h-[100dvh] w-screen overflow-hidden bg-zinc-50 dark:bg-zinc-950 font-sans text-zinc-900 dark:text-zinc-100 antialiased select-none"
	>
		<!-- Mobile Top Header (Safe Area Top) -->
		<header
			class="pt-[env(safe-area-inset-top,0px)] bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 shrink-0"
		>
			<div class="h-14 px-4 flex items-center justify-between">
				<h1 class="text-lg font-bold capitalize tracking-tight">
					{{ activeTab }}
				</h1>
				<div class="flex items-center gap-2">
					<button
						type="button"
						class="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
						aria-label="Settings"
						@click="switchTab('settings')"
					>
						<Settings class="w-5 h-5" />
					</button>
				</div>
			</div>
		</header>

		<!-- Main Content Area -->
		<main class="flex-1 min-h-0 overflow-y-auto px-4 py-4 overscroll-contain">
			<div
				class="h-full flex flex-col items-center justify-center text-center p-6 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500"
			>
				<p class="text-base font-medium">Mobile Shell Ready</p>
				<p class="text-sm mt-1 text-zinc-400 dark:text-zinc-500">
					Active view:
					<span class="capitalize text-zinc-700 dark:text-zinc-300 font-semibold">{{
						activeTab
					}}</span>
				</p>
			</div>
		</main>

		<!-- Floating Action Button placeholder -->
		<div class="fixed right-5 bottom-20 z-20 pb-[env(safe-area-inset-bottom,0px)]">
			<button
				type="button"
				class="w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 flex items-center justify-center transition-transform active:scale-95"
				aria-label="Add task"
			>
				<Plus class="w-6 h-6 stroke-[2.5]" />
			</button>
		</div>

		<!-- Mobile Bottom Navigation Bar (Safe Area Bottom) -->
		<nav
			class="pb-[env(safe-area-inset-bottom,0px)] bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 shrink-0 z-10"
		>
			<div class="h-16 flex items-center justify-around px-2">
				<button
					type="button"
					@click="switchTab('inbox')"
					class="flex flex-col items-center justify-center flex-1 py-1 text-xs font-medium transition-colors"
					:class="
						activeTab === 'inbox'
							? 'text-blue-600 dark:text-blue-400'
							: 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
					"
				>
					<Inbox class="w-5 h-5 mb-1" />
					<span>Inbox</span>
				</button>

				<button
					type="button"
					@click="switchTab('today')"
					class="flex flex-col items-center justify-center flex-1 py-1 text-xs font-medium transition-colors"
					:class="
						activeTab === 'today'
							? 'text-blue-600 dark:text-blue-400'
							: 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
					"
				>
					<Calendar class="w-5 h-5 mb-1" />
					<span>Today</span>
				</button>

				<button
					type="button"
					@click="switchTab('lists')"
					class="flex flex-col items-center justify-center flex-1 py-1 text-xs font-medium transition-colors"
					:class="
						activeTab === 'lists'
							? 'text-blue-600 dark:text-blue-400'
							: 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
					"
				>
					<FolderKanban class="w-5 h-5 mb-1" />
					<span>Lists</span>
				</button>

				<button
					type="button"
					@click="switchTab('settings')"
					class="flex flex-col items-center justify-center flex-1 py-1 text-xs font-medium transition-colors"
					:class="
						activeTab === 'settings'
							? 'text-blue-600 dark:text-blue-400'
							: 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
					"
				>
					<Settings class="w-5 h-5 mb-1" />
					<span>Settings</span>
				</button>
			</div>
		</nav>
	</div>
</template>
