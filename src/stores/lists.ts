import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { List } from "../models/index.ts";
import {
	createList as apiCreateList,
	deleteList as apiDeleteList,
	getLists as apiGetLists,
} from "../services/api.ts";

export const useListStore = defineStore("lists", () => {
	const lists = ref<List[]>([]);
	const activeListId = ref<string | null>(null);
	const loading = ref(false);
	const error = ref<string | null>(null);

	const activeList = computed<List | null>(
		() => lists.value.find((l) => l.id === activeListId.value) ?? null,
	);

	const sortedLists = computed<List[]>(() =>
		[...lists.value].sort((a, b) => a.position - b.position),
	);

	function setActiveList(id: string | null) {
		activeListId.value = id;
	}

	async function fetchLists(): Promise<List[]> {
		loading.value = true;
		error.value = null;
		try {
			const fetched = await apiGetLists();
			lists.value = fetched;
			if (
				activeListId.value &&
				!fetched.some((l) => l.id === activeListId.value)
			) {
				activeListId.value = fetched[0]?.id ?? null;
			} else if (!activeListId.value && fetched.length > 0) {
				activeListId.value = fetched[0]?.id ?? null;
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

	async function deleteList(id: string): Promise<void> {
		loading.value = true;
		error.value = null;
		try {
			await apiDeleteList(id);
			lists.value = lists.value.filter((l) => l.id !== id);
			if (activeListId.value === id) {
				activeListId.value = lists.value[0]?.id ?? null;
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
		loading,
		error,
		activeList,
		sortedLists,
		setActiveList,
		fetchLists,
		createList,
		deleteList,
	};
});
