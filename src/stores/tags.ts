import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { Tag } from "../models/index.ts";
import { createTag as apiCreateTag, getTags as apiGetTags } from "../services/api.ts";
import { useTaskStore } from "./tasks.ts";

export interface TagWithCount extends Tag {
	taskCount: number;
}

export const useTagStore = defineStore("tags", () => {
	const tags = ref<Tag[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	async function fetchTags(): Promise<Tag[]> {
		loading.value = true;
		error.value = null;
		try {
			const fetched = await apiGetTags();
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

	async function createTag(name: string, color?: string | null): Promise<Tag> {
		loading.value = true;
		error.value = null;
		try {
			const created = await apiCreateTag(name, color);
			if (!tags.value.some((t) => t.id === created.id)) {
				tags.value.push(created);
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

	/**
	 * Unique tags extracted from both the tags table and any tasks in taskStore.allTasks.
	 * Includes real-time incomplete task counts.
	 */
	const tagsWithCounts = computed<TagWithCount[]>(() => {
		const taskStore = useTaskStore();
		const tagMap = new Map<string, TagWithCount>();

		// 1. Seed with tags from the database
		for (const tag of tags.value) {
			if (tag.deleted_at === null) {
				tagMap.set(tag.name.toLowerCase(), {
					...tag,
					taskCount: 0,
				});
			}
		}

		// 2. Extract unique tags from tasks and count incomplete non-deleted tasks
		for (const task of taskStore.allTasks) {
			if (task.deleted_at !== null) continue;

			if ("tags" in task && Array.isArray(task.tags)) {
				for (const item of task.tags) {
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
						}
					} else {
						tagMap.set(key, {
							id: tagId || key,
							name: tagName,
							color: tagColor,
							created_at: task.created_at,
							updated_at: task.updated_at,
							deleted_at: null,
							taskCount: task.completed ? 0 : 1,
						});
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
