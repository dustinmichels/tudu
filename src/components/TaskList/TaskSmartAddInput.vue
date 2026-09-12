<script setup lang="ts">
import { Calendar, CornerDownLeft, Flag, FolderInput, Tag as TagIcon } from "lucide-vue-next";
import { computed, nextTick, ref } from "vue";
import { assignTag } from "../../services/api.ts";
import { useFilterStore } from "../../stores/filters.ts";
import { useListStore } from "../../stores/lists.ts";
import { useTagStore } from "../../stores/tags.ts";
import { useTaskStore } from "../../stores/tasks.ts";
import {
	type ActiveSmartToken,
	detectSmartToken,
	getDueSuggestions,
	getPrioritySuggestions,
	getTagAndListSuggestions,
	parseSmartAdd,
	type SmartSuggestion,
} from "../../utils/smartAdd.ts";

const listStore = useListStore();
const taskStore = useTaskStore();
const filterStore = useFilterStore();
const tagStore = useTagStore();

const newTaskTitle = ref("");
const quickAddInputRef = ref<HTMLInputElement | null>(null);
const isAdding = ref(false);

const activeSmartToken = ref<ActiveSmartToken | null>(null);
const smartSuggestions = ref<SmartSuggestion[]>([]);
const selectedSmartIndex = ref(0);
const isSmartMenuOpen = ref(false);

const activeList = computed(() => listStore.activeList);

const viewTitle = computed(() => {
	if (filterStore.selectedTag) return `#${filterStore.selectedTag}`;
	if (listStore.activeView === "inbox") return "Inbox";
	if (listStore.activeView === "all") return "All Tasks";
	if (listStore.activeView === "today") return "Today";
	if (listStore.activeView === "tomorrow") return "Tomorrow";
	if (listStore.activeView === "this_week") return "This Week";
	if (listStore.activeView === "overdue") return "Overdue";
	if (listStore.activeView === "trash") return "Trash";
	return null;
});

const quickAddPlaceholder = computed(() => {
	if (filterStore.selectedTag) return `Add a task tagged #${filterStore.selectedTag}...`;
	if (viewTitle.value) return `Add a task to ${viewTitle.value}...`;
	return activeList.value ? `Add a task to ${activeList.value.name}...` : "Add a task...";
});

function updateSmartDropdown() {
	const input = quickAddInputRef.value;
	if (!input) {
		isSmartMenuOpen.value = false;
		return;
	}
	const cursorPos = input.selectionStart ?? newTaskTitle.value.length;
	const token = detectSmartToken(newTaskTitle.value, cursorPos);
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
	if (!token || !quickAddInputRef.value) return;

	const currentText = newTaskTitle.value;
	const before = currentText.slice(0, token.startIndex);
	const after = currentText.slice(token.endIndex);

	const replacement = `${token.prefix}${suggestion.insertValue} `;
	newTaskTitle.value = before + replacement + after;

	isSmartMenuOpen.value = false;
	activeSmartToken.value = null;
	smartSuggestions.value = [];

	nextTick(() => {
		const input = quickAddInputRef.value;
		if (!input) return;
		input.focus();
		const newCursor = before.length + replacement.length;
		input.setSelectionRange(newCursor, newCursor);
	});
}

function handleQuickAddKeydown(e: KeyboardEvent) {
	if (!isSmartMenuOpen.value || smartSuggestions.value.length === 0) {
		return;
	}

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

	if (e.key === "Escape") {
		e.preventDefault();
		isSmartMenuOpen.value = false;
	}
}

function appendSmartPrefix(prefix: string) {
	const input = quickAddInputRef.value;
	const current = newTaskTitle.value;
	const needsSpace = current.length > 0 && !current.endsWith(" ");
	newTaskTitle.value = `${current}${needsSpace ? " " : ""}${prefix}`;
	nextTick(() => {
		if (!input) return;
		input.focus();
		updateSmartDropdown();
	});
}

