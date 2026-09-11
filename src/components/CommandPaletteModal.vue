<script setup lang="ts">
import {
	Calendar,
	CheckSquare,
	Command,
	Folder,
	Inbox,
	Keyboard,
	ListFilter,
	PanelLeft,
	PanelRight,
	Plus,
	RotateCcw,
	Search,
	Tag as TagIcon,
	Trash2,
	Upload,
} from "lucide-vue-next";
import { type Component, computed, nextTick, ref, watch } from "vue";
import { useFilterStore } from "../stores/filters.ts";
import { type DefaultView, useListStore } from "../stores/lists.ts";
import { useTagStore } from "../stores/tags.ts";
import { useTaskStore } from "../stores/tasks.ts";
import { useUIStore } from "../stores/ui.ts";

const filterStore = useFilterStore();
const listStore = useListStore();
const taskStore = useTaskStore();
const tagStore = useTagStore();
const uiStore = useUIStore();

const query = ref("");
const selectedIndex = ref(0);
const inputRef = ref<HTMLInputElement | null>(null);
const listContainerRef = ref<HTMLDivElement | null>(null);
interface CommandItem {
	id: string;
	title: string;
	category: string;
	shortcut?: string;
	icon: Component;
	action: () => void;
}

// When opening, reset state and focus input
watch(
	() => uiStore.isCommandPaletteOpen,
	async (isOpen) => {
		if (isOpen) {
			query.value = uiStore.commandPaletteInitialMode === "lists" ? "" : "";
			selectedIndex.value = 0;
			await nextTick();
			inputRef.value?.focus();
			inputRef.value?.select();
		}
	},
);

const isListMode = computed(() => {
	// If opened in lists mode (e.g. Cmd+P) and query doesn't start with ">",
	// or if query starts with "#" or "@"
	return uiStore.commandPaletteInitialMode === "lists";
});

