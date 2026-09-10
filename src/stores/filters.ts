import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { SmartView } from "../services/queryEngine.ts";
import type { SortField, SortOptions, SortOrder } from "../utils/sorting.ts";

export type ActiveFilterType = "smart_view" | "list" | "tag" | "none";

export const useFilterStore = defineStore("filters", () => {
	const selectedListId = ref<string | null>(null);
	const selectedTag = ref<string | null>(null);
	const smartView = ref<SmartView | null>(null);
	const includeCompleted = ref<boolean>(true);
	const searchQuery = ref<string>("");
	const sortBy = ref<SortField>("priority");
	const sortOrder = ref<SortOrder>("asc");

	const hasActiveFilter = computed<boolean>(() => {
		return (
			selectedListId.value !== null ||
			selectedTag.value !== null ||
			smartView.value !== null ||
			searchQuery.value.trim() !== ""
		);
	});

	const activeFilterType = computed<ActiveFilterType>(() => {
		if (smartView.value !== null) return "smart_view";
		if (selectedListId.value !== null) return "list";
		if (selectedTag.value !== null) return "tag";
		return "none";
	});

	const sortOptions = computed<SortOptions>(() => ({
		field: sortBy.value,
		order: sortOrder.value,
		completedToEnd: true,
	}));

	function isSmartViewActive(view: SmartView): boolean {
		return smartView.value === view;
	}

	function setListFilter(listId: string | null) {
		selectedListId.value = listId;
		if (listId !== null) {
			smartView.value = null;
		}
	}

	function setSmartView(view: SmartView | null) {
		smartView.value = view;
		if (view !== null) {
			selectedListId.value = null;
		}
	}

	function setTagFilter(tag: string | null) {
		selectedTag.value = tag;
	}

	function setIncludeCompleted(include: boolean) {
		includeCompleted.value = include;
	}

	function toggleIncludeCompleted(): boolean {
		includeCompleted.value = !includeCompleted.value;
		return includeCompleted.value;
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
		selectedListId.value = null;
		selectedTag.value = null;
		smartView.value = null;
		includeCompleted.value = true;
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
