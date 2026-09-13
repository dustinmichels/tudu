import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { CreateTaskInput, Priority, Task, UpdateTaskInput } from "../models/index.ts";
import {
	batchDeleteTasks as apiBatchDeleteTasks,
	batchUpdateTasks as apiBatchUpdateTasks,
	createTask as apiCreateTask,
	deleteTask as apiDeleteTask,
	getTasks as apiGetTasks,
	toggleTaskComplete as apiToggleTaskComplete,
	updateTask as apiUpdateTask,
} from "../services/api.ts";
import {
	getSmartListCounts,
	isOverdue,
	isThisWeek,
	isThisWeekOrOverdue,
	isToday,
	isTodayOrOverdue,
	isTomorrow,
	parseDueDateToLocal,
	type QueryCriteria,
	queryTasks,
	type SmartView,
} from "../services/queryEngine.ts";
import { type SortOptions, sortTasks } from "../utils/sorting.ts";
import { useFilterStore } from "./filters.ts";
import { useListStore } from "./lists.ts";
import { useTagStore } from "./tags.ts";
import { useUIStore } from "./ui.ts";

export {
	isOverdue,
	isThisWeek,
	isThisWeekOrOverdue,
	isToday,
	isTodayOrOverdue,
	isTomorrow,
	parseDueDateToLocal,
	type QueryCriteria,
	type SmartView,
};

export interface AddTaskOptions {
	title: string;
	list_id?: string;
	due?: string | null;
	priority?: Priority | null;
	parent_id?: string | null;
}

