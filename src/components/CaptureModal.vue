<script setup lang="ts">
import {
	AtSign,
	Calendar,
	CornerDownLeft,
	Flag,
	FolderInput,
	Tag as TagIcon,
	X,
	Zap,
} from "lucide-vue-next";
import { nextTick, ref, watch } from "vue";
import { useSmartAddInput } from "../composables/useSmartAddInput.ts";
import { useUIStore } from "../stores/ui.ts";
import { useTaskStore } from "../stores/tasks.ts";

const uiStore = useUIStore();
const taskStore = useTaskStore();

const modalCardRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
let previouslyFocusedElement: HTMLElement | null = null;

function close() {
	uiStore.toggleCapture(false);
}

const {
	inputText: title,
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
	submitTask: handleSubmit,
	getPriorityFlagClass,
} = useSmartAddInput({
	inputRef,
	onEscape: close,
	onSuccess: () => {
		close();
	},
});

watch(
	() => uiStore.isCaptureOpen,
	async (open) => {
		if (open) {
			previouslyFocusedElement = document.activeElement as HTMLElement | null;
			reset();
			await nextTick();
			inputRef.value?.focus();
		} else if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === "function") {
			previouslyFocusedElement.focus();
			previouslyFocusedElement = null;
		}
	},
);

function handleKeyDownTrap(e: KeyboardEvent) {
	if (e.key === "Escape") {
		e.preventDefault();
		if (isSmartMenuOpen.value) {
			isSmartMenuOpen.value = false;
		} else {
			close();
		}
		return;
	}

	if (e.key !== "Tab") return;

	if (isSmartMenuOpen.value && smartSuggestions.value.length > 0) {
		return;
	}

	const container = modalCardRef.value;
	if (!container) return;

	const focusable = Array.from(
		container.querySelectorAll<HTMLElement>(
			'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
		),
	).filter((el) => el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0);

	if (focusable.length === 0) {
		e.preventDefault();
		return;
	}

	const first = focusable[0];
	const last = focusable[focusable.length - 1];
	if (!first || !last) return;
	if (e.shiftKey) {
		if (document.activeElement === first || !container.contains(document.activeElement)) {
			last.focus();
			e.preventDefault();
		}
	} else {
		if (document.activeElement === last || !container.contains(document.activeElement)) {
			first.focus();
			e.preventDefault();
		}
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
				role="dialog"
				aria-modal="true"
				aria-labelledby="capture-modal-title"
				@click="handleBackdropClick"
				@keydown="handleKeyDownTrap"
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
						ref="modalCardRef"
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
							<h2
								id="capture-modal-title"
								class="text-lg font-bold text-zinc-800 dark:text-zinc-100 mb-0.5 tracking-tight"
							>
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
								aria-label="Close dialog"
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
									aria-label="Add task"
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
									<span v-else-if="activeSmartToken?.prefix === '@'">Contexts (@)</span>
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
											<AtSign
												v-if="item.type === 'context'"
												class="w-3.5 h-3.5 text-amber-500 shrink-0"
											/>
											<TagIcon
												v-else-if="item.type === 'tag'"
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
												:class="['w-3.5 h-3.5 shrink-0', getPriorityFlagClass(item.insertValue)]"
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
									@click="appendSmartPrefix('@')"
									class="font-mono hover:text-amber-600 dark:hover:text-amber-400 cursor-pointer"
								>
									<span class="font-bold">@</span>context
								</button>
								<span>·</span>
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
