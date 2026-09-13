<script setup lang="ts">
import {
	Calendar,
	ChevronLeft,
	Cloud,
	CloudAlert,
	CloudOff,
	FileDown,
	FileUp,
	FolderKanban,
	Inbox,
	Info,
	Moon,
	Plus,
	RefreshCw,
	Settings,
	Sun,
} from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import BunnyCelebration from "../components/BunnyCelebration.vue";
import CaptureModal from "../components/CaptureModal.vue";
import ImportModal from "../components/ImportModal.vue";
import Sidebar from "../components/Sidebar.vue";
import TaskDetail from "../components/TaskDetail.vue";
import TaskList from "../components/TaskList.vue";
import { api } from "../services/api.ts";
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
const inListDetail = ref(false);

const isDarkMode = ref(false);
const isRefreshing = ref(false);
const isExporting = ref(false);
const exportSuccess = ref(false);

function handlePreventDefault(e: DragEvent) {
	e.preventDefault();
}

function switchTab(tab: MobileTab) {
	activeTab.value = tab;
	if (tab === "inbox") {
		inListDetail.value = false;
		filterStore.setTagFilter(null);
		listStore.setActiveList(null);
		listStore.setActiveView("inbox");
	} else if (tab === "today") {
		inListDetail.value = false;
		filterStore.setTagFilter(null);
		listStore.setActiveList(null);
		listStore.setActiveView("today");
	} else if (tab === "lists") {
		inListDetail.value = false;
	} else if (tab === "settings") {
		inListDetail.value = false;
	}
}

function handleBackToLists() {
	inListDetail.value = false;
	listStore.setActiveList(null);
	listStore.setActiveView(null);
	filterStore.setTagFilter(null);
	taskStore.setActiveTask(null);
}

function toggleTheme() {
	isDarkMode.value = !isDarkMode.value;
	if (isDarkMode.value) {
		document.documentElement.classList.add("dark");
		localStorage.setItem("theme", "dark");
	} else {
		document.documentElement.classList.remove("dark");
		localStorage.setItem("theme", "light");
	}
}

async function handleRefresh() {
	isRefreshing.value = true;
	try {
		await Promise.all([listStore.fetchLists(), taskStore.fetchAllTasks(), tagStore.fetchTags()]);
	} catch (err) {
		console.error("Failed to refresh data:", err);
	} finally {
		isRefreshing.value = false;
	}
}

async function handleExportBackup() {
	isExporting.value = true;
	exportSuccess.value = false;
	try {
		const doc = await api.backup.export();
		const jsonStr = JSON.stringify(doc, null, 2);
		const blob = new Blob([jsonStr], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const dateStr = new Date().toISOString().slice(0, 10);
		const a = document.createElement("a");
		a.href = url;
		a.download = `tudu-backup-${dateStr}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		exportSuccess.value = true;
		setTimeout(() => {
			exportSuccess.value = false;
		}, 3000);
	} catch (err) {
		console.error("Failed to export backup:", err);
	} finally {
		isExporting.value = false;
	}
}

// Watch list and view changes to fetch appropriate tasks
watch(
	[() => listStore.activeListId, () => listStore.activeView, () => filterStore.selectedTag],
	async ([listId, view, tag]) => {
		taskStore.setActiveTask(null);
		if (activeTab.value === "lists" && (listId || view || tag)) {
			inListDetail.value = true;
		}
		if (tag) {
			try {
				await taskStore.fetchTasks(null, undefined, null, tag);
			} catch (err) {
				console.error("Failed to fetch tasks for tag:", err);
			}
		} else if (listId) {
			try {
				await taskStore.fetchTasks(listId, undefined, null, null);
			} catch (err) {
				console.error("Failed to fetch tasks for active list:", err);
			}
		} else if (view) {
			try {
				await taskStore.fetchTasks(null, undefined, view, null);
			} catch (err) {
				console.error("Failed to fetch tasks for active view:", err);
			}
		} else {
			taskStore.tasks = [];
		}
	},
);

const headerTitle = computed(() => {
	if (activeTab.value === "inbox") return "Inbox";
	if (activeTab.value === "today") return "Today";
	if (activeTab.value === "settings") return "Settings";
	if (activeTab.value === "lists") {
		if (inListDetail.value) {
			if (filterStore.selectedTag) return `#${filterStore.selectedTag}`;
			if (listStore.activeList) return listStore.activeList.name;
			if (listStore.activeView) {
				const v = listStore.activeView;
				return v.charAt(0).toUpperCase() + v.slice(1).replace("_", " ");
			}
		}
		return "Lists & Tags";
	}
	return "TuDu";
});

