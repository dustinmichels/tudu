<script setup lang="ts">
import {
	CalendarDays,
	CheckCircle2,
	Circle,
	Cloud,
	CloudAlert,
	CloudOff,
	Command as CommandIcon,
	FileDown,
	FileUp,
	Keyboard as KeyboardIcon,
	List,
	Menu as MenuIcon,
	Search,
	StickyNote,
	X,
} from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { api } from "../services/api.ts";
import { useFilterStore } from "../stores/filters.ts";
import { useTaskStore } from "../stores/tasks.ts";
import { useUIStore } from "../stores/ui.ts";

const filterStore = useFilterStore();
const taskStore = useTaskStore();
const uiStore = useUIStore();

const searchInputRef = ref<HTMLInputElement | null>(null);
const isMac = ref(false);

const isMenuOpen = ref(false);

function toggleMenu() {
	isMenuOpen.value = !isMenuOpen.value;
}

function handleToggleCompleted() {
	const next = !taskStore.includeCompleted;
	taskStore.setIncludeCompleted(next);
	filterStore.setIncludeCompleted(next);
}
function handleOpenImport() {
	isMenuOpen.value = false;
	uiStore.toggleImport(true);
}
async function handleExportBackup() {
	isMenuOpen.value = false;
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
	} catch (err) {
		console.error("Failed to export backup:", err);
	}
}

function handleOpenCommandPalette() {
	isMenuOpen.value = false;
	uiStore.openCommandPalette("commands");
}

function handleOpenShortcuts() {
	isMenuOpen.value = false;
	uiStore.toggleShortcuts(true);
}
function handleDocumentClick(e: MouseEvent) {
	const target = e.target as HTMLElement | null;
	if (target && !target.closest("[data-header-menu-container]")) {
		isMenuOpen.value = false;
	}
}

onMounted(() => {
	isMac.value =
		typeof navigator !== "undefined" &&
		/Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
	window.addEventListener("click", handleDocumentClick);
});

onUnmounted(() => {
	window.removeEventListener("click", handleDocumentClick);
});
function handleClearSearch() {
	filterStore.setSearchQuery("");
	searchInputRef.value?.focus();
}

function handleSearchInput(e: Event) {
	const val = (e.target as HTMLInputElement).value;
	filterStore.setSearchQuery(val);
}

const syncLabel = computed(() => {
	switch (uiStore.syncStatus) {
		case "syncing":
			return "Syncing...";
		case "offline":
			return "Local Storage";
		case "error":
			return "Sync Error";
		default:
			return "Synced";
	}
});

const syncTooltip = computed(() => {
	switch (uiStore.syncStatus) {
		case "syncing":
			return "Syncing with remote database...";
		case "offline":
			return "Local Storage (SQLite) - Cloud sync coming in a future release";
		case "error":
			return "Database synchronization error";
		default:
			return "Synced with Turso Cloud";
	}
});
</script>

