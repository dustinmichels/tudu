<script setup lang="ts">
import { Keyboard, X, ChevronDown, ChevronUp } from "lucide-vue-next";
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useUIStore } from "../stores/ui.ts";

const uiStore = useUIStore();
const showAll = ref(false);

function closeModal() {
	uiStore.toggleShortcuts(false);
}

function handleKeyDown(e: KeyboardEvent) {
	if (e.key === "Escape" && uiStore.isShortcutsOpen) {
		e.preventDefault();
		closeModal();
	}
}

onMounted(() => {
	window.addEventListener("keydown", handleKeyDown);
});

onUnmounted(() => {
	window.removeEventListener("keydown", handleKeyDown);
});

watch(
	() => uiStore.isShortcutsOpen,
	(open) => {
		if (!open) showAll.value = false;
	},
);

interface Shortcut {
	keys: string[];
	description: string;
}

interface ShortcutCategory {
	title: string;
	shortcuts: Shortcut[];
}

const essentialShortcuts: Shortcut[] = [
	{ keys: ["⌘", "N"], description: "Quick Capture (new task modal)" },
	{ keys: ["⌘", "Shift", "P"], description: "Open Command Palette" },
	{ keys: ["⌘", "L"], description: "Switch to List view" },
	{ keys: ["⌘", "C"], description: "Switch to Calendar view" },
	{ keys: ["⌘", "F"], description: "Switch to Freeform view" },
	{ keys: ["t"], description: "Focus inline add input (current list/view)" },
	{ keys: ["j", "or", "↓"], description: "Select next task" },
	{ keys: ["k", "or", "↑"], description: "Select previous task" },
	{ keys: ["c"], description: "Toggle task complete" },
	{ keys: ["Backspace", "or", "d"], description: "Delete selected task" },
	{ keys: ["⌘", "B"], description: "Toggle sidebar" },
	{ keys: ["Esc"], description: "Close dialogs / modals" },
];

const shortcutCategories: ShortcutCategory[] = [
	{
		title: "Command Palette & Quick Open",
		shortcuts: [
			{
				keys: ["⌘", "N"],
				description: "Open Quick Capture modal (add to Inbox)",
			},
			{
				keys: ["⌘", "Shift", "P"],
				description: "Open Command Palette / Control Panel",
			},
			{
				keys: ["⌘", "P"],
				description: "Quick open list or smart view",
			},
		],
	},
	{
		title: "View & Layout (Zed / VS Code)",
		shortcuts: [
			{
				keys: ["⌘", "L"],
				description: "Switch to List view",
			},
			{
				keys: ["⌘", "C"],
				description: "Switch to Calendar view",
			},
			{
				keys: ["⌘", "F"],
				description: "Switch to Freeform view",
			},
			{
				keys: ["⌘", "B"],
				description: "Toggle navigation sidebar",
			},
			{
				keys: ["⌘", "J"],
				description: "Toggle task detail panel",
			},
			{
				keys: ["⌘", "H"],
				description: "Toggle show / hide completed tasks",
			},
			{
				keys: ["⌘", "U"],
				description: "Toggle subtasks display (expand in list vs detail)",
			},
		],
	},
	{
		title: "Navigation",
		shortcuts: [
			{
				keys: ["Tab"],
				description: "Navigate to next list or smart view",
			},
			{
				keys: ["Shift", "Tab"],
				description: "Navigate to previous list or smart view",
			},
			{
				keys: ["j", "or", "↓"],
				description: "Select next task in list",
			},
			{
				keys: ["k", "or", "↑"],
				description: "Select previous task in list",
			},
			{
				keys: ["/"],
				description: "Focus search bar",
			},
			{
				keys: ["t"],
				description: "Focus inline add input (current list / view)",
			},
		],
	},
	{
		title: "Task Actions",
		shortcuts: [
			{
				keys: ["c"],
				description: "Mark selected task as completed / toggle complete",
			},
			{
				keys: ["p"],
				description: "Postpone selected task by 1 day",
			},
			{
				keys: ["1", "2", "3"],
				description: "Set priority (1: High, 2: Medium, 3: Low)",
			},
			{
				keys: ["4"],
				description: "Clear task priority",
			},
			{
				keys: ["Backspace", "or", "d"],
				description: "Delete / Trash selected task",
			},
		],
	},
	{
		title: "General",
		shortcuts: [
			{
				keys: ["?"],
				description: "Open keyboard shortcuts documentation",
			},
			{
				keys: ["Esc"],
				description: "Close dialogs / command palette / modals",
			},
		],
	},
];
</script>

