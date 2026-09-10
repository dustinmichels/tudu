import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type {
	CreateTaskInput,
	Priority,
	Task,
	UpdateTaskInput,
} from "../models/index.ts";
import {
	createTask as apiCreateTask,
	deleteTask as apiDeleteTask,
	getTasks as apiGetTasks,
	toggleTaskComplete as apiToggleTaskComplete,
	updateTask as apiUpdateTask,
} from "../services/api.ts";
import { useListStore } from "./lists.ts";

export interface AddTaskOptions {
	title: string;
	list_id?: string;
	due?: string | null;
	priority?: Priority | null;
	parent_id?: string | null;
}

export const useTaskStore = defineStore("tasks", () => {
	const tasks = ref<Task[]>([]);
	const activeTaskId = ref<string | null>(null);
	const loading = ref(false);
	const error = ref<string | null>(null);
	const includeCompleted = ref(true);

	const activeTask = computed<Task | null>(
		() => tasks.value.find((t) => t.id === activeTaskId.value) ?? null,
	);

	const incompleteTasks = computed<Task[]>(() =>
		tasks.value.filter((t) => !t.completed),
	);

	const completedTasks = computed<Task[]>(() =>
		tasks.value.filter((t) => t.completed),
	);

	const rootTasks = computed<Task[]>(() =>
		tasks.value.filter((t) => !t.parent_id),
	);

	function setActiveTask(id: string | null) {
		activeTaskId.value = id;
	}

	function setIncludeCompleted(value: boolean) {
		includeCompleted.value = value;
	}

	async function fetchTasks(
		listId?: string,
		withCompleted?: boolean,
	): Promise<Task[]> {
		const listStore = useListStore();
		const targetListId = listId ?? listStore.activeListId;

		if (!targetListId) {
			tasks.value = [];
			return [];
		}

		loading.value = true;
		error.value = null;
		try {
			const shouldInclude = withCompleted ?? includeCompleted.value;
			const fetched = await apiGetTasks(targetListId, shouldInclude);
			tasks.value = fetched;
			return fetched;
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
		const targetListId = options.list_id ?? listStore.activeListId;

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
			tasks.value.push(created);
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
		const target = tasks.value.find((t) => t.id === id);
		const nextCompleted =
			completed !== undefined ? completed : !(target?.completed ?? false);

		loading.value = true;
		error.value = null;
		try {
			const updated = await apiToggleTaskComplete(id, nextCompleted);
			const index = tasks.value.findIndex((t) => t.id === id);
			if (index !== -1) {
				tasks.value[index] = updated;
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

	async function updateTask(input: UpdateTaskInput): Promise<Task> {
		loading.value = true;
		error.value = null;
		try {
			const updated = await apiUpdateTask(input);
			const index = tasks.value.findIndex((t) => t.id === input.id);
			if (index !== -1) {
				tasks.value[index] = updated;
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

	async function deleteTask(id: string): Promise<void> {
		loading.value = true;
		error.value = null;
		try {
			await apiDeleteTask(id);
			// Remove the task and any subtasks whose parent is this task
			const idsToRemove = new Set<string>([id]);
			let expanded = true;
			while (expanded) {
				expanded = false;
				for (const t of tasks.value) {
					if (
						t.parent_id &&
						idsToRemove.has(t.parent_id) &&
						!idsToRemove.has(t.id)
					) {
						idsToRemove.add(t.id);
						expanded = true;
					}
				}
			}
			tasks.value = tasks.value.filter((t) => !idsToRemove.has(t.id));
			if (activeTaskId.value && idsToRemove.has(activeTaskId.value)) {
				activeTaskId.value = null;
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
		tasks,
		activeTaskId,
		loading,
		error,
		includeCompleted,
		activeTask,
		incompleteTasks,
		completedTasks,
		rootTasks,
		setActiveTask,
		setIncludeCompleted,
		fetchTasks,
		addTask,
		toggleTask,
		updateTask,
		deleteTask,
	};
});
