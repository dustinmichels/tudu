import { defineStore } from "pinia";
import { computed, ref } from "vue";

export interface UndoAction {
	id?: string;
	description: string;
	undo: () => Promise<void> | void;
	timestamp?: number;
}

const HISTORY_LIMIT = 50;

export const useUndoStore = defineStore("undo", () => {
	const history = ref<UndoAction[]>([]);
	const isVisible = ref(false);
	const isUndoing = ref(false);
	let dismissTimer: number | undefined = undefined;

	const canUndo = computed(() => history.value.length > 0);
	const recentAction = computed<UndoAction | null>(
		() => history.value[history.value.length - 1] ?? null,
	);

	function clearTimer() {
		if (dismissTimer !== undefined) {
			globalThis.clearTimeout(dismissTimer);
			dismissTimer = undefined;
		}
	}

	function showButton(durationMs = 4000) {
		isVisible.value = true;
		clearTimer();
		// Tauri webview scheduler: browser contract returns a numeric handle.
		// `globalThis` (not `window`) keeps this runnable under the Bun test runtime.
		dismissTimer = (globalThis.setTimeout as Window["setTimeout"])(() => {
			isVisible.value = false;
			dismissTimer = undefined;
		}, durationMs);
	}

	function pauseTimer() {
		clearTimer();
	}

	function resumeTimer(durationMs = 2500) {
		if (isVisible.value) {
			showButton(durationMs);
		}
	}

	function dismiss() {
		clearTimer();
		isVisible.value = false;
	}

	function pushAction(action: UndoAction, options?: { durationMs?: number }) {
		// Inverse operations run through the same store actions that record history;
		// suppress their capture so undo never becomes self-feeding.
		if (isUndoing.value) return;

		history.value.push({
			...action,
			id: action.id ?? Math.random().toString(36).slice(2, 9),
			timestamp: action.timestamp ?? Date.now(),
		});
		if (history.value.length > HISTORY_LIMIT) {
			history.value.shift();
		}

		showButton(options?.durationMs);
	}

	async function undo(): Promise<boolean> {
		const action = history.value[history.value.length - 1];
		if (!action || isUndoing.value) {
			return false;
		}

		isUndoing.value = true;
		try {
			await action.undo();
		} catch (err) {
			// Keep the entry: a transient failure must not destroy history.
			console.error("Failed to undo action:", err);
			return false;
		} finally {
			isUndoing.value = false;
		}

		history.value.pop();
		// Keep the toast alive while more actions remain so the button can chain undos.
		if (history.value.length > 0) {
			showButton();
		} else {
			dismiss();
		}
		return true;
	}

	function clear() {
		history.value = [];
		dismiss();
	}

	return {
		history,
		isVisible,
		isUndoing,
		canUndo,
		recentAction,
		pushAction,
		showButton,
		pauseTimer,
		resumeTimer,
		dismiss,
		undo,
		clear,
	};
});
