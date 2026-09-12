import { beforeEach, describe, expect, test } from "bun:test";
import { createPinia, setActivePinia } from "pinia";
import { useUIStore } from "../src/stores/ui.ts";

describe("Phase 4: UI Store (useUIStore)", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	test("initializes with default responsive UI states", () => {
		const uiStore = useUIStore();
		expect(uiStore.isSidebarOpen).toBeFalse();
		expect(uiStore.isDetailOpen).toBeTrue();
		expect(uiStore.syncStatus).toBe("offline");
	});

	test("toggles sidebar drawer state", () => {
		const uiStore = useUIStore();
		uiStore.toggleSidebar();
		expect(uiStore.isSidebarOpen).toBeTrue();

		uiStore.toggleSidebar(false);
		expect(uiStore.isSidebarOpen).toBeFalse();

		uiStore.toggleSidebar(true);
		expect(uiStore.isSidebarOpen).toBeTrue();
	});

	test("toggles detail panel state", () => {
		const uiStore = useUIStore();
		expect(uiStore.isDetailOpen).toBeTrue();

		uiStore.toggleDetail();
		expect(uiStore.isDetailOpen).toBeFalse();

		uiStore.toggleDetail(true);
		expect(uiStore.isDetailOpen).toBeTrue();

		uiStore.toggleDetail(false);
		expect(uiStore.isDetailOpen).toBeFalse();
	});

	test("toggles import modal state", () => {
		const uiStore = useUIStore();
		expect(uiStore.isImportOpen).toBeFalse();

		uiStore.toggleImport();
		expect(uiStore.isImportOpen).toBeTrue();

		uiStore.toggleImport(false);
		expect(uiStore.isImportOpen).toBeFalse();
	});

	test("updates sync status", () => {
		const uiStore = useUIStore();
		expect(uiStore.syncStatus).toBe("offline");

		uiStore.setSyncStatus("syncing");
		expect(uiStore.syncStatus).toBe("syncing");

		uiStore.setSyncStatus("offline");
		expect(uiStore.syncStatus).toBe("offline");

		uiStore.setSyncStatus("error");
		expect(uiStore.syncStatus).toBe("error");

		uiStore.setSyncStatus("synced");
		expect(uiStore.syncStatus).toBe("synced");
	});
});