<template>
	<header
		data-tauri-drag-region
		class="h-12 w-full shrink-0 select-none flex items-center justify-between px-3 sm:px-4 bg-zinc-100 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 z-30"
	>
		<!-- Left Section: Window traffic light spacer for macOS -->
		<div
			data-tauri-drag-region
			class="flex items-center shrink-0"
			:class="{ 'w-16 sm:w-18': isMac }"
		/>

		<!-- Center Section: Global Search Bar -->
		<div
			data-tauri-drag-region
			class="flex-1 max-w-md mx-2 sm:mx-4 flex items-center justify-center"
		>
			<div class="relative w-full">
				<div
					class="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-zinc-400"
				>
					<Search class="w-4 h-4" />
				</div>
				<input
					ref="searchInputRef"
					type="text"
					data-global-search
					:value="filterStore.searchQuery"
					@input="handleSearchInput"
					placeholder="Search tasks (title, notes, location)..."
					class="w-full pl-8.5 pr-8 py-1.5 text-xs sm:text-sm rounded-lg border border-zinc-300 dark:border-zinc-700/80 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-all shadow-2xs"
				/>

				<button
					v-if="filterStore.searchQuery"
					type="button"
					@click="handleClearSearch"
					class="absolute inset-y-0 right-0 pr-2 flex items-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
					title="Clear search"
					aria-label="Clear search"
				>
					<X class="w-4 h-4" />
				</button>
			</div>
		</div>

		<!-- Right Section: View Mode, Sync Status & Menu -->
		<div data-tauri-drag-region class="flex items-center gap-1.5 sm:gap-2 shrink-0">
			<!-- View Mode -->
			<div
				class="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-200/60 dark:bg-zinc-900/80 p-0.5 text-xs shadow-2xs"
			>
				<button
					v-for="mode in [
						{ id: 'list', label: 'List', icon: List, shortcut: '⌘L' },
						{ id: 'calendar', label: 'Calendar', icon: CalendarDays, shortcut: '⌘C' },
						{ id: 'freeform', label: 'Freeform', icon: StickyNote, shortcut: '⌘F' },
					] as const"
					:key="mode.id"
					type="button"
					@click="uiStore.setViewMode(mode.id)"
					:class="[
						uiStore.viewMode === mode.id
							? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold'
							: 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200',
					]"
					class="flex cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 transition-all"
					:title="`${mode.label} view (${mode.shortcut})`"
					:aria-label="`${mode.label} view (${mode.shortcut})`"
				>
					<component
						:is="mode.icon"
						class="h-3.5 w-3.5"
						:class="{
							'text-teal-500': uiStore.viewMode === mode.id && mode.id === 'calendar',
							'text-yellow-500': uiStore.viewMode === mode.id && mode.id === 'freeform',
						}"
					/>
					<span class="hidden md:inline">{{ mode.label }}</span>
				</button>
			</div>

			<!-- Global Toggle: Show / Hide Completed Tasks -->
			<button
				type="button"
				@click="handleToggleCompleted"
				:title="taskStore.includeCompleted ? 'Hide completed tasks' : 'Show completed tasks'"
				:aria-label="taskStore.includeCompleted ? 'Hide completed tasks' : 'Show completed tasks'"
				class="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md font-medium border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
				data-toggle-completed-button
			>
				<CheckCircle2 v-if="taskStore.includeCompleted" class="w-3.5 h-3.5 text-emerald-500" />
				<Circle v-else class="w-3.5 h-3.5 text-zinc-400" />
				<span class="hidden sm:inline">{{
					taskStore.includeCompleted ? "Completed shown" : "Completed hidden"
				}}</span>
			</button>

			<!-- App Menu Button > Import -->
			<div class="relative" data-header-menu-container>
				<button
					type="button"
					@click="toggleMenu"
					title="Menu"
					aria-label="Menu"
					class="flex items-center gap-1 px-2 py-1 text-xs rounded-md font-medium border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
					data-menu-button
				>
					<MenuIcon class="w-3.5 h-3.5" />
					<span class="hidden sm:inline">Menu</span>
				</button>

				<!-- Menu Dropdown -->
				<div
					v-if="isMenuOpen"
					class="absolute right-0 top-full mt-1 w-44 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg z-50 text-xs text-zinc-800 dark:text-zinc-200"
				>
					<button
						type="button"
						@click="handleOpenCommandPalette"
						class="w-full px-3 py-2 text-left flex items-center justify-between hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
						data-menu-commands-button
					>
						<div class="flex items-center gap-2">
							<CommandIcon class="w-4 h-4 text-emerald-500" />
							<span>Command Palette...</span>
						</div>
						<kbd class="text-[10px] text-zinc-400 font-mono">⌘⇧P</kbd>
					</button>
					<button
						type="button"
						@click="handleOpenImport"
						class="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
						data-menu-import-button
					>
						<FileUp class="w-4 h-4 text-emerald-500" />
						<span>Import...</span>
					</button>
					<button
						type="button"
						@click="handleExportBackup"
						class="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
						data-menu-export-button
					>
						<FileDown class="w-4 h-4 text-emerald-500" />
						<span>Export Backup...</span>
					</button>
					<button
						type="button"
						@click="handleOpenShortcuts"
						class="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
						data-menu-shortcuts-button
					>
						<KeyboardIcon class="w-4 h-4 text-emerald-500" />
						<span>Shortcuts...</span>
					</button>
				</div>
			</div>
			<!-- Sync / Storage Status Indicator -->
			<div
				:title="syncTooltip"
				class="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md font-medium border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 text-zinc-600 dark:text-zinc-400 select-none cursor-default"
			>
				<CloudOff
					v-if="uiStore.syncStatus === 'offline'"
					class="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500"
				/>
				<CloudAlert v-else-if="uiStore.syncStatus === 'error'" class="w-3.5 h-3.5 text-amber-500" />
				<Cloud v-else class="w-3.5 h-3.5 text-emerald-500" />
				<span class="hidden md:inline">{{ syncLabel }}</span>
			</div>
		</div>
	</header>
</template>
