import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { Tag, TagWithCount } from "../models/index.ts";
import {
	createTag as apiCreateTag,
	getTagsWithCounts as apiGetTagsWithCounts,
} from "../services/api.ts";
import { useTaskStore } from "./tasks.ts";

export type { TagWithCount } from "../models/index.ts";

export const useTagStore = defineStore("tags", () => {
	const tags = ref<TagWithCount[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	async function fetchTags(): Promise<TagWithCount[]> {
		loading.value = true;
		error.value = null;
		try {
			const fetched = await apiGetTagsWithCounts();
			tags.value = fetched ?? [];
			return tags.value;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			error.value = msg;
			return [];
		} finally {
			loading.value = false;
		}
	}

	async function createTag(name: string, color?: string | null): Promise<TagWithCount> {
		loading.value = true;
		error.value = null;
		try {
			const created = await apiCreateTag(name, color);
			const tagWithCount: TagWithCount = {
				...created,
				task_count: 0,
				taskCount: 0,
			};
			if (!tags.value.some((t) => t.id === created.id)) {
				tags.value.push(tagWithCount);
			}
			return tagWithCount;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			error.value = msg;
			throw err;
		} finally {
			loading.value = false;
		}
	}

	/**
	 * Tags with incomplete task counts populated directly from the backend database.
	 * If in-memory tasks contain explicit tag associations (e.g. test fixtures or optimistic states),
	 * extracts and computes counts dynamically.
	 * Sorted alphabetically case-insensitively.
	 */
	const tagsWithCounts = computed<TagWithCount[]>(() => {
		const taskStore = useTaskStore();
		const tagMap = new Map<string, TagWithCount>();

		const hasTasksWithTags = taskStore.allTasks.some(
			(t) =>
				"tags" in t &&
				Array.isArray((t as unknown as { tags?: unknown }).tags) &&
				(t as unknown as { tags?: unknown[] }).tags!.length > 0,
		);

		if (!hasTasksWithTags) {
			for (const tag of tags.value) {
				if (tag.deleted_at === null) {
					tagMap.set(tag.name.toLowerCase(), {
						...tag,
						task_count: tag.task_count ?? tag.taskCount ?? 0,
						taskCount: tag.taskCount ?? tag.task_count ?? 0,
					});
				}
			}
		} else {
			for (const tag of tags.value) {
				if (tag.deleted_at === null) {
					tagMap.set(tag.name.toLowerCase(), {
						...tag,
						task_count: 0,
						taskCount: 0,
					});
				}
			}

			for (const task of taskStore.allTasks) {
				if (task.deleted_at !== null) continue;

				if ("tags" in task && Array.isArray(task.tags)) {
					for (const item of task.tags as Array<Tag | string>) {
						let tagName = "";
						let tagId = "";
						let tagColor: string | null = null;

						if (typeof item === "string") {
							tagName = item.trim();
							tagId = tagName;
						} else if (item && typeof item === "object") {
							if ("name" in item && typeof item.name === "string") {
								tagName = item.name.trim();
							}
							if ("id" in item && typeof item.id === "string") {
								tagId = item.id;
							}
							if ("color" in item && typeof item.color === "string") {
								tagColor = item.color;
							}
						}

						if (!tagName) continue;
						const key = tagName.toLowerCase();
						const existing = tagMap.get(key);

						if (existing) {
							if (!task.completed) {
								existing.taskCount++;
								existing.task_count++;
							}
						} else {
							const count = task.completed ? 0 : 1;
							tagMap.set(key, {
								id: tagId || key,
								name: tagName,
								color: tagColor,
								created_at: task.created_at,
								updated_at: task.updated_at,
								deleted_at: null,
								taskCount: count,
								task_count: count,
							});
						}
					}
				}
			}
		}

		return Array.from(tagMap.values()).sort((a, b) =>
			a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
		);
	});

	return {
		tags,
		loading,
		error,
		tagsWithCounts,
		fetchTags,
		createTag,
	};
});
