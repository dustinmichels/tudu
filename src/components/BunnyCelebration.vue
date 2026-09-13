<script setup lang="ts">
import bunnyDanceGif from "../assets/bunny-dance.gif";
import { useUIStore } from "../stores/ui.ts";

const uiStore = useUIStore();
</script>

<template>
	<Transition
		enter-active-class="transition-all duration-300 ease-out"
		enter-from-class="opacity-0 translate-y-6 scale-75"
		enter-to-class="opacity-100 translate-y-0 scale-100"
		leave-active-class="transition-all duration-400 ease-in"
		leave-from-class="opacity-100 translate-y-0 scale-100"
		leave-to-class="opacity-0 translate-y-4 scale-90"
	>
		<div
			v-if="uiStore.isBunnyVisible"
			:key="uiStore.bunnyAnimationKey"
			class="fixed bottom-6 right-6 z-60 pointer-events-none select-none flex flex-col items-center"
			aria-hidden="true"
		>
			<img
				:src="bunnyDanceGif"
				alt="Celebration bunny"
				class="w-36 h-36 object-contain drop-shadow-xl filter pointer-events-auto cursor-pointer transition-transform hover:scale-105 active:scale-95"
				@click="uiStore.hideBunny()"
				title="Good job! (click to dismiss)"
			/>
		</div>
	</Transition>
</template>