function getTodayDateStr(): string {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function getTomorrowDateStr(): string {
	const d = new Date();
	d.setDate(d.getDate() + 1);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function getYesterdayDateStr(): string {
	const d = new Date();
	d.setDate(d.getDate() - 1);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

async function handleAddTask() {
	const rawInput = newTaskTitle.value.trim();
	if (!rawInput) return;

	isSmartMenuOpen.value = false;

	const knownListNames = listStore.lists.map((l) => l.name);
	const parsed = parseSmartAdd(rawInput, knownListNames);
	const title = parsed.title || rawInput;

	let due: string | null = parsed.due ?? null;
	if (!due) {
		if (listStore.activeView === "today") {
			due = getTodayDateStr();
		} else if (listStore.activeView === "tomorrow") {
			due = getTomorrowDateStr();
		} else if (listStore.activeView === "this_week") {
			due = getTodayDateStr();
		} else if (listStore.activeView === "overdue") {
			due = getYesterdayDateStr();
		}
	}

	let targetListId: string | undefined;
	if (parsed.listName) {
		const matchedList = listStore.lists.find(
			(l) => l.name.toLowerCase() === parsed.listName?.toLowerCase(),
		);
		if (matchedList) {
			targetListId = matchedList.id;
		}
	}
	if (!targetListId) {
		targetListId = activeList.value?.id ?? listStore.inboxList?.id ?? listStore.lists[0]?.id;
	}
	if (!targetListId) return;

	try {
		isAdding.value = true;
		const created = await taskStore.addTask({
			title,
			list_id: targetListId,
			due,
			priority: parsed.priority ?? null,
		});

		const tagsToAssign = new Set<string>();
		if (filterStore.selectedTag) {
			tagsToAssign.add(filterStore.selectedTag);
		}
		for (const tag of parsed.tags) {
			tagsToAssign.add(tag);
		}

		if (tagsToAssign.size > 0) {
			for (const tag of tagsToAssign) {
				try {
					await assignTag(created.id, tag);
				} catch (tagErr) {
					console.error(`Failed to assign tag ${tag} to created task:`, tagErr);
				}
			}
			(created as { tags?: unknown }).tags = Array.from(tagsToAssign);
			await taskStore.fetchAllTasks();
			await tagStore.fetchTags();
		}

		newTaskTitle.value = "";
		taskStore.setActiveTask(created.id);
	} catch (err) {
		console.error("Failed to add task:", err);
	} finally {
		isAdding.value = false;
	}
}

function focus() {
	quickAddInputRef.value?.focus();
}

function select() {
	quickAddInputRef.value?.select();
}

defineExpose({
	focus,
	select,
});
</script>

<template>
	<div
		class="p-3 border-b border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/50 relative"
	>
		<form @submit.prevent="handleAddTask" class="relative flex items-center">
			<input
				ref="quickAddInputRef"
				v-model="newTaskTitle"
				@input="updateSmartDropdown"
				@click="updateSmartDropdown"
				@keydown="handleQuickAddKeydown"
				type="text"
				data-quick-add
				data-quick-add-input
				:placeholder="quickAddPlaceholder"
				:disabled="isAdding"
				class="w-full pl-3 pr-10 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 shadow-2xs"
			/>
			<button
				type="submit"
				:disabled="isAdding || !newTaskTitle.trim()"
				class="absolute right-2 p-1 text-zinc-400 hover:text-emerald-600 disabled:opacity-30 disabled:hover:text-zinc-400 transition-colors cursor-pointer"
				title="Add task"
			>
				<CornerDownLeft class="w-4 h-4" />
			</button>
		</form>

		<!-- Smart Add Suggestions Dropdown -->
		<div
			v-if="isSmartMenuOpen && smartSuggestions.length > 0"
			class="absolute left-3 right-3 top-full mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-40 max-h-60 overflow-y-auto py-1 animate-in fade-in zoom-in-95 duration-100"
		>
			<div
				class="px-2 py-1 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800"
			>
				<span v-if="activeSmartToken?.prefix === '#'">Tags & Lists (#)</span>
				<span v-else-if="activeSmartToken?.prefix === '^'">Due Dates (^)</span>
				<span v-else-if="activeSmartToken?.prefix === '!'">Priority (!)</span>
				<span class="text-[10px] font-normal normal-case text-zinc-400"
					>↑↓ to navigate, Enter or Tab to pick</span
				>
			</div>
			<div class="p-1 space-y-0.5">
				<button
					v-for="(item, idx) in smartSuggestions"
					:key="item.label + idx"
					type="button"
					@mousedown.prevent="selectSmartSuggestion(item)"
					:class="[
						'w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs text-left cursor-pointer transition-colors',
						idx === selectedSmartIndex
							? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 font-medium'
							: 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300',
					]"
				>
					<div class="flex items-center gap-2 min-w-0">
						<TagIcon v-if="item.type === 'tag'" class="w-3.5 h-3.5 text-purple-500 shrink-0" />
						<FolderInput
							v-else-if="item.type === 'list'"
							class="w-3.5 h-3.5 text-emerald-500 shrink-0"
						/>
						<Calendar v-else-if="item.type === 'due'" class="w-3.5 h-3.5 text-blue-500 shrink-0" />
						<Flag
							v-else-if="item.type === 'priority'"
							:class="[
								'w-3.5 h-3.5 shrink-0',
								item.insertValue === '1'
									? 'text-red-500'
									: item.insertValue === '2'
										? 'text-amber-500'
										: item.insertValue === '3'
											? 'text-blue-500'
											: 'text-zinc-400',
							]"
						/>
						<span class="truncate">{{ item.label }}</span>
						<span v-if="item.description" class="text-[10px] text-zinc-400 truncate">
							{{ item.description }}
						</span>
					</div>
					<span
						v-if="item.badge"
						class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 shrink-0 ml-2"
					>
						{{ item.badge }}
					</span>
				</button>
			</div>
		</div>

		<!-- Quick Shortcut Hints Toolbar below input -->
		<div
			class="flex items-center gap-2 mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500 select-none"
		>
			<span class="text-[10px] uppercase font-semibold tracking-wider text-zinc-400/80"
				>Shortcuts:</span
			>
			<button
				type="button"
				@click="appendSmartPrefix('#')"
				class="hover:text-purple-600 dark:hover:text-purple-400 font-mono flex items-center gap-0.5 cursor-pointer"
				title="Add tag or list"
			>
				<span class="font-bold">#</span>tag
			</button>
			<span>•</span>
			<button
				type="button"
				@click="appendSmartPrefix('^')"
				class="hover:text-blue-600 dark:hover:text-blue-400 font-mono flex items-center gap-0.5 cursor-pointer"
				title="Add due date"
			>
				<span class="font-bold">^</span>due
			</button>
			<span>•</span>
			<button
				type="button"
				@click="appendSmartPrefix('!')"
				class="hover:text-red-600 dark:hover:text-red-400 font-mono flex items-center gap-0.5 cursor-pointer"
				title="Set priority (1, 2, 3)"
			>
				<span class="font-bold">!</span>priority
			</button>
		</div>
	</div>
</template>
