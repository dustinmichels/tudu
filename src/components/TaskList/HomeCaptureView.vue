<script setup lang="ts">
import { Zap } from "lucide-vue-next";
import { useUIStore } from "../../stores/ui.ts";

const uiStore = useUIStore();
</script>

<template>
	<div class="h-full flex flex-col items-center justify-center px-6 py-10 text-center">
		<div
			class="w-12 h-12 mx-auto mb-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center"
		>
			<Zap class="w-6 h-6 text-zinc-400 dark:text-zinc-500" />
		</div>
		<p class="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">No list selected</p>
		<p class="text-xs text-zinc-400 dark:text-zinc-500 mb-4">
			Choose a list or view from the sidebar
		</p>
		<button
			type="button"
			@click="uiStore.toggleCapture(true)"
			class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors cursor-pointer shadow-sm"
		>
			<Zap class="w-3.5 h-3.5" />
			Quick Add
			<kbd class="ml-1 text-[10px] opacity-75 font-mono">⌘N</kbd>
		</button>
	</div>
</template>
