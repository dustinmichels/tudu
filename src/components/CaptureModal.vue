<script setup lang="ts">
import {
	Calendar,
	CornerDownLeft,
	Flag,
	FolderInput,
	Tag as TagIcon,
	X,
	Zap,
} from "lucide-vue-next";
import { nextTick, ref, watch } from "vue";
import { assignTag } from "../services/api.ts";
import { useFilterStore } from "../stores/filters.ts";
import { useListStore } from "../stores/lists.ts";
import { useTagStore } from "../stores/tags.ts";
import { useTaskStore } from "../stores/tasks.ts";
import { useUIStore } from "../stores/ui.ts";
import {
	type ActiveSmartToken,
	detectSmartToken,
	getDueSuggestions,
	getPrioritySuggestions,
	getTagAndListSuggestions,
	parseSmartAdd,
	type SmartSuggestion,
} from "../utils/smartAdd.ts";

const uiStore = useUIStore();
const listStore = useListStore();
const taskStore = useTaskStore();
const tagStore = useTagStore();
const filterStore = useFilterStore();

const inputRef = ref<HTMLInputElement | null>(null);
const title = ref("");
const isAdding = ref(false);

// Smart add state
const activeSmartToken = ref<ActiveSmartToken | null>(null);
const smartSuggestions = ref<SmartSuggestion[]>([]);
const selectedSmartIndex = ref(0);
const isSmartMenuOpen = ref(false);

function close() {
	uiStore.toggleCapture(false);
}

function reset() {
	title.value = "";
	isSmartMenuOpen.value = false;
	activeSmartToken.value = null;
	smartSuggestions.value = [];
	selectedSmartIndex.value = 0;
}

watch(
	() => uiStore.isCaptureOpen,
	async (open) => {
		if (open) {
			reset();
			await nextTick();
			inputRef.value?.focus();
		}
	},
);

function updateSmartDropdown() {
	const input = inputRef.value;
	if (!input) {
		isSmartMenuOpen.value = false;
		return;
	}
	const cursorPos = input.selectionStart ?? title.value.length;
	const token = detectSmartToken(title.value, cursorPos);
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
	if (!token || !inputRef.value) return;

	const current = title.value;
	const before = current.slice(0, token.startIndex);
	const after = current.slice(token.endIndex);
	const replacement = `${token.prefix}${suggestion.insertValue} `;
	title.value = before + replacement + after;

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
		} else {
			close();
		}
	}
}

function appendSmartPrefix(prefix: string) {
	const input = inputRef.value;
	const current = title.value;
	const needsSpace = current.length > 0 && !current.endsWith(" ");
	title.value = `${current}${needsSpace ? " " : ""}${prefix}`;
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

async function handleSubmit() {
	const rawInput = title.value.trim();
	if (!rawInput) return;

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
		targetListId = listStore.activeList?.id ?? listStore.inboxList?.id ?? listStore.lists[0]?.id;
	}
	if (!targetListId) return;

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
					await assignTag(created.id, tag);
				} catch (tagErr) {
					console.error(`Failed to assign tag ${tag}:`, tagErr);
				}
			}
			await taskStore.fetchAllTasks();
			await tagStore.fetchTags();
		}

		close();
	} catch (err) {
		console.error("Failed to add task from capture modal:", err);
	} finally {
		isAdding.value = false;
	}
}

function handleBackdropClick(e: MouseEvent) {
	if (e.target === e.currentTarget) close();
}
</script>