// Build command palette items
const commands = computed<CommandItem[]>(() => {
	const items: CommandItem[] = [];

	if (isListMode.value) {
		// List / View picker items
		const smartViews: { id: DefaultView; name: string; icon: Component }[] = [
			{ id: "inbox", name: "Inbox", icon: Inbox },
			{ id: "all", name: "All Tasks", icon: CheckSquare },
			{ id: "today", name: "Today", icon: Calendar },
			{ id: "tomorrow", name: "Tomorrow", icon: Calendar },
			{ id: "this_week", name: "This Week", icon: Calendar },
			{ id: "trash", name: "Trash", icon: Trash2 },
		];

		for (const sv of smartViews) {
			items.push({
				id: `view-${sv.id}`,
				title: `Go to ${sv.name}`,
				category: "Views",
				icon: sv.icon,
				action: () => {
					listStore.setActiveView(sv.id);
					listStore.setActiveList(null);
					taskStore.setActiveTask(null);
				},
			});
		}

		for (const list of listStore.lists) {
			items.push({
				id: `list-${list.id}`,
				title: `Go to List: ${list.name}`,
				category: "Lists",
				icon: Folder,
				action: () => {
					listStore.setActiveView(null);
					listStore.setActiveList(list.id);
					taskStore.setActiveTask(null);
				},
			});
		}

		for (const tag of tagStore.tags) {
			items.push({
				id: `tag-${tag.id}`,
				title: `Filter by Tag: #${tag.name}`,
				category: "Tags",
				icon: TagIcon,
				action: () => {
					filterStore.setTagFilter(tag.name);
					listStore.setActiveView(null);
					listStore.setActiveList(null);
					taskStore.setActiveTask(null);
				},
			});
		}
		return items;
	}

	// General command actions (VS Code / Zed inspired)
	items.push(
		{
			id: "action-new-task",
			title: "Create New Task",
			category: "Tasks",
			shortcut: "t",
			icon: Plus,
			action: () => {
				const input = document.querySelector<HTMLInputElement>("input[data-quick-add-input]");
				input?.focus();
			},
		},
		{
			id: "action-toggle-complete",
			title: "Toggle Selected Task Completion",
			category: "Tasks",
			shortcut: "Enter",
			icon: CheckSquare,
			action: () => {
				if (taskStore.activeTaskId) {
					void taskStore.toggleTask(taskStore.activeTaskId);
				}
			},
		},
		{
			id: "action-delete-task",
			title: "Delete / Trash Selected Task",
			category: "Tasks",
			shortcut: "Backspace",
			icon: Trash2,
			action: () => {
				if (taskStore.activeTaskId) {
					void taskStore.deleteTask(taskStore.activeTaskId);
				}
			},
		},
		{
			id: "action-postpone-task",
			title: "Postpone Selected Task by 1 Day",
			category: "Tasks",
			shortcut: "p",
			icon: RotateCcw,
			action: () => {
				if (taskStore.activeTaskId) {
					void taskStore.postponeTask(taskStore.activeTaskId, 1);
				}
			},
		},
		{
			id: "action-priority-high",
			title: "Set Task Priority: High",
			category: "Tasks",
			shortcut: "1",
			icon: ListFilter,
			action: () => {
				if (taskStore.activeTaskId) {
					void taskStore.updateTask({
						id: taskStore.activeTaskId,
						priority: 1,
					});
				}
			},
		},
		{
			id: "action-priority-med",
			title: "Set Task Priority: Medium",
			category: "Tasks",
			shortcut: "2",
			icon: ListFilter,
			action: () => {
				if (taskStore.activeTaskId) {
					void taskStore.updateTask({
						id: taskStore.activeTaskId,
						priority: 2,
					});
				}
			},
		},
		{
			id: "action-priority-low",
			title: "Set Task Priority: Low",
			category: "Tasks",
			shortcut: "3",
			icon: ListFilter,
			action: () => {
				if (taskStore.activeTaskId) {
					void taskStore.updateTask({
						id: taskStore.activeTaskId,
						priority: 3,
					});
				}
			},
		},
		{
			id: "action-priority-none",
			title: "Clear Task Priority",
			category: "Tasks",
			shortcut: "4",
			icon: ListFilter,
			action: () => {
				if (taskStore.activeTaskId) {
					void taskStore.updateTask({
						id: taskStore.activeTaskId,
						priority: null,
					});
				}
			},
		},
		{
			id: "action-toggle-completed-tasks",
			title: taskStore.includeCompleted ? "Hide Completed Tasks" : "Show Completed Tasks",
			category: "View",
			shortcut: "Cmd+H",
			icon: CheckSquare,
			action: () => {
				const next = !taskStore.includeCompleted;
				taskStore.setIncludeCompleted(next);
			},
		},
		{
			id: "action-toggle-sidebar",
			title: "Toggle Primary Sidebar",
			category: "View",
			shortcut: "Cmd+B",
			icon: PanelLeft,
			action: () => {
				uiStore.toggleSidebar();
			},
		},
		{
			id: "action-toggle-detail",
			title: "Toggle Task Details Panel",
			category: "View",
			shortcut: "Cmd+J",
			icon: PanelRight,
			action: () => {
				uiStore.toggleDetail();
			},
		},
		{
			id: "action-focus-search",
			title: "Search Tasks",
			category: "Navigation",
			shortcut: "/",
			icon: Search,
			action: () => {
				const search = document.querySelector<HTMLInputElement>("input[data-global-search]");
				search?.focus();
				search?.select();
			},
		},
		{
			id: "action-open-list-picker",
			title: "Go to List or View...",
			category: "Navigation",
			shortcut: "Cmd+P",
			icon: Folder,
			action: () => {
				uiStore.openCommandPalette("lists");
			},
		},
		{
			id: "action-import-tasks",
			title: "Import Tasks (Remember The Milk / CSV / JSON)",
			category: "System",
			icon: Upload,
			action: () => {
				uiStore.toggleImport(true);
			},
		},
		{
			id: "action-shortcuts-help",
			title: "Show Keyboard Shortcuts",
			category: "Help",
			shortcut: "?",
			icon: Keyboard,
			action: () => {
				uiStore.toggleShortcuts(true);
			},
		},
	);

	// Also add quick navigation to each list and smart view
	for (const sv of [
		{ id: "inbox" as DefaultView, name: "Inbox", icon: Inbox },
		{ id: "all" as DefaultView, name: "All Tasks", icon: CheckSquare },
		{ id: "today" as DefaultView, name: "Today", icon: Calendar },
		{ id: "tomorrow" as DefaultView, name: "Tomorrow", icon: Calendar },
		{ id: "this_week" as DefaultView, name: "This Week", icon: Calendar },
		{ id: "trash" as DefaultView, name: "Trash", icon: Trash2 },
	]) {
		items.push({
			id: `goto-view-${sv.id}`,
			title: `Go to ${sv.name}`,
			category: "Go to View",
			icon: sv.icon,
			action: () => {
				listStore.setActiveView(sv.id);
				listStore.setActiveList(null);
				taskStore.setActiveTask(null);
			},
		});
	}

	for (const list of listStore.lists) {
		items.push({
			id: `goto-list-${list.id}`,
			title: `Go to List: ${list.name}`,
			category: "Go to List",
			icon: Folder,
			action: () => {
				listStore.setActiveView(null);
				listStore.setActiveList(list.id);
				taskStore.setActiveTask(null);
			},
		});
	}

	return items;
});

