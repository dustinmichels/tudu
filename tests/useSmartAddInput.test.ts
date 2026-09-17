import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import type { Task } from "../src/models/index.ts";

let mockTasks: Task[] = [];
let assignedTags: Array<{ taskId: string; tagId: string }> = [];

mock.module("@tauri-apps/api/core", () => ({
	invoke: async (command: string, args?: Record<string, unknown>) => {
		if (command === "create_task") {
			const { listId, title, due, priority, parentId } = (args ?? {}) as {
				listId: string;
				title: string;
				due?: string | null;
				priority?: number | null;
				parentId?: string | null;
			};
			const task: Task = {
				id: `task-${mockTasks.length + 1}`,
				uid: null,
				parent_id: parentId ?? null,
				list_id: listId ?? "inbox",
				title: title ?? "Untitled",
				description: null,
				due: due ?? null,
				is_all_day: false,
				rrule: null,
				priority: (priority as 1 | 2 | 3) ?? null,
				location: null,
				url: null,
				completed: false,
				completed_at: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				deleted_at: null,
			};
			mockTasks.push(task);
			return task;
		}
		if (command === "assign_tag") {
			const { taskId, tagId } = (args ?? {}) as { taskId: string; tagId: string };
			assignedTags.push({ taskId, tagId });
			return null;
		}
		if (command === "create_tag") {
			return {
				id: `tag-${args?.name}`,
				name: args?.name,
				color: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			};
		}
		if (command === "get_tasks") return mockTasks;
		if (command === "get_lists") {
			return [
				{
					id: "inbox",
					name: "Inbox",
					color: null,
					position: 0,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
					deleted_at: null,
				},
				{
					id: "work",
					name: "Work",
					color: null,
					position: 1,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
					deleted_at: null,
				},
			];
		}
		if (command === "get_tags" || command === "get_tags_with_counts") {
			return [
				{
					id: "tag-home",
					name: "@home",
					color: "#22c55e",
					task_count: 0,
					deleted_at: null,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
				{
					id: "tag-work",
					name: "@work",
					color: "#3b82f6",
					task_count: 0,
					deleted_at: null,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
			];
		}
		return null;
	},
}));

import {
	getPriorityFlagClass,
	getTodayDateStr,
	getTomorrowDateStr,
	getYesterdayDateStr,
	useSmartAddInput,
} from "../src/composables/useSmartAddInput.ts";
import { useListStore } from "../src/stores/lists.ts";
import { useTagStore } from "../src/stores/tags.ts";

function createMockInput(initial = "") {
	const input = {
		value: initial,
		selectionStart: initial.length,
		selectionEnd: initial.length,
		focus: () => {},
		setSelectionRange(start: number, end: number) {
			input.selectionStart = start;
			input.selectionEnd = end;
		},
	};
	return input as unknown as HTMLInputElement;
}

function createMockKeyEvent(key: string): KeyboardEvent {
	return {
		key,
		preventDefault: () => {},
	} as unknown as KeyboardEvent;
}

describe("useSmartAddInput", () => {
	beforeEach(async () => {
		setActivePinia(createPinia());
		mockTasks = [];
		assignedTags = [];
		const listStore = useListStore();
		const tagStore = useTagStore();
		await listStore.fetchLists();
		await tagStore.fetchTags();
	});

	it("formats date strings correctly", () => {
		const today = getTodayDateStr();
		const tomorrow = getTomorrowDateStr();
		const yesterday = getYesterdayDateStr();

		expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(tomorrow).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(yesterday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(today).not.toBe(tomorrow);
		expect(today).not.toBe(yesterday);
	});

	it("returns correct priority flag classes", () => {
		expect(getPriorityFlagClass("1")).toBe("text-red-500");
		expect(getPriorityFlagClass("2")).toBe("text-amber-500");
		expect(getPriorityFlagClass("3")).toBe("text-blue-500");
		expect(getPriorityFlagClass("none")).toBe("text-zinc-400");
	});

	it("updates suggestions on smart token detection", () => {
		const fakeInput = createMockInput("Buy groceries #");
		const inputRef = ref(fakeInput);
		const { inputText, updateSmartDropdown, isSmartMenuOpen, smartSuggestions, activeSmartToken } =
			useSmartAddInput({ inputRef });

		inputText.value = "Buy groceries #";
		fakeInput.value = inputText.value;
		fakeInput.selectionStart = 15;

		updateSmartDropdown();
		expect(isSmartMenuOpen.value).toBe(true);
		expect(activeSmartToken.value?.prefix).toBe("#");
		expect(smartSuggestions.value.length).toBeGreaterThan(0);
	});

	it("handles keyboard navigation across suggestions", () => {
		const fakeInput = createMockInput("Call plumber ^");
		const inputRef = ref(fakeInput);
		const { inputText, updateSmartDropdown, handleKeydown, selectedSmartIndex, smartSuggestions } =
			useSmartAddInput({ inputRef });

		inputText.value = "Call plumber ^";
		fakeInput.value = inputText.value;
		fakeInput.selectionStart = 14;
		updateSmartDropdown();

		expect(selectedSmartIndex.value).toBe(0);

		// ArrowDown
		handleKeydown(createMockKeyEvent("ArrowDown"));
		expect(selectedSmartIndex.value).toBe(1);

		// ArrowUp
		handleKeydown(createMockKeyEvent("ArrowUp"));
		expect(selectedSmartIndex.value).toBe(0);

		// ArrowUp again wraps around
		handleKeydown(createMockKeyEvent("ArrowUp"));
		expect(selectedSmartIndex.value).toBe(smartSuggestions.value.length - 1);
	});

	it("selects suggestion and replaces token in input", () => {
		const fakeInput = createMockInput("Review PR !");
		const inputRef = ref(fakeInput);
		const {
			inputText,
			updateSmartDropdown,
			selectSmartSuggestion,
			isSmartMenuOpen,
			smartSuggestions,
		} = useSmartAddInput({ inputRef });

		inputText.value = "Review PR !";
		fakeInput.value = inputText.value;
		fakeInput.selectionStart = 11;
		updateSmartDropdown();

		const prioritySuggestion = smartSuggestions.value.find((s) => s.insertValue === "1");
		expect(prioritySuggestion).toBeDefined();
		selectSmartSuggestion(prioritySuggestion!);

		expect(inputText.value).toBe("Review PR !1 ");
		expect(isSmartMenuOpen.value).toBe(false);
	});

	it("creates task and assigns tags on submitTask", async () => {
		const fakeInput = createMockInput();
		const inputRef = ref(fakeInput);
		let successCalled = false;

		const { inputText, submitTask } = useSmartAddInput({
			inputRef,
			onSuccess: (task) => {
				successCalled = true;
				expect(task.title).toBe("Clean room");
			},
		});

		inputText.value = "Clean room #urgent #Work ^today !1";
		const created = await submitTask();

		expect(created).not.toBeNull();
		expect(created?.title).toBe("Clean room");
		expect(created?.priority).toBe(1);
		expect(created?.due).toBe(getTodayDateStr());
		expect(created?.list_id).toBe("work");
		expect(successCalled).toBe(true);
		expect(inputText.value).toBe(""); // cleared on success
	});

	it("opens dropdown with context suggestions when typing @", () => {
		const fakeInput = createMockInput("Fix sink @");
		const inputRef = ref(fakeInput);
		const { inputText, updateSmartDropdown, isSmartMenuOpen, activeSmartToken, smartSuggestions } =
			useSmartAddInput({ inputRef });

		inputText.value = "Fix sink @";
		fakeInput.value = inputText.value;
		fakeInput.selectionStart = 10;
		updateSmartDropdown();

		expect(isSmartMenuOpen.value).toBe(true);
		expect(activeSmartToken.value?.prefix).toBe("@");
		expect(smartSuggestions.value.length).toBeGreaterThan(0);
	});

	it("selects context suggestion and assigns @context tag on submit", async () => {
		const fakeInput = createMockInput("Call mechanic @cal");
		const inputRef = ref(fakeInput);
		const { inputText, updateSmartDropdown, selectSmartSuggestion, smartSuggestions, submitTask } =
			useSmartAddInput({ inputRef });

		inputText.value = "Call mechanic @cal";
		fakeInput.value = inputText.value;
		fakeInput.selectionStart = 18;
		updateSmartDropdown();

		const contextSuggestion = smartSuggestions.value.find((s) => s.label.includes("cal"));
		expect(contextSuggestion).toBeDefined();
		selectSmartSuggestion(contextSuggestion!);

		expect(inputText.value).toContain("Call mechanic @");

		const created = await submitTask();
		expect(created).not.toBeNull();
		expect(created?.title).toBe("Call mechanic");
		expect(assignedTags).toContainEqual({ taskId: created!.id, tagId: "tag-@cal" });
	});
});