<template>
	<div
		v-if="uiStore.isShortcutsOpen"
		class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
		role="dialog"
		aria-modal="true"
		aria-labelledby="shortcuts-modal-title"
		data-shortcuts-modal
	>
		<div
			class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
		>
			<!-- Header -->
			<div
				class="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800"
			>
				<div class="flex items-center gap-2.5">
					<Keyboard class="w-5 h-5 text-emerald-500" />
					<h2
						id="shortcuts-modal-title"
						class="text-base font-semibold text-zinc-900 dark:text-zinc-100"
					>
						Keyboard Shortcuts
					</h2>
				</div>
				<button
					type="button"
					@click="closeModal"
					class="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
					title="Close modal"
					data-close-shortcuts-modal
				>
					<X class="w-5 h-5" />
				</button>
			</div>

			<!-- Body -->
			<div class="p-5 overflow-y-auto">
				<!-- Essential shortcuts: shown when collapsed -->
				<div v-if="!showAll" class="space-y-2">
					<div
						v-for="shortcut in essentialShortcuts"
						:key="shortcut.description"
						class="flex items-center justify-between gap-4 py-1.5 px-2.5 rounded-md bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800/60 text-xs"
					>
						<span class="text-zinc-700 dark:text-zinc-300 font-medium">
							{{ shortcut.description }}
						</span>
						<div class="flex items-center gap-1 shrink-0">
							<template v-for="(key, index) in shortcut.keys" :key="index">
								<span v-if="key === 'or'" class="text-[10px] text-zinc-400 font-normal px-0.5">
									or
								</span>
								<kbd
									v-else
									class="px-2 py-0.5 text-[11px] font-mono font-semibold rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 shadow-2xs"
								>
									{{ key }}
								</kbd>
							</template>
						</div>
					</div>
				</div>

				<!-- All shortcuts: shown when expanded -->
				<div v-else class="space-y-6">
					<div v-for="category in shortcutCategories" :key="category.title" class="space-y-2.5">
						<h3
							class="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
						>
							{{ category.title }}
						</h3>
						<div class="space-y-2">
							<div
								v-for="shortcut in category.shortcuts"
								:key="shortcut.description"
								class="flex items-center justify-between gap-4 py-1.5 px-2.5 rounded-md bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800/60 text-xs"
							>
								<span class="text-zinc-700 dark:text-zinc-300 font-medium">
									{{ shortcut.description }}
								</span>
								<div class="flex items-center gap-1 shrink-0">
									<template v-for="(key, index) in shortcut.keys" :key="index">
										<span v-if="key === 'or'" class="text-[10px] text-zinc-400 font-normal px-0.5">
											or
										</span>
										<kbd
											v-else
											class="px-2 py-0.5 text-[11px] font-mono font-semibold rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 shadow-2xs"
										>
											{{ key }}
										</kbd>
									</template>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Toggle button -->
				<button
					type="button"
					@click="showAll = !showAll"
					class="mt-4 w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors cursor-pointer rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
				>
					<template v-if="showAll">
						<ChevronUp class="w-3.5 h-3.5" />
						Show less
					</template>
					<template v-else>
						<ChevronDown class="w-3.5 h-3.5" />
						Show all shortcuts
					</template>
				</button>
			</div>

			<!-- Footer -->
			<div
				class="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400"
			>
				<span
					>Press
					<kbd
						class="px-1.5 py-0.5 font-mono text-[10px] rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700"
						>?</kbd
					>
					anytime to open</span
				>
				<button
					type="button"
					@click="closeModal"
					class="px-3.5 py-1.5 text-xs font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
				>
					Close
				</button>
			</div>
		</div>
	</div>
</template>
