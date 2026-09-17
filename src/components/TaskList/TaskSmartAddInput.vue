<script setup lang="ts">
import {
	AtSign,
	Calendar,
	CornerDownLeft,
	Flag,
	FolderInput,
	Tag as TagIcon,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import { formatTagLabel } from "../../utils/smartAdd.ts";
import { useSmartAddInput } from "../../composables/useSmartAddInput.ts";
import { useFilterStore } from "../../stores/filters.ts";
import { useListStore } from "../../stores/lists.ts";
import { useTaskStore } from "../../stores/tasks.ts";

const listStore = useListStore();
const taskStore = useTaskStore();
const filterStore = useFilterStore();

const quickAddInputRef = ref<HTMLInputElement | null>(null);

const {
	inputText: newTaskTitle,
	isAdding,
	activeSmartToken,
	smartSuggestions,
	selectedSmartIndex,
	isSmartMenuOpen,
	updateSmartDropdown,
	selectSmartSuggestion,
	handleKeydown: handleQuickAddKeydown,
	appendSmartPrefix,
	submitTask: handleAddTask,
	getPriorityFlagClass,
} = useSmartAddInput({
	inputRef: quickAddInputRef,
	onSuccess: (created) => {
		taskStore.setActiveTask(created.id);
	},
});

const activeList = computed(() => listStore.activeList);

const viewTitle = computed(() => {
	if (filterStore.selectedTag) return formatTagLabel(filterStore.selectedTag);
	if (listStore.activeView === "inbox") return "Inbox";
	if (listStore.activeView === "all") return "All Tasks";
	if (listStore.activeView === "next_actions") return "Next actions";
	if (listStore.activeView === "waiting_on") return "Waiting on";
	if (listStore.activeView === "someday_maybe") return "Someday/Maybe";
	if (listStore.activeView === "today") return "Today";
	if (listStore.activeView === "tomorrow") return "Tomorrow";
	if (listStore.activeView === "this_week") return "Next Week";
	if (listStore.activeView === "overdue") return "Overdue";
	if (listStore.activeView === "trash") return "Trash";
	return null;
});

const quickAddPlaceholder = computed(() => {
	if (filterStore.selectedTag) {
		return `Add a task tagged ${formatTagLabel(filterStore.selectedTag)}...`;
	}
	if (viewTitle.value) return `Add a task to ${viewTitle.value}...`;
	return activeList.value ? `Add a task to ${activeList.value.name}...` : "Add a task...";
});

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
				aria-label="Add task"
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
				<span v-else-if="activeSmartToken?.prefix === '@'">Contexts (@)</span>
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
						<AtSign v-if="item.type === 'context'" class="w-3.5 h-3.5 text-amber-500 shrink-0" />
						<TagIcon v-else-if="item.type === 'tag'" class="w-3.5 h-3.5 text-purple-500 shrink-0" />
						<FolderInput
							v-else-if="item.type === 'list'"
							class="w-3.5 h-3.5 text-emerald-500 shrink-0"
						/>
						<Calendar v-else-if="item.type === 'due'" class="w-3.5 h-3.5 text-blue-500 shrink-0" />
						<Flag
							v-else-if="item.type === 'priority'"
							:class="['w-3.5 h-3.5 shrink-0', getPriorityFlagClass(item.insertValue)]"
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
				@click="appendSmartPrefix('@')"
				class="hover:text-amber-600 dark:hover:text-amber-400 font-mono flex items-center gap-0.5 cursor-pointer"
				title="Add context tag (@home, @calls, etc.)"
			>
				<span class="font-bold">@</span>context
			</button>
			<span>•</span>
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