const filteredCommands = computed(() => {
	const q = query.value.trim().toLowerCase();
	if (!q) return commands.value;
	return commands.value.filter((item) => {
		return (
			item.title.toLowerCase().includes(q) ||
			item.category.toLowerCase().includes(q) ||
			(item.shortcut?.toLowerCase().includes(q) ?? false)
		);
	});
});
watch(filteredCommands, () => {
	selectedIndex.value = 0;
});

function closePalette() {
	uiStore.toggleCommandPalette(false);
}

function executeCommand(command: CommandItem) {
	closePalette();
	command.action();
}

function handleKeyDown(e: KeyboardEvent) {
	if (!uiStore.isCommandPaletteOpen) return;

	if (e.key === "Escape") {
		e.preventDefault();
		closePalette();
		return;
	}

	if (e.key === "ArrowDown") {
		e.preventDefault();
		if (filteredCommands.value.length === 0) return;
		selectedIndex.value = (selectedIndex.value + 1) % filteredCommands.value.length;
		scrollToSelected();
		return;
	}

	if (e.key === "ArrowUp") {
		e.preventDefault();
		if (filteredCommands.value.length === 0) return;
		selectedIndex.value =
			(selectedIndex.value - 1 + filteredCommands.value.length) % filteredCommands.value.length;
		scrollToSelected();
		return;
	}

	if (e.key === "Enter") {
		e.preventDefault();
		const current = filteredCommands.value[selectedIndex.value];
		if (current) {
			executeCommand(current);
		}
		return;
	}
}

function scrollToSelected() {
	nextTick(() => {
		const el = listContainerRef.value?.querySelector(`[data-item-index="${selectedIndex.value}"]`);
		el?.scrollIntoView({ block: "nearest" });
	});
}
</script>

<template>
	<div
		v-if="uiStore.isCommandPaletteOpen"
		class="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
		role="dialog"
		aria-modal="true"
		aria-label="Command Palette"
		data-command-palette
		@click.self="closePalette"
		@keydown="handleKeyDown"
	>
		<div
			class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[75vh]"
		>
			<!-- Search Input Header -->
			<div class="flex items-center px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 gap-3">
				<Command class="w-5 h-5 text-zinc-400 shrink-0" />
				<input
					ref="inputRef"
					v-model="query"
					type="text"
					:placeholder="isListMode ? 'Type a list or view name...' : 'Type a command or search...'"
					class="flex-1 bg-transparent border-0 outline-hidden text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:ring-0"
					data-command-palette-input
				/>
				<kbd
					class="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded"
				>
					ESC
				</kbd>
			</div>

			<!-- Results list -->
			<div
				ref="listContainerRef"
				class="overflow-y-auto p-2 divide-y divide-zinc-100 dark:divide-zinc-800/50 max-h-96"
				data-command-palette-list
			>
				<div
					v-if="filteredCommands.length === 0"
					class="px-4 py-8 text-center text-sm text-zinc-400"
				>
					No matching commands found
				</div>

				<div v-else class="space-y-0.5">
					<button
						v-for="(cmd, index) in filteredCommands"
						:key="cmd.id"
						:data-item-index="index"
						type="button"
						class="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer"
						:class="[
							index === selectedIndex
								? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
								: 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50',
						]"
						@click="executeCommand(cmd)"
						@mouseenter="selectedIndex = index"
					>
						<div class="flex items-center gap-2.5 min-w-0">
							<component :is="cmd.icon" class="w-4 h-4 text-zinc-400 shrink-0" />
							<span class="truncate font-medium">{{ cmd.title }}</span>
							<span
								class="text-[10px] text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800/60 px-1.5 py-0.5 rounded border border-zinc-200/50 dark:border-zinc-700/50"
							>
								{{ cmd.category }}
							</span>
						</div>

						<div v-if="cmd.shortcut" class="flex items-center gap-1 shrink-0 ml-3">
							<kbd
								class="px-1.5 py-0.5 font-mono text-[10px] rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400"
							>
								{{ cmd.shortcut }}
							</kbd>
						</div>
					</button>
				</div>
			</div>

			<!-- Footer Help -->
			<div
				class="px-4 py-2 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex items-center justify-between text-[11px] text-zinc-400"
			>
				<div class="flex items-center gap-3">
					<span><kbd class="font-mono">↑↓</kbd> to navigate</span>
					<span><kbd class="font-mono">↵</kbd> to select</span>
					<span><kbd class="font-mono">esc</kbd> to close</span>
				</div>
				<div v-if="!isListMode" class="hidden sm:block">
					<span>Press <kbd class="font-mono">⌘P</kbd> to jump directly to a list</span>
				</div>
			</div>
		</div>
	</div>
</template>
