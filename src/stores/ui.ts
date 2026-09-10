import { defineStore } from "pinia";
import { ref } from "vue";

export const useUIStore = defineStore("ui", () => {
	const isSidebarOpen = ref(false); // Mobile drawer state
	const isDetailOpen = ref(true); // Collapsible/expandable right detail panel
	const isSettingsOpen = ref(false); // Settings modal/popover
	const isImportOpen = ref(false); // Import modal
	const isShortcutsOpen = ref(false); // Keyboard shortcuts modal
	const syncStatus = ref<"synced" | "syncing" | "offline" | "error">("offline");

	function toggleSidebar(open?: boolean) {
		isSidebarOpen.value = open !== undefined ? open : !isSidebarOpen.value;
	}

	function toggleDetail(open?: boolean) {
		isDetailOpen.value = open !== undefined ? open : !isDetailOpen.value;
	}

	function toggleSettings(open?: boolean) {
		isSettingsOpen.value = open !== undefined ? open : !isSettingsOpen.value;
	}
	function toggleImport(open?: boolean) {
		isImportOpen.value = open !== undefined ? open : !isImportOpen.value;
	}

	function toggleShortcuts(open?: boolean) {
		isShortcutsOpen.value = open !== undefined ? open : !isShortcutsOpen.value;
	}

	function setSyncStatus(status: "synced" | "syncing" | "offline" | "error") {
		syncStatus.value = status;
	}

	return {
		isSidebarOpen,
		isDetailOpen,
		isSettingsOpen,
		syncStatus,
		toggleSidebar,
		toggleDetail,
		toggleSettings,
		isImportOpen,
		toggleImport,
		isShortcutsOpen,
		toggleShortcuts,
		setSyncStatus,
	};
});
