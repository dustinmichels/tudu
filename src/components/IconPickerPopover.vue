<script setup lang="ts">
import { X } from "lucide-vue-next";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { DEFAULT_LIST_ICON, LIST_ICONS } from "../utils/icons.ts";

const props = withDefaults(
	defineProps<{
		isOpen: boolean;
		selectedIcon?: string | null;
		targetRect?: DOMRect | null;
		title?: string;
	}>(),
	{
		selectedIcon: DEFAULT_LIST_ICON,
		targetRect: null,
		title: "Choose List Icon",
	},
);

const emit = defineEmits<{
	(e: "select", iconName: string): void;
	(e: "close"): void;
}>();

const popoverRef = ref<HTMLElement | null>(null);
const hoveredIconLabel = ref<string | null>(null);

const activeIconName = computed(() => {
	if (!props.selectedIcon) return DEFAULT_LIST_ICON;
	const match = LIST_ICONS.find((i) => i.name.toLowerCase() === props.selectedIcon?.toLowerCase());
	return match ? match.name : DEFAULT_LIST_ICON;
});

const popoverStyle = ref<Record<string, string>>({
	position: "fixed",
	top: "0px",
	left: "0px",
	zIndex: "9999",
});

function updatePosition() {
	if (!props.targetRect) return;

	const popoverWidth = 256;
	const popoverHeight = 220;
	const margin = 8;

	let top = props.targetRect.bottom + margin;
	let left = props.targetRect.left;

	// Clamp vertically if overflowing viewport bottom
	if (top + popoverHeight > window.innerHeight - margin) {
		top = Math.max(margin, props.targetRect.top - popoverHeight - margin);
	}

	// Clamp horizontally if overflowing viewport right/left
	if (left + popoverWidth > window.innerWidth - margin) {
		left = Math.max(margin, window.innerWidth - popoverWidth - margin);
	}
	if (left < margin) {
		left = margin;
	}

	popoverStyle.value = {
		position: "fixed",
		top: `${Math.round(top)}px`,
		left: `${Math.round(left)}px`,
		zIndex: "9999",
	};
}

function handlePointerDownOutside(e: PointerEvent) {
	if (!props.isOpen) return;
	const target = e.target as Node | null;
	if (popoverRef.value && !popoverRef.value.contains(target)) {
		emit("close");
	}
}

function handleKeyDown(e: KeyboardEvent) {
	if (e.key === "Escape" && props.isOpen) {
		emit("close");
	}
}

function selectIcon(iconName: string) {
	emit("select", iconName);
	emit("close");
}

watch(
	() => [props.isOpen, props.targetRect],
	([isOpen]) => {
		if (isOpen) {
			hoveredIconLabel.value = null;
			nextTick(() => {
				updatePosition();
			});
		}
	},
);

onMounted(() => {
	document.addEventListener("pointerdown", handlePointerDownOutside);
	document.addEventListener("keydown", handleKeyDown);
	window.addEventListener("resize", updatePosition);
	window.addEventListener("scroll", updatePosition, true);
});

onUnmounted(() => {
	document.removeEventListener("pointerdown", handlePointerDownOutside);
	document.removeEventListener("keydown", handleKeyDown);
	window.removeEventListener("resize", updatePosition);
	window.removeEventListener("scroll", updatePosition, true);
});
</script>

<template>
	<Teleport to="body">
		<div
			v-if="isOpen"
			ref="popoverRef"
			:style="popoverStyle"
			class="w-64 p-3 bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 select-none animate-in fade-in zoom-in-95 duration-100"
			@click.stop
		>
			<!-- Popover Header -->
			<div
				class="flex items-center justify-between pb-2 mb-2 border-b border-zinc-100 dark:border-zinc-800 text-xs font-semibold"
			>
				<div class="flex items-center gap-1.5 truncate">
					<span class="text-zinc-500 dark:text-zinc-400">{{ title }}</span>
					<span v-if="hoveredIconLabel" class="text-emerald-600 dark:text-emerald-400 font-medium">
						({{ hoveredIconLabel }})
					</span>
				</div>
				<button
					type="button"
					@click="emit('close')"
					class="p-0.5 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
					title="Close"
				>
					<X class="w-3.5 h-3.5" />
				</button>
			</div>

			<!-- 6x4 Icon Grid -->
			<div class="grid grid-cols-6 gap-1.5">
				<button
					v-for="item in LIST_ICONS"
					:key="item.name"
					type="button"
					@click="selectIcon(item.name)"
					@mouseenter="hoveredIconLabel = item.label"
					@mouseleave="hoveredIconLabel = null"
					class="w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer group"
					:class="[
						activeIconName === item.name
							? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 ring-2 ring-emerald-500'
							: 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100',
					]"
					:title="item.label"
				>
					<component
						:is="item.component"
						class="w-4 h-4 transition-transform group-hover:scale-110"
					/>
				</button>
			</div>
		</div>
	</Teleport>
</template>
