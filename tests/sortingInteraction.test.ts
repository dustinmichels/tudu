import { beforeEach, describe, expect, it } from "bun:test";
import { createPinia, setActivePinia } from "pinia";
import { type FilterStore, useFilterStore } from "../src/stores/filters.ts";
import { getNextSortState, type SortField } from "../src/utils/sorting.ts";

describe("Sort Control Interaction (P0.1, P0.2, P0.3)", () => {
	let filterStore: FilterStore;

	// Simulates the click handler in TaskListHeader.vue which is the single owner of sort transitions
	function handleHeaderSortClick(field: SortField) {
		const next = getNextSortState(filterStore.sortBy, filterStore.sortOrder, field);
		filterStore.setSorting(next.field, next.order);
	}

	beforeEach(() => {
		setActivePinia(createPinia());
		filterStore = useFilterStore();
	});

	it("initializes with default sorting (priority, asc)", () => {
		expect(filterStore.sortBy).toBe("priority");
		expect(filterStore.sortOrder).toBe("asc");
	});

	it("cycles through unselected -> asc -> desc -> reset to (priority, asc)", () => {
		// Initial state: default (priority, asc)
		expect(filterStore.sortBy).toBe("priority");
		expect(filterStore.sortOrder).toBe("asc");

		// 1. Click 'due' -> (due, asc)
		handleHeaderSortClick("due");
		expect(filterStore.sortBy).toBe("due");
		expect(filterStore.sortOrder).toBe("asc");

		// 2. Click 'due' again -> (due, desc)
		handleHeaderSortClick("due");
		expect(filterStore.sortBy).toBe("due");
		expect(filterStore.sortOrder).toBe("desc");

		// 3. Click 'due' a third time -> reset to (priority, asc)
		handleHeaderSortClick("due");
		expect(filterStore.sortBy).toBe("priority");
		expect(filterStore.sortOrder).toBe("asc");
	});

	it("toggles priority between asc and desc when priority is active", () => {
		// Default is (priority, asc)
		expect(filterStore.sortBy).toBe("priority");
		expect(filterStore.sortOrder).toBe("asc");

		// 1. Click 'priority' -> (priority, desc)
		handleHeaderSortClick("priority");
		expect(filterStore.sortBy).toBe("priority");
		expect(filterStore.sortOrder).toBe("desc");

		// 2. Click 'priority' again -> (priority, asc)
		handleHeaderSortClick("priority");
		expect(filterStore.sortBy).toBe("priority");
		expect(filterStore.sortOrder).toBe("asc");

		// 3. Click 'priority' again -> (priority, desc)
		handleHeaderSortClick("priority");
		expect(filterStore.sortBy).toBe("priority");
		expect(filterStore.sortOrder).toBe("desc");
	});

	it("switches to a new sort field in asc order when clicking an unselected field", () => {
		// Start by sorting due desc
		handleHeaderSortClick("due");
		handleHeaderSortClick("due");
		expect(filterStore.sortBy).toBe("due");
		expect(filterStore.sortOrder).toBe("desc");

		// Click 'created_at' (unselected field) -> sets (created_at, asc)
		handleHeaderSortClick("created_at");
		expect(filterStore.sortBy).toBe("created_at");
		expect(filterStore.sortOrder).toBe("asc");

		// Click 'tags' (unselected field) -> sets (tags, asc)
		handleHeaderSortClick("tags");
		expect(filterStore.sortBy).toBe("tags");
		expect(filterStore.sortOrder).toBe("asc");
	});

	it("getNextSortState pure helper produces exact cycle transitions", () => {
		// Unselected field from default
		expect(getNextSortState("priority", "asc", "due")).toEqual({ field: "due", order: "asc" });

		// Active field asc -> desc
		expect(getNextSortState("due", "asc", "due")).toEqual({ field: "due", order: "desc" });

		// Active field desc -> reset to (priority, asc)
		expect(getNextSortState("due", "desc", "due")).toEqual({ field: "priority", order: "asc" });

		// Active priority toggles asc -> desc -> asc
		expect(getNextSortState("priority", "asc", "priority")).toEqual({
			field: "priority",
			order: "desc",
		});
		expect(getNextSortState("priority", "desc", "priority")).toEqual({
			field: "priority",
			order: "asc",
		});
	});
});