onMounted(async () => {
	window.addEventListener("dragover", handlePreventDefault);
	window.addEventListener("drop", handlePreventDefault);

	// Initialize theme from localStorage or system preference
	const savedTheme = localStorage.getItem("theme");
	if (
		savedTheme === "dark" ||
		(!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)
	) {
		document.documentElement.classList.add("dark");
		isDarkMode.value = true;
	} else {
		document.documentElement.classList.remove("dark");
		isDarkMode.value = false;
	}

	try {
		await Promise.all([listStore.fetchLists(), taskStore.fetchAllTasks(), tagStore.fetchTags()]);
		listStore.setActiveView("inbox");
	} catch (err) {
		console.error("Failed to initialize mobile app on mount:", err);
	}
});

onUnmounted(() => {
	window.removeEventListener("dragover", handlePreventDefault);
	window.removeEventListener("drop", handlePreventDefault);
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
				<div class="flex items-center gap-2 min-w-0">
					<!-- Back button when inside list detail in Lists tab -->
					<button
						v-if="activeTab === 'lists' && inListDetail"
						type="button"
						@click="handleBackToLists"
						class="flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 p-1 -ml-2 rounded-md transition-colors"
						aria-label="Back to lists"
					>
						<ChevronLeft class="w-5 h-5" />
						<span>Lists</span>
					</button>
					<h1 v-else class="text-lg font-bold truncate tracking-tight">
						{{ headerTitle }}
					</h1>
				</div>

				<div class="flex items-center gap-2 shrink-0">
					<!-- Sync status indicator -->
					<div
						class="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 mr-1"
						:title="`Sync status: ${uiStore.syncStatus}`"
					>
						<Cloud v-if="uiStore.syncStatus === 'synced'" class="w-4 h-4 text-emerald-500" />
						<RefreshCw
							v-else-if="uiStore.syncStatus === 'syncing' || isRefreshing"
							class="w-4 h-4 animate-spin text-blue-500"
						/>
						<CloudAlert v-else-if="uiStore.syncStatus === 'error'" class="w-4 h-4 text-rose-500" />
						<CloudOff v-else class="w-4 h-4 text-zinc-400" />
					</div>

					<button
						type="button"
						class="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
						aria-label="Settings"
						@click="switchTab('settings')"
					>
						<Settings class="w-4 h-4" />
					</button>
				</div>
			</div>
		</header>

		<!-- Main Content Area -->
		<main class="flex-1 min-h-0 relative overflow-hidden">
			<!-- Inbox View -->
			<div v-show="activeTab === 'inbox'" class="h-full w-full">
				<TaskList class="h-full border-r-0" />
			</div>

			<!-- Today View -->
			<div v-show="activeTab === 'today'" class="h-full w-full">
				<TaskList class="h-full border-r-0" />
			</div>

			<!-- Lists Tab -->
			<div v-show="activeTab === 'lists'" class="h-full w-full">
				<!-- If viewing a selected list/tag, show TaskList -->
				<TaskList v-if="inListDetail" class="h-full border-r-0" />
				<!-- Otherwise show Lists & Tags directory -->
				<div v-else class="h-full overflow-y-auto">
					<Sidebar class="w-full h-full border-r-0" />
				</div>
			</div>

			<!-- Settings View -->
			<div v-show="activeTab === 'settings'" class="h-full overflow-y-auto p-4 space-y-6">
				<!-- Appearance Section -->
				<section
					class="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3"
				>
					<h2
						class="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
					>
						Appearance
					</h2>
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3">
							<Moon v-if="isDarkMode" class="w-5 h-5 text-indigo-400" />
							<Sun v-else class="w-5 h-5 text-amber-500" />
							<div>
								<p class="text-sm font-medium">Dark Mode</p>
								<p class="text-xs text-zinc-500 dark:text-zinc-400">
									{{ isDarkMode ? "Dark theme active" : "Light theme active" }}
								</p>
							</div>
						</div>
						<button
							type="button"
							@click="toggleTheme"
							class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden"
							:class="isDarkMode ? 'bg-blue-600' : 'bg-zinc-200 dark:bg-zinc-700'"
							role="switch"
							:aria-checked="isDarkMode"
							aria-label="Toggle dark mode"
						>
							<span
								class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out"
								:class="isDarkMode ? 'translate-x-5' : 'translate-x-0'"
							/>
						</button>
					</div>
				</section>

				<!-- Data & Sync Section -->
				<section
					class="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3"
				>
					<h2
						class="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
					>
						Data & Synchronization
					</h2>
					<div class="flex items-center justify-between py-1">
						<div>
							<p class="text-sm font-medium">Sync Status</p>
							<p class="text-xs capitalize text-zinc-500 dark:text-zinc-400">
								{{ uiStore.syncStatus }}
							</p>
						</div>
						<button
							type="button"
							@click="handleRefresh"
							:disabled="isRefreshing"
							class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
						>
							<RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isRefreshing }" />
							<span>Sync Now</span>
						</button>
					</div>

					<div
						class="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800"
					>
						<div>
							<p class="text-sm font-medium">Show Completed Tasks</p>
							<p class="text-xs text-zinc-500 dark:text-zinc-400">
								Include finished tasks in views
							</p>
						</div>
						<button
							type="button"
							@click="taskStore.setIncludeCompleted(!taskStore.includeCompleted)"
							class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden"
							:class="taskStore.includeCompleted ? 'bg-blue-600' : 'bg-zinc-200 dark:bg-zinc-700'"
							role="switch"
							:aria-checked="taskStore.includeCompleted"
							aria-label="Toggle completed tasks"
						>
							<span
								class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out"
								:class="taskStore.includeCompleted ? 'translate-x-5' : 'translate-x-0'"
							/>
						</button>
					</div>
				</section>

				<!-- Backup & Import/Export Section -->
				<section
					class="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3"
				>
					<h2
						class="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
					>
						Backup & Migration
					</h2>
					<div class="space-y-2">
						<button
							type="button"
							@click="uiStore.toggleImport(true)"
							class="w-full flex items-center justify-between p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
						>
							<div class="flex items-center gap-3">
								<FileUp class="w-5 h-5 text-emerald-500" />
								<div>
									<p class="text-sm font-medium">Import Backup...</p>
									<p class="text-xs text-zinc-500 dark:text-zinc-400">
										Restore OpenTask v1.0 or Remember The Milk JSON
									</p>
								</div>
							</div>
						</button>

						<button
							type="button"
							@click="handleExportBackup"
							:disabled="isExporting"
							class="w-full flex items-center justify-between p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left disabled:opacity-50"
						>
							<div class="flex items-center gap-3">
								<FileDown class="w-5 h-5 text-blue-500" />
								<div>
									<p class="text-sm font-medium">Export OpenTask Backup</p>
									<p class="text-xs text-zinc-500 dark:text-zinc-400">
										Download all lists, tasks, and notes as OpenTask JSON
									</p>
								</div>
							</div>
							<span
								v-if="exportSuccess"
								class="text-xs font-medium text-emerald-600 dark:text-emerald-400"
							>
								Saved!
							</span>
						</button>
					</div>
				</section>

				<!-- About Section -->
				<section
					class="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-2"
				>
					<div class="flex items-center gap-2">
						<Info class="w-4 h-4 text-zinc-400" />
						<h2
							class="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
						>
							About TuDu
						</h2>
					</div>
					<p class="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
						TuDu Mobile v1.0.0 · OpenTask v1.0 Specification Compliant. Local-first task manager
						powered by SQLite & Tauri v2.
					</p>
				</section>
			</div>

			<!-- Mobile Sidebar Drawer (opened via hamburger in TaskListHeader) -->
			<div
				v-if="uiStore.isSidebarOpen"
				@click="uiStore.toggleSidebar(false)"
				class="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 transition-opacity"
			/>
			<div
				class="fixed inset-y-0 left-0 z-50 h-full w-72 shrink-0 transition-transform duration-200 ease-in-out"
				:class="[uiStore.isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full']"
			>
				<Sidebar class="w-full h-full" />
			</div>

			<!-- Mobile Task Detail Panel (Slides over screen when a task is clicked) -->
			<div
				v-if="uiStore.isDetailOpen && taskStore.activeTask"
				@click="
					uiStore.toggleDetail(false);
					taskStore.setActiveTask(null);
				"
				class="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 transition-opacity"
			/>
			<aside
				v-if="uiStore.isDetailOpen && taskStore.activeTask"
				class="fixed inset-y-0 right-0 z-50 w-full sm:max-w-md bg-zinc-50 dark:bg-zinc-950 shadow-2xl transition-all duration-200 ease-in-out border-l border-zinc-200 dark:border-zinc-800 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] flex flex-col"
			>
				<TaskDetail class="w-full h-full" />
			</aside>
		</main>

		<!-- Floating Action Button (FAB for quick task capture) -->
		<div
			v-if="activeTab !== 'settings'"
			class="fixed right-5 bottom-20 z-30 pb-[env(safe-area-inset-bottom,0px)]"
		>
			<button
				type="button"
				@click="uiStore.toggleCapture(true)"
				class="w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-500 active:scale-95 text-white shadow-lg shadow-blue-600/30 flex items-center justify-center transition-all cursor-pointer"
				aria-label="Add task"
			>
				<Plus class="w-6 h-6 stroke-[2.5]" />
			</button>
		</div>

		<!-- Mobile Bottom Navigation Bar (Safe Area Bottom) -->
		<nav
			class="pb-[env(safe-area-inset-bottom,0px)] bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 shrink-0 z-20"
		>
			<div class="h-16 flex items-center justify-around px-2">
				<button
					type="button"
					@click="switchTab('inbox')"
					class="flex flex-col items-center justify-center flex-1 py-1 text-xs font-medium transition-colors relative"
					:class="
						activeTab === 'inbox'
							? 'text-blue-600 dark:text-blue-400'
							: 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
					"
				>
					<div class="relative">
						<Inbox class="w-5 h-5 mb-1" />
						<span
							v-if="taskStore.countInbox > 0"
							class="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center"
						>
							{{ taskStore.countInbox > 99 ? "99+" : taskStore.countInbox }}
						</span>
					</div>
					<span>Inbox</span>
				</button>

				<button
					type="button"
					@click="switchTab('today')"
					class="flex flex-col items-center justify-center flex-1 py-1 text-xs font-medium transition-colors relative"
					:class="
						activeTab === 'today'
							? 'text-blue-600 dark:text-blue-400'
							: 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
					"
				>
					<div class="relative">
						<Calendar class="w-5 h-5 mb-1" />
						<span
							v-if="taskStore.countToday > 0"
							class="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center"
						>
							{{ taskStore.countToday > 99 ? "99+" : taskStore.countToday }}
						</span>
					</div>
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

		<!-- Modals -->
		<CaptureModal />
		<ImportModal />
		<BunnyCelebration />
	</div>
</template>
