import { nextTick, ref, type Ref } from "vue";
import type { Task } from "../models/index.ts";
import { assignTag } from "../services/api.ts";
import { useFilterStore } from "../stores/filters.ts";
import { useListStore } from "../stores/lists.ts";
import { useTagStore } from "../stores/tags.ts";
import { useTaskStore } from "../stores/tasks.ts";
import {
	type ActiveSmartToken,
	detectSmartToken,
	getContextSuggestions,
	getDueSuggestions,
	getPrioritySuggestions,
	getTagAndListSuggestions,
	parseSmartAdd,
	type SmartSuggestion,
} from "../utils/smartAdd.ts";

export interface UseSmartAddInputOptions {
	inputRef?: Ref<HTMLInputElement | null>;
	initialValue?: string;
	onEscape?: () => void;
	onSuccess?: (created: Task) => void | Promise<void>;
	onError?: (err: unknown) => void;
	clearOnSuccess?: boolean;
}

export function getTodayDateStr(): string {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export function getTomorrowDateStr(): string {
	const d = new Date();
	d.setDate(d.getDate() + 1);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export function getYesterdayDateStr(): string {
	const d = new Date();
	d.setDate(d.getDate() - 1);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export function getPriorityFlagClass(insertValue: string): string {
	if (insertValue === "1") return "text-red-500";
	if (insertValue === "2") return "text-amber-500";
	if (insertValue === "3") return "text-blue-500";
	return "text-zinc-400";
}

export function useSmartAddInput(options: UseSmartAddInputOptions = {}) {
	const listStore = useListStore();
	const taskStore = useTaskStore();
	const tagStore = useTagStore();
	const filterStore = useFilterStore();

	const inputRef = options.inputRef ?? ref<HTMLInputElement | null>(null);
	const inputText = ref(options.initialValue ?? "");
	const isAdding = ref(false);

	const activeSmartToken = ref<ActiveSmartToken | null>(null);
	const smartSuggestions = ref<SmartSuggestion[]>([]);
	const selectedSmartIndex = ref(0);
	const isSmartMenuOpen = ref(false);

	function reset() {
		inputText.value = "";
		isSmartMenuOpen.value = false;
		activeSmartToken.value = null;
		smartSuggestions.value = [];
		selectedSmartIndex.value = 0;
	}

	function updateSmartDropdown() {
		const input = inputRef.value;
		if (!input) {
			isSmartMenuOpen.value = false;
			return;
		}
		const cursorPos = input.selectionStart ?? inputText.value.length;
		const token = detectSmartToken(inputText.value, cursorPos);
		if (!token) {
			isSmartMenuOpen.value = false;
			activeSmartToken.value = null;
			smartSuggestions.value = [];
			return;
		}

		activeSmartToken.value = token;
		if (token.prefix === "#") {
			const tagNames = tagStore.tagsWithCounts.map((t) => t.name);
			const listNames = listStore.lists.map((l) => l.name);
			smartSuggestions.value = getTagAndListSuggestions(tagNames, listNames, token.query);
		} else if (token.prefix === "@") {
			const tagNames = tagStore.tagsWithCounts.map((t) => t.name);
			smartSuggestions.value = getContextSuggestions(tagNames, token.query);
		} else if (token.prefix === "^") {
			smartSuggestions.value = getDueSuggestions(token.query);
		} else if (token.prefix === "!") {
			smartSuggestions.value = getPrioritySuggestions(token.query);
		}

		isSmartMenuOpen.value = smartSuggestions.value.length > 0;
		selectedSmartIndex.value = 0;
	}

	function selectSmartSuggestion(suggestion: SmartSuggestion) {
		const token = activeSmartToken.value;
		if (!token || !inputRef.value) return;

		const current = inputText.value;
		const before = current.slice(0, token.startIndex);
		const after = current.slice(token.endIndex);
		const replacement = `${token.prefix}${suggestion.insertValue} `;
		inputText.value = before + replacement + after;

		isSmartMenuOpen.value = false;
		activeSmartToken.value = null;
		smartSuggestions.value = [];

		nextTick(() => {
			const input = inputRef.value;
			if (!input) return;
			input.focus();
			const newCursor = before.length + replacement.length;
			input.setSelectionRange(newCursor, newCursor);
		});
	}

	function handleKeydown(e: KeyboardEvent) {
		if (isSmartMenuOpen.value && smartSuggestions.value.length > 0) {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				selectedSmartIndex.value = (selectedSmartIndex.value + 1) % smartSuggestions.value.length;
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				selectedSmartIndex.value =
					(selectedSmartIndex.value - 1 + smartSuggestions.value.length) %
					smartSuggestions.value.length;
				return;
			}
			if (e.key === "Enter" || e.key === "Tab") {
				const item = smartSuggestions.value[selectedSmartIndex.value];
				if (item) {
					e.preventDefault();
					selectSmartSuggestion(item);
				}
				return;
			}
		}

		if (e.key === "Escape") {
			e.preventDefault();
			if (isSmartMenuOpen.value) {
				isSmartMenuOpen.value = false;
			} else if (options.onEscape) {
				options.onEscape();
			}
		}
	}

	function appendSmartPrefix(prefix: string) {
		const input = inputRef.value;
		const current = inputText.value;
		const needsSpace = current.length > 0 && !current.endsWith(" ");
		inputText.value = `${current}${needsSpace ? " " : ""}${prefix}`;
		nextTick(() => {
			if (!input) return;
			input.focus();
			updateSmartDropdown();
		});
	}

	async function submitTask(): Promise<Task | null> {
		const rawInput = inputText.value.trim();
		if (!rawInput) return null;

		isSmartMenuOpen.value = false;
		const knownListNames = listStore.lists.map((l) => l.name);
		const parsed = parseSmartAdd(rawInput, knownListNames);
		const taskTitle = parsed.title || rawInput;

		let due: string | null = parsed.due ?? null;
		if (!due) {
			if (listStore.activeView === "today") due = getTodayDateStr();
			else if (listStore.activeView === "tomorrow") due = getTomorrowDateStr();
			else if (listStore.activeView === "this_week") due = getTodayDateStr();
			else if (listStore.activeView === "overdue") due = getYesterdayDateStr();
		}

		let targetListId: string | undefined;
		if (parsed.listName) {
			const matched = listStore.lists.find(
				(l) => l.name.toLowerCase() === parsed.listName?.toLowerCase(),
			);
			if (matched) targetListId = matched.id;
		}
		if (!targetListId) {
			if (listStore.activeView === "next_actions" && listStore.nextActionsList) {
				targetListId = listStore.nextActionsList.id;
			} else if (listStore.activeView === "waiting_on" && listStore.waitingOnList) {
				targetListId = listStore.waitingOnList.id;
			} else if (listStore.activeView === "someday_maybe" && listStore.somedayMaybeList) {
				targetListId = listStore.somedayMaybeList.id;
			} else {
				targetListId =
					listStore.activeList?.id ?? listStore.inboxList?.id ?? listStore.lists[0]?.id;
			}
		}
		if (!targetListId) return null;

		try {
			isAdding.value = true;
			const created = await taskStore.addTask({
				title: taskTitle,
				list_id: targetListId,
				due,
				priority: parsed.priority ?? null,
			});

			const tagsToAssign = new Set<string>();
			if (filterStore.selectedTag) tagsToAssign.add(filterStore.selectedTag);
			for (const tag of parsed.tags) tagsToAssign.add(tag);

			if (tagsToAssign.size > 0) {
				for (const tag of tagsToAssign) {
					try {
						const trimmed = tag.trim().replace(/^#/, "");
						if (!trimmed) continue;
						const existing = tagStore.tags.find(
							(t) => t.name.toLowerCase() === trimmed.toLowerCase() || t.id === trimmed,
						);
						const tagObj = existing ?? (await tagStore.createTag(trimmed));
						await assignTag(created.id, tagObj.id);
					} catch (tagErr) {
						console.error(`Failed to assign tag ${tag}:`, tagErr);
					}
				}
				await taskStore.fetchAllTasks();
				await tagStore.fetchTags();
			}

			if (options.clearOnSuccess !== false) {
				inputText.value = "";
			}

			if (options.onSuccess) {
				await options.onSuccess(created);
			}

			return created;
		} catch (err) {
			if (options.onError) {
				options.onError(err);
			} else {
				console.error("Failed to add task via smart add:", err);
			}
			return null;
		} finally {
			isAdding.value = false;
		}
	}

	return {
		inputRef,
		inputText,
		isAdding,
		activeSmartToken,
		smartSuggestions,
		selectedSmartIndex,
		isSmartMenuOpen,
		reset,
		updateSmartDropdown,
		selectSmartSuggestion,
		handleKeydown,
		appendSmartPrefix,
		submitTask,
		getPriorityFlagClass,
	};
}