export const useTaskStore = defineStore("tasks", () => {
	const tasks = ref<Task[]>([]);
	const allTasks = ref<Task[]>([]);
	const activeTaskId = ref<string | null>(null);
	const loading = ref(false);
	const error = ref<string | null>(null);
	const includeCompleted = ref(true);

	interface DebounceState {
		timer: number | null;
		pendingInput: UpdateTaskInput | null;
		pendingResolves: Array<(task: Task) => void>;
		pendingRejects: Array<(err: unknown) => void>;
		activePromise: Promise<Task> | null;
		baselineSnapshot: Task | null;
	}

	const taskDebounceStateMap = new Map<string, DebounceState>();
	const taskMutationSeq = new Map<string, number>();

	const activeTask = computed<Task | null>(
		() =>
			tasks.value.find((t) => t.id === activeTaskId.value) ??
			allTasks.value.find((t) => t.id === activeTaskId.value) ??
			null,
	);

	const incompleteTasks = computed<Task[]>(() => tasks.value.filter((t) => !t.completed));

	const completedTasks = computed<Task[]>(() => tasks.value.filter((t) => t.completed));

	const rootTasks = computed<Task[]>(() => tasks.value.filter((t) => !t.parent_id));

	// Smart counts and lists
	const smartCounts = computed(() => {
		const listStore = useListStore();
		return getSmartListCounts(allTasks.value, {
			inboxListId: listStore.inboxList?.id,
		});
	});

	const countInbox = computed(() => smartCounts.value.inbox.incomplete);
	const countToday = computed(() => smartCounts.value.today.incomplete);
	const countTomorrow = computed(() => smartCounts.value.tomorrow.incomplete);
	const countThisWeek = computed(() => smartCounts.value.this_week.incomplete);
	const countAll = computed(() => smartCounts.value.all.incomplete);
	const countTrash = computed(() => smartCounts.value.trash.total);
	const countOverdue = computed(() => smartCounts.value.overdue.incomplete);

	// Reactive filtered tasks based on filterStore
	const filteredTasks = computed<Task[]>(() => {
		const filterStore = useFilterStore();
		const listStore = useListStore();

		// When a tag is active, tasks.value is already backend-tag-filtered,
		// so we query over tasks.value without the tag criterion.
		if (filterStore.selectedTag) {
			const criteria: QueryCriteria = {
				smartView: null,
				listId: null,
				completion: includeCompleted.value ? "all" : "incomplete",
				searchQuery: filterStore.searchQuery,
				sort: filterStore.sortOptions,
			};
			return queryTasks(tasks.value, criteria);
		}

		const criteria: QueryCriteria = {
			smartView: listStore.activeView,
			listId: listStore.activeListId,
			inboxListId: listStore.inboxList?.id,
			tag: filterStore.selectedTag,
			completion: includeCompleted.value ? "all" : "incomplete",
			searchQuery: filterStore.searchQuery,
			sort: filterStore.sortOptions,
		};

		return queryTasks(allTasks.value, criteria);
	});
	function getListCount(listId: string): number {
		return allTasks.value.filter(
			(t) => !t.completed && t.deleted_at === null && t.list_id === listId,
		).length;
	}

	function getListOverdueCount(listId: string): number {
		return allTasks.value.filter(
			(t) => !t.completed && t.deleted_at === null && t.list_id === listId && isOverdue(t.due),
		).length;
	}

	function setActiveTask(id: string | null) {
		activeTaskId.value = id;
	}

	function setIncludeCompleted(value: boolean) {
		includeCompleted.value = value;
	}

	function toggleIncludeCompleted(): boolean {
		includeCompleted.value = !includeCompleted.value;
		return includeCompleted.value;
	}
	async function fetchAllTasks(): Promise<Task[]> {
		try {
			const fetched = await apiGetTasks(null, true, null);
			allTasks.value = fetched ?? [];
			return allTasks.value;
		} catch (err) {
			console.error("Failed to fetch all tasks:", err);
			return [];
		}
	}

	async function fetchTasks(
		listId?: string | null,
		withCompleted?: boolean,
		view?: string | null,
		tag?: string | null,
	): Promise<Task[]> {
		const listStore = useListStore();
		const filterStore = useFilterStore();
		const targetView = view !== undefined ? view : listStore.activeView;
		let targetListId = listId !== undefined ? listId : listStore.activeListId;
		const targetTag = tag !== undefined ? tag : filterStore.selectedTag;

		if (targetView === "inbox" && !targetListId) {
			targetListId = listStore.inboxList?.id ?? null;
		}

		// When querying specific views like all, today, tomorrow, this_week, trash,
		// we don't constrain by listId unless explicitly provided.
		if (targetView && targetView !== "inbox" && listId === undefined) {
			targetListId = null;
		}

		if (!targetListId && !targetView && !targetTag) {
			tasks.value = [];
			return [];
		}

		loading.value = true;
		error.value = null;
		try {
			const shouldInclude = withCompleted ?? includeCompleted.value;
			const fetched = await apiGetTasks(targetListId, shouldInclude, targetView, targetTag);
			tasks.value = fetched ?? [];
			return tasks.value;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			error.value = msg;
			throw err;
		} finally {
			loading.value = false;
		}
	}

	async function addTask(options: AddTaskOptions): Promise<Task> {
		const listStore = useListStore();
		let targetListId = options.list_id ?? listStore.activeListId;
		if (!targetListId) {
			targetListId = listStore.inboxList?.id ?? listStore.lists[0]?.id ?? null;
		}

		if (!targetListId) {
			throw new Error("Cannot add task: no list selected");
		}

		loading.value = true;
		error.value = null;
		try {
			const payload: CreateTaskInput = {
				list_id: targetListId,
				title: options.title,
				due: options.due ?? null,
				priority: options.priority ?? null,
				parent_id: options.parent_id ?? null,
			};
			const created = await apiCreateTask(payload);
			if (!tasks.value.some((t) => t.id === created.id)) {
				tasks.value.push(created);
			}
			if (!allTasks.value.some((t) => t.id === created.id)) {
				allTasks.value.push(created);
			}
			return created;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			error.value = msg;
			throw err;
		} finally {
			loading.value = false;
		}
	}

	async function toggleTask(id: string, completed?: boolean): Promise<Task> {
		const target = tasks.value.find((t) => t.id === id) ?? allTasks.value.find((t) => t.id === id);
		const nextCompleted = completed !== undefined ? completed : !(target?.completed ?? false);

		// Optimistic update
		const prevCompleted = target?.completed ?? false;
		const prevCompletedAt = target?.completed_at ?? null;
		const now = new Date().toISOString();

		const applyCompletion = (comp: boolean, compAt: string | null) => {
			const inTasks = tasks.value.find((t) => t.id === id);
			if (inTasks) {
				inTasks.completed = comp;
				inTasks.completed_at = compAt;
			}
			const inAll = allTasks.value.find((t) => t.id === id);
			if (inAll) {
				inAll.completed = comp;
				inAll.completed_at = compAt;
			}
		};

		applyCompletion(nextCompleted, nextCompleted ? now : null);

		if (nextCompleted) {
			try {
				useUIStore().triggerTaskCompletionAnimation();
			} catch {
				// Safe fallback in non-store test environments
			}
		}

		const seq = (taskMutationSeq.get(id) ?? 0) + 1;
		taskMutationSeq.set(id, seq);

		loading.value = true;
		error.value = null;
		try {
			const updated = await apiToggleTaskComplete(id, nextCompleted);
			if (taskMutationSeq.get(id) === seq) {
				const index = tasks.value.findIndex((t) => t.id === id);
				if (index !== -1) tasks.value[index] = updated;
				const allIdx = allTasks.value.findIndex((t) => t.id === id);
				if (allIdx !== -1) allTasks.value[allIdx] = updated;
			}
			void useTagStore().fetchTags();
			return updated;
		} catch (err) {
			// Rollback on failure if no newer mutation occurred
			if (taskMutationSeq.get(id) === seq) {
				applyCompletion(prevCompleted, prevCompletedAt);
			}
			const msg = err instanceof Error ? err.message : String(err);
			error.value = msg;
			throw err;
		} finally {
			loading.value = false;
		}
	}

	async function updateTask(
		input: UpdateTaskInput,
		options?: { debounceMs?: number },
	): Promise<Task> {
		const id = input.id;
		const seq = (taskMutationSeq.get(id) ?? 0) + 1;
		taskMutationSeq.set(id, seq);

		const applyFields = (item: Task, fields: UpdateTaskInput) => {
			const { id: _, repeats, ...rest } = fields;
			for (const [k, v] of Object.entries(rest)) {
				if (v !== undefined) {
					(item as unknown as Record<string, unknown>)[k] = v;
				}
			}
			if (repeats !== undefined && fields.rrule === undefined) {
				item.rrule = repeats;
			}
		};

		// Snapshot original state prior to this update
		const currentInTasks = tasks.value.find((t) => t.id === id);
		const currentInAll = allTasks.value.find((t) => t.id === id);
		const snapshot: Task | null = currentInTasks
			? { ...currentInTasks }
			: currentInAll
				? { ...currentInAll }
				: null;

		// Optimistically mutate both arrays synchronously
		if (currentInTasks) applyFields(currentInTasks, input);
		if (currentInAll) applyFields(currentInAll, input);

		const debounceDelay = options?.debounceMs ?? 300;
		let state = taskDebounceStateMap.get(id);
		if (!state) {
			state = {
				timer: null,
				pendingInput: null,
				pendingResolves: [],
				pendingRejects: [],
				activePromise: null,
				baselineSnapshot: snapshot,
			};
			taskDebounceStateMap.set(id, state);
		}

		// Update pending input
		state.pendingInput = state.pendingInput ? { ...state.pendingInput, ...input } : { ...input };

		if (debounceDelay > 0) {
			return new Promise<Task>((resolve, reject) => {
				state.pendingResolves.push(resolve);
				state.pendingRejects.push(reject);

				if (state.timer !== null) {
					globalThis.clearTimeout(state.timer);
				}
				// Tauri webview scheduler: browser contract returns a numeric handle.
				// `globalThis` (not `window`) keeps this runnable under the Bun test runtime.
				state.timer = (globalThis.setTimeout as Window["setTimeout"])(() => {
					state.timer = null;
					processDebounceQueue(id).catch((err) => {
						error.value = err instanceof Error ? err.message : String(err);
					});
				}, debounceDelay);
			});
		}

		// Immediate (debounceDelay === 0)
		if (state.timer !== null) {
			globalThis.clearTimeout(state.timer);
			state.timer = null;
		}

		return new Promise<Task>((resolve, reject) => {
			state.pendingResolves.push(resolve);
			state.pendingRejects.push(reject);
			processDebounceQueue(id).catch((err) => {
				error.value = err instanceof Error ? err.message : String(err);
			});
		});
	}

	async function processDebounceQueue(id: string): Promise<Task> {
		const state = taskDebounceStateMap.get(id);
		if (!state) {
			const existing =
				tasks.value.find((t) => t.id === id) ?? allTasks.value.find((t) => t.id === id);
			if (existing) return existing;
			throw new Error(`Task not found for id ${id}`);
		}

		// If a request is already running, wait for it before processing next pending
		if (state.activePromise) {
			try {
				await state.activePromise;
			} catch {
				// prior batch error handled by its own catch
			}
			return processDebounceQueue(id);
		}

		// Nothing pending to persist
		if (!state.pendingInput) {
			const existing =
				tasks.value.find((t) => t.id === id) ?? allTasks.value.find((t) => t.id === id);
			const currentResolves = [...state.pendingResolves];
			state.pendingResolves = [];
			state.pendingRejects = [];
			if (existing) {
				for (const res of currentResolves) res(existing);
				return existing;
			}
			const err = new Error(`Task not found for id ${id}`);
			for (const rej of state.pendingRejects) rej(err);
			throw err;
		}

		// Pull current batch
		const batchPayload = { ...state.pendingInput };
		const batchResolves = [...state.pendingResolves];
		const batchRejects = [...state.pendingRejects];
		state.pendingInput = null;
		state.pendingResolves = [];
		state.pendingRejects = [];

		const baseline = state.baselineSnapshot;
		const seq = taskMutationSeq.get(id) ?? 0;

		const runBatch = async (): Promise<Task> => {
			try {
				const updated = await apiUpdateTask(batchPayload);
				// Success: advance baseline snapshot to persisted state
				if (state) {
					state.baselineSnapshot = { ...updated };
				}
				if (taskMutationSeq.get(id) === seq) {
					const idx = tasks.value.findIndex((t) => t.id === id);
					if (idx !== -1) tasks.value[idx] = updated;
					const allIdx = allTasks.value.findIndex((t) => t.id === id);
					if (allIdx !== -1) allTasks.value[allIdx] = updated;
				}
				for (const res of batchResolves) res(updated);
				return updated;
			} catch (err) {
				// Rollback to prior baseline if no newer mutation occurred
				if (taskMutationSeq.get(id) === seq && baseline) {
					const idx = tasks.value.findIndex((t) => t.id === id);
					if (idx !== -1) tasks.value[idx] = { ...baseline };
					const allIdx = allTasks.value.findIndex((t) => t.id === id);
					if (allIdx !== -1) allTasks.value[allIdx] = { ...baseline };
				}
				const msg = err instanceof Error ? err.message : String(err);
				error.value = msg;
				for (const rej of batchRejects) rej(err);
				throw err;
			} finally {
				state.activePromise = null;
				// Clean up state map if completely idle
				if (!state.pendingInput && state.pendingResolves.length === 0 && state.timer === null) {
					taskDebounceStateMap.delete(id);
				}
			}
		};
		state.activePromise = runBatch();
		return state.activePromise;
	}

	function executeDebouncedFlush(id: string): Promise<Task> {
		const state = taskDebounceStateMap.get(id);
		if (state?.timer !== null && state?.timer !== undefined) {
			globalThis.clearTimeout(state.timer);
			state.timer = null;
		}
		return processDebounceQueue(id);
	}

	async function deleteTask(id: string): Promise<void> {
		loading.value = true;
		error.value = null;
		try {
			await apiDeleteTask(id);
			// Soft-delete: update in allTasks with deleted_at timestamp if present, and remove from active tasks
			const now = new Date().toISOString();
			const idsToRemove = new Set<string>([id]);
			let expanded = true;
			while (expanded) {
				expanded = false;
				for (const t of [...tasks.value, ...allTasks.value]) {
					if (t.parent_id && idsToRemove.has(t.parent_id) && !idsToRemove.has(t.id)) {
						idsToRemove.add(t.id);
						expanded = true;
					}
				}
			}

			tasks.value = tasks.value.filter((t) => !idsToRemove.has(t.id));
			for (const t of allTasks.value) {
				if (idsToRemove.has(t.id)) {
					t.deleted_at = now;
				}
			}

			if (activeTaskId.value && idsToRemove.has(activeTaskId.value)) {
				activeTaskId.value = null;
			}
			void useTagStore().fetchTags();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			error.value = msg;
			throw err;
		} finally {
			loading.value = false;
		}
	}

	async function batchDelete(ids: string[]): Promise<void> {
		if (ids.length === 0) return;
		loading.value = true;
		error.value = null;
		try {
			await apiBatchDeleteTasks(ids);
			const now = new Date().toISOString();
			const idsToRemove = new Set<string>(ids);
			let expanded = true;
			while (expanded) {
				expanded = false;
				for (const t of [...tasks.value, ...allTasks.value]) {
					if (t.parent_id && idsToRemove.has(t.parent_id) && !idsToRemove.has(t.id)) {
						idsToRemove.add(t.id);
						expanded = true;
					}
				}
			}

			tasks.value = tasks.value.filter((t) => !idsToRemove.has(t.id));
			for (const t of allTasks.value) {
				if (idsToRemove.has(t.id)) {
					t.deleted_at = now;
				}
			}

			if (activeTaskId.value && idsToRemove.has(activeTaskId.value)) {
				activeTaskId.value = null;
			}
			void useTagStore().fetchTags();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			error.value = msg;
			throw err;
		} finally {
			loading.value = false;
		}
	}
	async function batchUpdate(options: {
		task_ids: string[];
		completed?: boolean;
		postpone_days?: number;
		due?: string | null;
		list_id?: string;
		priority?: Priority | null;
	}): Promise<Task[]> {
		if (!options.task_ids.length) return [];
		loading.value = true;
		error.value = null;
		try {
			const updated = await apiBatchUpdateTasks(options);
			if (options.completed) {
				try {
					useUIStore().triggerTaskCompletionAnimation();
				} catch {
					// Safe fallback in non-store test environments
				}
			}
			const updatedMap = new Map(updated.map((t) => [t.id, t]));
			allTasks.value = allTasks.value.map((t) => updatedMap.get(t.id) ?? t);
			// Re-fetch current view / list to reconcile membership accurately
			const listStore = useListStore();
			const filterStore = useFilterStore();
			if (listStore.activeListId || listStore.activeView || filterStore.selectedTag) {
				await fetchTasks(
					listStore.activeListId,
					includeCompleted.value,
					listStore.activeView,
					filterStore.selectedTag,
				);
			} else {
				tasks.value = tasks.value.map((t) => updatedMap.get(t.id) ?? t);
			}
			if (options.completed !== undefined) {
				void useTagStore().fetchTags();
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
	async function postponeTask(id: string, days: number): Promise<Task | null> {
		const updated = await batchUpdate({
			task_ids: [id],
			postpone_days: days,
		});
		return updated[0] ?? null;
	}

	function query(criteria: QueryCriteria): Task[] {
		return queryTasks(allTasks.value, criteria);
	}

	function sort(options?: SortOptions): Task[] {
		return sortTasks(tasks.value, options);
	}

	return {
		tasks,
		allTasks,
		activeTaskId,
		loading,
		error,
		includeCompleted,
		activeTask,
		incompleteTasks,
		completedTasks,
		rootTasks,
		smartCounts,
		countInbox,
		countToday,
		countTomorrow,
		countThisWeek,
		countAll,
		countTrash,
		countOverdue,
		filteredTasks,
		getListCount,
		getListOverdueCount,
		setActiveTask,
		setIncludeCompleted,
		toggleIncludeCompleted,
		fetchAllTasks,
		fetchTasks,
		addTask,
		toggleTask,
		updateTask,
		deleteTask,
		query,
		sort,
		batchUpdate,
		batchDelete,
		postponeTask,
		flushDebouncedUpdate: executeDebouncedFlush,
	};
});
