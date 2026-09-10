import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { List } from "../models/index.ts";
import {
	createList as apiCreateList,
	deleteList as apiDeleteList,
	getLists as apiGetLists,
	updateList as apiUpdateList,
} from "../services/api.ts";

export type DefaultView =
	| "inbox"
	| "today"
	| "tomorrow"
	| "this_week"
	| "all"
	| "trash";

export const useListStore = defineStore("lists", () => {
	const lists = ref<List[]>([]);
	const activeListId = ref<string | null>(null);
	const activeView = ref<DefaultView | null>(null);
	const loading = ref(false);
	const error = ref<string | null>(null);

	const activeList = computed<List | null>(
		() => lists.value.find((l) => l.id === activeListId.value) ?? null,
	);

	const sortedLists = computed<List[]>(() =>
		[...lists.value].sort((a, b) => a.position - b.position),
	);

	const inboxList = computed<List | null>(
		() => lists.value.find((l) => l.name.toLowerCase() === "inbox") ?? null,
	);

	const customLists = computed<List[]>(() =>
		sortedLists.value.filter((l) => l.name.toLowerCase() !== "inbox"),
	);

	function setActiveList(id: string | null) {
		activeListId.value = id;
		if (id !== null) {
			activeView.value = null;
		}
	}

	function setActiveView(view: DefaultView | null) {
		activeView.value = view;
		if (view !== null) {
			activeListId.value = null;
		}
	}

	async function fetchLists(): Promise<List[]> {
		loading.value = true;
		error.value = null;
		try {
			const fetched = await apiGetLists();
			lists.value = fetched;
			if (!activeView.value) {
				if (
					activeListId.value &&
					!fetched.some((l) => l.id === activeListId.value)
				) {
					activeListId.value =
						fetched.find((l) => l.name.toLowerCase() === "inbox")?.id ??
						fetched[0]?.id ??
						null;
				} else if (!activeListId.value && fetched.length > 0) {
					activeListId.value =
						fetched.find((l) => l.name.toLowerCase() === "inbox")?.id ??
						fetched[0]?.id ??
						null;
				}
			}
			return fetched;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			error.value = msg;
			throw err;
		} finally {
			loading.value = false;
		}
	}

	async function createList(
		name: string,
		color?: string | null,
	): Promise<List> {
		loading.value = true;
		error.value = null;
		try {
			const created = await apiCreateList(name, color);
			lists.value.push(created);
			activeView.value = null;
			activeListId.value = created.id;
			return created;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			error.value = msg;
			throw err;
		} finally {
			loading.value = false;
		}
	}
	async function updateList(input: {
		id: string;
		name?: string;
		color?: string | null;
		position?: number;
	}): Promise<List> {
		loading.value = true;
		error.value = null;
		try {
			const updated = await apiUpdateList(input);
			const idx = lists.value.findIndex((l) => l.id === input.id);
			if (idx !== -1) {
				lists.value[idx] = updated;
			}
			return updated;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			error.value = msg;
			throw err;
		} finally {
			loading.value = false;
		}
	}

	async function deleteList(id: string): Promise<void> {
		if (inboxList.value && inboxList.value.id === id) {
			throw new Error("Cannot delete the default Inbox list");
		}
		loading.value = true;
		error.value = null;
		try {
			await apiDeleteList(id);
			lists.value = lists.value.filter((l) => l.id !== id);
			if (activeListId.value === id) {
				activeListId.value = inboxList.value?.id ?? lists.value[0]?.id ?? null;
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			error.value = msg;
			throw err;
		} finally {
			loading.value = false;
		}
	}

	return {
		lists,
		activeListId,
		activeView,
		loading,
		error,
		activeList,
		sortedLists,
		inboxList,
		customLists,
		setActiveList,
		setActiveView,
		fetchLists,
		createList,
		updateList,
		deleteList,
	};
});