<template>
	<Teleport to="body">
		<Transition
			enter-active-class="transition-opacity duration-150 ease-out"
			enter-from-class="opacity-0"
			enter-to-class="opacity-100"
			leave-active-class="transition-opacity duration-100 ease-in"
			leave-from-class="opacity-100"
			leave-to-class="opacity-0"
		>
			<div
				v-if="uiStore.isCaptureOpen"
				class="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 bg-black/50 backdrop-blur-sm"
				@click="handleBackdropClick"
			>
				<Transition
					enter-active-class="transition-all duration-150 ease-out"
					enter-from-class="opacity-0 scale-95 -translate-y-2"
					enter-to-class="opacity-100 scale-100 translate-y-0"
					leave-active-class="transition-all duration-100 ease-in"
					leave-from-class="opacity-100 scale-100 translate-y-0"
					leave-to-class="opacity-0 scale-95 -translate-y-2"
				>
					<div
						v-if="uiStore.isCaptureOpen"
						class="w-full max-w-xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-visible relative"
					>
						<!-- Modal header -->
						<div
							class="flex flex-col items-center px-5 pt-6 pb-4 border-b border-zinc-100 dark:border-zinc-800"
						>
							<div
								class="w-12 h-12 mx-auto mb-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center shadow-sm"
							>
								<Zap class="w-6 h-6 text-emerald-500" />
							</div>
							<h2 class="text-lg font-bold text-zinc-800 dark:text-zinc-100 mb-0.5 tracking-tight">
								Quick Capture
							</h2>
							<p class="text-xs text-zinc-400 dark:text-zinc-500 mb-3">
								Add to inbox instantly. Organize later.
							</p>
							<!-- Stats pills -->
							<div class="flex items-center gap-2 flex-wrap justify-center">
								<span
									class="flex items-center gap-1.5 text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-3 py-1 rounded-full"
								>
									<Calendar class="w-3 h-3 text-emerald-500 shrink-0" />
									{{ taskStore.countToday }} due today
								</span>
								<span
									class="flex items-center gap-1.5 text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-3 py-1 rounded-full"
								>
									<span
										class="w-3 h-3 rounded-full border-2 border-blue-400 shrink-0 inline-block"
									/>
									{{ taskStore.countAll }} pending
								</span>
							</div>
							<!-- Close button -->
							<button
								type="button"
								@click="close"
								class="absolute top-3 right-3 p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
								title="Close (Esc)"
							>
								<X class="w-4 h-4" />
							</button>
						</div>

						<!-- Input area -->
						<div class="px-5 pt-4 pb-3 relative">
							<form @submit.prevent="handleSubmit" class="relative flex items-center">
								<input
									ref="inputRef"
									v-model="title"
									@input="updateSmartDropdown"
									@click="updateSmartDropdown"
									@keydown="handleKeydown"
									type="text"
									placeholder="What needs doing? e.g. Buy milk #shopping ^tomorrow !2"
									:disabled="isAdding"
									class="w-full pl-4 pr-12 py-3 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-emerald-400 dark:focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900/30 transition-all"
								/>
								<button
									type="submit"
									:disabled="isAdding || !title.trim()"
									class="absolute right-3 p-1 text-zinc-400 hover:text-emerald-600 disabled:opacity-30 disabled:hover:text-zinc-400 transition-colors cursor-pointer"
									title="Add task"
								>
									<CornerDownLeft class="w-4 h-4" />
								</button>
							</form>

							<!-- Smart Add Suggestions Dropdown -->
							<div
								v-if="isSmartMenuOpen && smartSuggestions.length > 0"
								class="absolute left-5 right-5 top-full mt-0.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-10 max-h-52 overflow-y-auto py-1"
							>
								<div
									class="px-2 py-1 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800"
								>
									<span v-if="activeSmartToken?.prefix === '#'">Tags & Lists (#)</span>
									<span v-else-if="activeSmartToken?.prefix === '^'">Due Dates (^)</span>
									<span v-else-if="activeSmartToken?.prefix === '!'">Priority (!)</span>
									<span class="text-[10px] font-normal normal-case text-zinc-400"
										>↑↓ navigate · Enter pick</span
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
											<TagIcon
												v-if="item.type === 'tag'"
												class="w-3.5 h-3.5 text-purple-500 shrink-0"
											/>
											<FolderInput
												v-else-if="item.type === 'list'"
												class="w-3.5 h-3.5 text-emerald-500 shrink-0"
											/>
											<Calendar
												v-else-if="item.type === 'due'"
												class="w-3.5 h-3.5 text-blue-500 shrink-0"
											/>
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
											<span v-if="item.description" class="text-[10px] text-zinc-400 truncate">{{
												item.description
											}}</span>
										</div>
										<span
											v-if="item.badge"
											class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 shrink-0 ml-2"
											>{{ item.badge }}</span
										>
									</button>
								</div>
							</div>
						</div>

						<!-- Footer: smart hints + routing note -->
						<div class="px-5 pb-4 space-y-2">
							<div
								class="flex items-center gap-2.5 text-[11px] text-zinc-400 dark:text-zinc-500 select-none"
							>
								<span class="text-[10px] uppercase font-semibold tracking-wider text-zinc-400/70"
									>Smart add:</span
								>
								<button
									type="button"
									@click="appendSmartPrefix('#')"
									class="font-mono hover:text-purple-600 dark:hover:text-purple-400 cursor-pointer"
								>
									<span class="font-bold">#</span>tag
								</button>
								<span>·</span>
								<button
									type="button"
									@click="appendSmartPrefix('^')"
									class="font-mono hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
								>
									<span class="font-bold">^</span>due
								</button>
								<span>·</span>
								<button
									type="button"
									@click="appendSmartPrefix('!')"
									class="font-mono hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
								>
									<span class="font-bold">!</span>priority
								</button>
							</div>
							<p class="text-[11px] text-zinc-400/60 dark:text-zinc-600">
								Lands in <span class="font-medium text-zinc-500 dark:text-zinc-400">Inbox</span> by
								default · use
								<span class="font-mono text-zinc-500 dark:text-zinc-400">#ListName</span> to route
								elsewhere
							</p>
						</div>
					</div>
				</Transition>
			</div>
		</Transition>
	</Teleport>
</template>
