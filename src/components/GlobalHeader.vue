<script setup lang="ts">
import {
	CheckCircle2,
	Cloud,
	CloudAlert,
	CloudOff,
	FileUp,
	Keyboard as KeyboardIcon,
	Menu as MenuIcon,
	RefreshCw,
	Search,
	Settings,
	X,
} from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";
import { useFilterStore } from "../stores/filters.ts";
import { useUIStore } from "../stores/ui.ts";

const filterStore = useFilterStore();
const uiStore = useUIStore();

const searchInputRef = ref<HTMLInputElement | null>(null);
const isMac = ref(false);

const isMenuOpen = ref(false);

function toggleMenu() {
	isMenuOpen.value = !isMenuOpen.value;
}

function handleOpenImport() {
	isMenuOpen.value = false;
	uiStore.toggleImport(true);
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
			return "Offline only";
		case "error":
			return "Sync error";
		default:
			return "Synced";
	}
});

function handleTriggerSync() {
	if (uiStore.syncStatus === "offline") return;
	uiStore.setSyncStatus("syncing");
	setTimeout(() => {
		uiStore.setSyncStatus("synced");
	}, 600);
}
</script>

<template>
  <header
    data-tauri-drag-region
    class="h-12 w-full shrink-0 select-none flex items-center justify-between px-3 sm:px-4 bg-zinc-100 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 z-30"
  >
    <!-- Left Section: Window traffic light spacer for macOS & Branding -->
    <div
      data-tauri-drag-region
      class="flex items-center gap-3 shrink-0"
      :class="{ 'pl-16 sm:pl-18': isMac }"
    >
      <div class="flex items-center gap-2 font-bold text-base tracking-tight select-none">
        <CheckCircle2 class="w-5 h-5 text-emerald-500 shrink-0" />
        <span class="hidden sm:inline font-semibold">TuDu</span>
      </div>
    </div>

    <!-- Center Section: Global Search Bar -->
    <div
      data-tauri-drag-region
      class="flex-1 max-w-md mx-2 sm:mx-4 flex items-center justify-center"
    >
      <div class="relative w-full">
        <div class="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-zinc-400">
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
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Right Section: Sync Status & Menu -->
    <div
      data-tauri-drag-region
      class="flex items-center gap-1.5 sm:gap-2 shrink-0"
    >
      <!-- App Menu Button > Import -->
      <div class="relative" data-header-menu-container>
        <button
          type="button"
          @click="toggleMenu"
          title="Menu"
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
            @click="handleOpenImport"
            class="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            data-menu-import-button
          >
            <FileUp class="w-4 h-4 text-emerald-500" />
            <span>Import...</span>
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
      <!-- Sync Status Button -->
      <button
        type="button"
        :disabled="uiStore.syncStatus === 'offline'"
        @click="handleTriggerSync"
        :title="uiStore.syncStatus === 'offline' ? 'Offline only (local database; cloud sync coming in Phase 9)' : `Status: ${syncLabel} (click to sync)`"
        class="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md font-medium border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 text-zinc-600 dark:text-zinc-400 transition-colors"
        :class="uiStore.syncStatus === 'offline' ? 'opacity-60 cursor-default' : 'hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer'"
      >
        <RefreshCw
          v-if="uiStore.syncStatus === 'syncing'"
          class="w-3.5 h-3.5 text-emerald-500 animate-spin"
        />
        <CloudAlert
          v-else-if="uiStore.syncStatus === 'error'"
          class="w-3.5 h-3.5 text-amber-500"
        />
        <CloudOff
          v-else-if="uiStore.syncStatus === 'offline'"
          class="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500"
        />
        <Cloud
          v-else
          class="w-3.5 h-3.5 text-emerald-500"
        />
        <span class="hidden md:inline">{{ syncLabel }}</span>
      </button>

      <!-- Settings Button -->
      <button
        type="button"
        @click="uiStore.toggleSettings()"
        title="Settings"
        class="p-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer"
      >
        <Settings class="w-4 h-4" />
      </button>
    </div>
  </header>
</template>
