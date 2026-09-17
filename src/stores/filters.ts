import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { SmartView } from "../services/queryEngine.ts";
import type { SortField, SortOptions, SortOrder } from "../utils/sorting.ts";
import { useListStore } from "./lists.ts";
import { useTaskStore } from "./tasks.ts";

export type ActiveFilterType = "smart_view" | "list" | "tag" | "none";

export const useFilterStore = defineStore("filters", () => {
	const selectedTag = ref<string | null>(null);
	const searchQuery = ref<string>("");
	const sortBy = ref<SortField>("priority");
	const sortOrder = ref<SortOrder>("asc");

	const listStore = useListStore();
	const taskStore = useTaskStore();

	// Navigation state: listStore is the single authoritative source of truth
	const selectedListId = computed({
		get: () => listStore.activeListId,
		set: (id: string | null) => listStore.setActiveList(id),
	});

	const smartView = computed({
		get: () => listStore.activeView as SmartView | null,
		set: (view: SmartView | null) => listStore.setActiveView(view),
	});

	// Completion visibility: taskStore is the single authoritative source of truth
	const includeCompleted = computed({
		get: () => taskStore.includeCompleted,
		set: (val: boolean) => taskStore.setIncludeCompleted(val),
	});

	const hasActiveFilter = computed<boolean>(() => {
		return (
			listStore.activeListId !== null ||
			selectedTag.value !== null ||
			listStore.activeView !== null ||
			searchQuery.value.trim() !== ""
		);
	});

	const activeFilterType = computed<ActiveFilterType>(() => {
		if (listStore.activeView !== null) return "smart_view";
		if (listStore.activeListId !== null) return "list";
		if (selectedTag.value !== null) return "tag";
		return "none";
	});

	const sortOptions = computed<SortOptions>(() => ({
		field: sortBy.value,
		order: sortOrder.value,
		completedToEnd: true,
	}));

	function isSmartViewActive(view: SmartView): boolean {
		return listStore.activeView === view;
	}

	function setListFilter(listId: string | null) {
		listStore.setActiveList(listId);
	}

	function setSmartView(view: SmartView | null) {
		listStore.setActiveView(view);
	}

	function setTagFilter(tag: string | null) {
		selectedTag.value = tag;
	}

	function setIncludeCompleted(include: boolean) {
		taskStore.setIncludeCompleted(include);
	}

	function toggleIncludeCompleted(): boolean {
		return taskStore.toggleIncludeCompleted();
	}

	function setSearchQuery(query: string) {
		searchQuery.value = query;
	}

	function setSorting(field: SortField, order?: SortOrder) {
		sortBy.value = field;
		if (order) {
			sortOrder.value = order;
		}
	}

	function resetFilters() {
		listStore.setActiveList(null);
		listStore.setActiveView(null);
		selectedTag.value = null;
		taskStore.setIncludeCompleted(true);
		searchQuery.value = "";
		sortBy.value = "priority";
		sortOrder.value = "asc";
	}

	return {
		selectedListId,
		selectedTag,
		smartView,
		includeCompleted,
		searchQuery,
		sortBy,
		sortOrder,
		hasActiveFilter,
		activeFilterType,
		sortOptions,
		isSmartViewActive,
		setListFilter,
		setSmartView,
		setTagFilter,
		setIncludeCompleted,
		toggleIncludeCompleted,
		setSearchQuery,
		setSorting,
		resetFilters,
	};
});

export type FilterStore = ReturnType<typeof useFilterStore>;
