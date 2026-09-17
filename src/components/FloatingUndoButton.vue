<script setup lang="ts">
import { Undo2, X } from "lucide-vue-next";
import { useUndoStore } from "../stores/undo.ts";

const undoStore = useUndoStore();

function handleUndo() {
	void undoStore.undo().catch((err) => {
		console.error("Failed to undo via button:", err);
	});
}
</script>

<template>
	<Transition
		enter-active-class="transition-all duration-200 ease-out"
		enter-from-class="opacity-0 translate-y-4 scale-95"
		enter-to-class="opacity-100 translate-y-0 scale-100"
		leave-active-class="transition-all duration-200 ease-in"
		leave-from-class="opacity-100 translate-y-0 scale-100"
		leave-to-class="opacity-0 translate-y-4 scale-95"
	>
		<div
			v-if="undoStore.isVisible && undoStore.recentAction"
			@mouseenter="undoStore.pauseTimer()"
			@mouseleave="undoStore.resumeTimer()"
			class="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2 rounded-full bg-zinc-900/95 dark:bg-zinc-800/95 text-white shadow-2xl border border-zinc-700/60 backdrop-blur-md select-none"
			role="status"
			aria-live="polite"
		>
			<span class="text-xs text-zinc-200 max-w-[200px] sm:max-w-[320px] truncate font-normal">
				{{ undoStore.recentAction.description }}
			</span>

			<div class="h-3.5 w-px bg-zinc-700 mx-0.5" />

			<button
				type="button"
				@click="handleUndo"
				class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-white bg-white/15 hover:bg-white/25 active:bg-white/30 rounded-full transition-colors cursor-pointer"
				title="Undo action (⌘Z)"
			>
				<Undo2 class="w-3.5 h-3.5" />
				<span>Undo</span>
				<kbd
					class="hidden sm:inline-block text-[10px] font-mono px-1 py-0.5 bg-black/30 rounded text-zinc-300"
					>⌘Z</kbd
				>
			</button>

			<button
				type="button"
				@click="undoStore.dismiss"
				class="text-zinc-400 hover:text-zinc-200 p-0.5 rounded-full transition-colors cursor-pointer ml-0.5"
				title="Dismiss"
				aria-label="Dismiss"
			>
				<X class="w-3.5 h-3.5" />
			</button>
		</div>
	</Transition>
</template>
