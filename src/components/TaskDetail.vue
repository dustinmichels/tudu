<script setup lang="ts">
import {
	Calendar,
	Check,
	CheckCircle2,
	ChevronRight,
	Circle,
	ExternalLink,
	FileText,
	Flag,
	Folder,
	MapPin,
	Pencil,
	Plus,
	Repeat,
	Tag as TagIcon,
	Trash2,
	User,
	X,
} from "lucide-vue-next";
import { computed, nextTick, ref, watch } from "vue";
import {
	type Note,
	PRIORITY,
	type Priority,
	type Tag,
	type Task,
	type TaskDetail,
} from "../models/index.ts";
import {
	addNote as apiAddNote,
	assignTag as apiAssignTag,
	createTag as apiCreateTag,
	deleteNote as apiDeleteNote,
	getTaskDetail as apiGetTaskDetail,
	removeTag as apiRemoveTag,
	updateNote as apiUpdateNote,
} from "../services/api.ts";
import { useListStore } from "../stores/lists.ts";
import { useTagStore } from "../stores/tags.ts";
import { useTaskStore } from "../stores/tasks.ts";
import { useUIStore } from "../stores/ui.ts";

const listStore = useListStore();
const taskStore = useTaskStore();
const tagStore = useTagStore();
const uiStore = useUIStore();
// Inspector state driven directly by selected task id and detail
const selectedTaskId = ref<string | null>(null);
const detailData = ref<TaskDetail | null>(null);
const isLoadingDetail = ref(false);

// Subtask navigation stack: stores previously viewed tasks for breadcrumb/back navigation
const parentStack = ref<Task[]>([]);

// Editable Title state
const isEditingTitle = ref(false);
const editingTitleValue = ref("");
const titleInputRef = ref<HTMLInputElement | null>(null);

// Recurrence Custom input state & options
const recurrenceOptions = [
	{ label: "Never", value: "" },
	{ label: "Daily", value: "RRULE:FREQ=DAILY" },
	{ label: "Weekly", value: "RRULE:FREQ=WEEKLY" },
	{ label: "Monthly", value: "RRULE:FREQ=MONTHLY" },
	{ label: "Yearly", value: "RRULE:FREQ=YEARLY" },
	{ label: "Custom...", value: "__CUSTOM__" },
];
const isCustomRecurrence = ref(false);
const customRruleInput = ref("");

// Tags UI state
const isAddingTag = ref(false);
const newTagName = ref("");
const tagInputRef = ref<HTMLInputElement | null>(null);

// Subtasks UI state
const subtaskTab = ref<"incomplete" | "completed">("incomplete");
const newSubtaskTitle = ref("");
const isAddingSubtask = ref(false);

// Notes UI state
const newNoteTitle = ref("");
const newNoteContent = ref("");
const isAddingNote = ref(false);
const editingNoteId = ref<string | null>(null);
const editingNoteTitle = ref("");
const editingNoteContent = ref("");
const editingNoteMode = ref<"edit" | "preview">("edit");

// Unified task model: strictly detailData if available, fallback to activeTask
const task = computed<Task | null>(() => detailData.value ?? taskStore.activeTask ?? null);

let currentFetchToken = 0;

async function fetchDetail(taskId: string) {
	const token = ++currentFetchToken;
	isLoadingDetail.value = true;
	try {
		const detail = await apiGetTaskDetail(taskId);
		// Discard stale responses if another task was selected in flight
		if (token !== currentFetchToken || selectedTaskId.value !== taskId) {
			return;
		}
		detailData.value = detail;
		if (detail) {
			const rule = detail.rrule || "";
			const isStandard = recurrenceOptions.some((opt) => opt.value === rule);
			if (rule && !isStandard) {
				isCustomRecurrence.value = true;
				customRruleInput.value = rule;
			} else {
				isCustomRecurrence.value = false;
				customRruleInput.value = "";
			}
		}
	} catch (err) {
		if (token === currentFetchToken) {
			console.error("Failed to fetch task detail:", err);
			detailData.value = null;
		}
	} finally {
		if (token === currentFetchToken) {
			isLoadingDetail.value = false;
		}
	}
}

// Synchronize selectedTaskId whenever the outer taskStore.activeTaskId changes
watch(
	() => taskStore.activeTaskId,
	(newId) => {
		if (newId !== selectedTaskId.value) {
			selectedTaskId.value = newId;
			// Reset back-navigation stack when top-level selection changes
			parentStack.value = [];
		}
	},
	{ immediate: true },
);
// Synchronize detailData fields whenever the underlying store task is optimistically updated
watch(
	() => taskStore.activeTask,
	(updatedStoreTask) => {
		if (updatedStoreTask && detailData.value && updatedStoreTask.id === detailData.value.id) {
			detailData.value.title = updatedStoreTask.title;
			detailData.value.completed = updatedStoreTask.completed;
			detailData.value.completed_at = updatedStoreTask.completed_at;
			detailData.value.due = updatedStoreTask.due;
			detailData.value.priority = updatedStoreTask.priority;
			detailData.value.list_id = updatedStoreTask.list_id;
			detailData.value.location = updatedStoreTask.location;
			detailData.value.url = updatedStoreTask.url;
			detailData.value.rrule = updatedStoreTask.rrule;
		}
	},
	{ deep: true },
);

// Load task detail whenever selectedTaskId changes
watch(
	() => selectedTaskId.value,
	async (newId) => {
		isEditingTitle.value = false;
		isAddingTag.value = false;
		isAddingNote.value = false;
		editingNoteId.value = null;
		newSubtaskTitle.value = "";
		isCustomRecurrence.value = false;
		customRruleInput.value = "";
		// Immediately clear old task's detail data so stale state is never presented
		detailData.value = null;
		if (!newId) {
			return;
		}
		await fetchDetail(newId);
	},
	{ immediate: true },
);
// ---------------------------------------------------------------------------
// Header & Close
// ---------------------------------------------------------------------------

function handleClose() {
	selectedTaskId.value = null;
	parentStack.value = [];
	taskStore.setActiveTask(null);
	uiStore.toggleDetail(false);
}

function handleGoBack() {
	if (parentStack.value.length > 0) {
		const prev = parentStack.value.pop();
		if (prev) {
			selectedTaskId.value = prev.id;
			taskStore.setActiveTask(prev.id);
		}
	}
}

// ---------------------------------------------------------------------------
// Editable Task Title
// ---------------------------------------------------------------------------

function startEditingTitle() {
	if (!task.value) return;
	editingTitleValue.value = task.value.title;
	isEditingTitle.value = true;
	nextTick(() => {
		titleInputRef.value?.focus();
		titleInputRef.value?.select();
	});
}

async function saveTitle() {
	if (!task.value || !isEditingTitle.value) return;
	const trimmed = editingTitleValue.value.trim();
	if (!trimmed) {
		isEditingTitle.value = false;
		return;
	}
	if (trimmed === task.value.title) {
		isEditingTitle.value = false;
		return;
	}

	try {
		await taskStore.updateTask({
			id: task.value.id,
			title: trimmed,
		});
		if (detailData.value) {
			detailData.value.title = trimmed;
		}
	} catch (err) {
		console.error("Failed to update task title:", err);
	} finally {
		isEditingTitle.value = false;
	}
}

function cancelEditingTitle() {
	isEditingTitle.value = false;
}

// ---------------------------------------------------------------------------
// Complete / Delete Task
// ---------------------------------------------------------------------------

async function handleToggleComplete() {
	if (!task.value) return;
	try {
		const targetCompleted = !task.value.completed;
		const updated = await taskStore.toggleTask(task.value.id, targetCompleted);
		if (detailData.value) {
			detailData.value.completed = updated.completed;
		}
	} catch (err) {
		console.error("Failed to toggle task:", err);
	}
}

async function handleDelete() {
	if (!task.value) return;
	const confirmDelete = window.confirm("Are you sure you want to delete this task?");
	if (!confirmDelete) return;

	try {
		const id = task.value.id;
		if (parentStack.value.length > 0) {
			const prev = parentStack.value.pop();
			await taskStore.deleteTask(id);
			if (prev) {
				selectedTaskId.value = prev.id;
				taskStore.setActiveTask(prev.id);
			} else {
				handleClose();
			}
		} else {
			handleClose();
			await taskStore.deleteTask(id);
		}
	} catch (err) {
		console.error("Failed to delete task:", err);
	}
}

// ---------------------------------------------------------------------------
// Metadata Property Handlers
// ---------------------------------------------------------------------------

// Due Date
const formattedDueDate = computed(() => {
	if (!task.value?.due) return "";
	return task.value.due.slice(0, 10);
});

async function setDueDate(isoDateStr: string | null) {
	if (!task.value) return;
	try {
		const updated = await taskStore.updateTask({
			id: task.value.id,
			due: isoDateStr,
		});
		if (detailData.value) {
			detailData.value.due = updated.due;
		}
	} catch (err) {
		console.error("Failed to update due date:", err);
	}
}

function applyDuePreset(preset: "today" | "tomorrow" | "next_week" | "never") {
	if (preset === "never") {
		setDueDate(null);
		return;
	}
	const d = new Date();
	if (preset === "tomorrow") {
		d.setDate(d.getDate() + 1);
	} else if (preset === "next_week") {
		d.setDate(d.getDate() + 7);
	}
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	setDueDate(`${year}-${month}-${day}`);
}
async function handlePostpone(days: number) {
	if (!task.value) return;
	try {
		const updated = await taskStore.postponeTask(task.value.id, days);
		if (updated && detailData.value) {
			detailData.value.due = updated.due;
		}
	} catch (err) {
		console.error("Failed to postpone task:", err);
	}
}

const selectedRecurrenceValue = computed(() => {
	if (isCustomRecurrence.value) return "__CUSTOM__";
	const rule = task.value?.rrule || "";
	const match = recurrenceOptions.find((opt) => opt.value !== "__CUSTOM__" && opt.value === rule);
	return match ? match.value : rule ? "__CUSTOM__" : "";
});

async function handleRecurrenceChange(e: Event) {
	if (!task.value) return;
	const val = (e.target as HTMLSelectElement).value;
	if (val === "__CUSTOM__") {
		isCustomRecurrence.value = true;
		customRruleInput.value = task.value.rrule || "RRULE:FREQ=";
		return;
	}

	isCustomRecurrence.value = false;
	try {
		const updated = await taskStore.updateTask({
			id: task.value.id,
			rrule: val || null,
			repeats: val || null,
		});
		if (detailData.value) {
			detailData.value.rrule = updated.rrule;
		}
	} catch (err) {
		console.error("Failed to update recurrence:", err);
	}
}

async function saveCustomRrule() {
	if (!task.value) return;
	const trimmed = customRruleInput.value.trim();
	try {
		const updated = await taskStore.updateTask({
			id: task.value.id,
			rrule: trimmed || null,
			repeats: trimmed || null,
		});
		if (detailData.value) {
			detailData.value.rrule = updated.rrule;
		}
	} catch (err) {
		console.error("Failed to save custom RRULE:", err);
	}
}

// List
async function handleListChange(e: Event) {
	if (!task.value) return;
	const val = (e.target as HTMLSelectElement).value;
	if (!val || val === task.value.list_id) return;
	try {
		const updated = await taskStore.updateTask({
			id: task.value.id,
			list_id: val,
		});
		if (detailData.value) {
			detailData.value.list_id = updated.list_id;
		}
	} catch (err) {
		console.error("Failed to update list:", err);
	}
}

// Priority
async function handlePriorityChange(p: Priority | null) {
	if (!task.value) return;
	try {
		const updated = await taskStore.updateTask({
			id: task.value.id,
			priority: p,
		});
		if (detailData.value) {
			detailData.value.priority = updated.priority;
		}
	} catch (err) {
		console.error("Failed to update priority:", err);
	}
}

// Location
function handleLocationInput(e: Event) {
	if (!task.value) return;
	const val = (e.target as HTMLInputElement).value.trim();
	const nextVal = val || null;
	if (nextVal === task.value.location) return;
	if (detailData.value) {
		detailData.value.location = nextVal;
	}
	taskStore
		.updateTask(
			{
				id: task.value.id,
				location: nextVal,
			},
			{ debounceMs: 400 },
		)
		.catch((err) => {
			console.error("Failed to debounced-update location:", err);
		});
}

async function handleLocationBlur() {
	if (!task.value) return;
	try {
		await taskStore.flushDebouncedUpdate(task.value.id);
	} catch (err) {
		console.error("Failed to flush debounced location:", err);
	}
}

// URL
function handleUrlInput(e: Event) {
	if (!task.value) return;
	const val = (e.target as HTMLInputElement).value.trim();
	const nextVal = val || null;
	if (nextVal === task.value.url) return;
	if (detailData.value) {
		detailData.value.url = nextVal;
	}
	taskStore
		.updateTask(
			{
				id: task.value.id,
				url: nextVal,
			},
			{ debounceMs: 400 },
		)
		.catch((err) => {
			console.error("Failed to debounced-update url:", err);
		});
}

async function handleUrlBlur() {
	if (!task.value) return;
	try {
		await taskStore.flushDebouncedUpdate(task.value.id);
	} catch (err) {
		console.error("Failed to flush debounced url:", err);
	}
}

function openUrl(targetUrl: string) {
	let urlToOpen = targetUrl.trim();
	if (!/^https?:\/\//i.test(urlToOpen)) {
		urlToOpen = `https://${urlToOpen}`;
	}
	window.open(urlToOpen, "_blank", "noopener,noreferrer");
}

// ---------------------------------------------------------------------------
// Tags Section
// ---------------------------------------------------------------------------

const taskTags = computed<Tag[]>(() => detailData.value?.tags ?? []);

function startAddTag() {
	isAddingTag.value = true;
	newTagName.value = "";
	nextTick(() => {
		tagInputRef.value?.focus();
	});
}

async function handleAddTag() {
	if (!task.value) return;
	const raw = newTagName.value.trim().replace(/^#/, "");
	if (!raw) {
		isAddingTag.value = false;
		return;
	}

	try {
		let tagObj = tagStore.tagsWithCounts.find((t) => t.name.toLowerCase() === raw.toLowerCase());

		if (!tagObj) {
			tagObj = (await apiCreateTag(raw)) as unknown as (typeof tagStore.tagsWithCounts)[0];
			await tagStore.fetchTags();
		}

		if (tagObj && !taskTags.value.some((t) => t.id === tagObj?.id)) {
			await apiAssignTag(task.value.id, tagObj.id);
			if (detailData.value) {
				detailData.value.tags.push(tagObj);
			}
		}
	} catch (err) {
		console.error("Failed to assign tag:", err);
	} finally {
		newTagName.value = "";
		isAddingTag.value = false;
	}
}

async function handleRemoveTag(tagId: string) {
	if (!task.value) return;
	try {
		await apiRemoveTag(task.value.id, tagId);
		if (detailData.value) {
			detailData.value.tags = detailData.value.tags.filter((t) => t.id !== tagId);
		}
	} catch (err) {
		console.error("Failed to remove tag:", err);
	}
}

// ---------------------------------------------------------------------------
// Subtasks Section (First-Class Tasks)
// ---------------------------------------------------------------------------

const subtasks = computed<Task[]>(() => {
	if (detailData.value?.subtasks) {
		return detailData.value.subtasks;
	}
	if (!task.value) return [];
	return taskStore.allTasks.filter((t) => t.parent_id === task.value?.id && !t.deleted_at);
});

const incompleteSubtasks = computed(() => subtasks.value.filter((st) => !st.completed));

const completedSubtasks = computed(() => subtasks.value.filter((st) => st.completed));

const displayedSubtasks = computed(() => {
	return subtaskTab.value === "incomplete" ? incompleteSubtasks.value : completedSubtasks.value;
});

async function handleAddSubtask() {
	if (!task.value) return;
	const title = newSubtaskTitle.value.trim();
	if (!title) return;

	isAddingSubtask.value = true;
	try {
		const created = await taskStore.addTask({
			title,
			list_id: task.value.list_id,
			parent_id: task.value.id,
		});

		if (detailData.value) {
			if (!detailData.value.subtasks.some((st) => st.id === created.id)) {
				detailData.value.subtasks.push(created);
			}
		}
		newSubtaskTitle.value = "";
	} catch (err) {
		console.error("Failed to create subtask:", err);
	} finally {
		isAddingSubtask.value = false;
	}
}

async function handleToggleSubtask(subtaskId: string, targetCompleted?: boolean) {
	try {
		const updated = await taskStore.toggleTask(subtaskId, targetCompleted);
		if (detailData.value) {
			const idx = detailData.value.subtasks.findIndex((st) => st.id === subtaskId);
			if (idx !== -1) {
				detailData.value.subtasks[idx] = updated;
			}
		}
	} catch (err) {
		console.error("Failed to toggle subtask:", err);
	}
}

function inspectSubtask(subtaskItem: Task) {
	if (!task.value) return;
	// Push current task to parentStack for breadcrumb navigation
	parentStack.value.push({ ...task.value });
	selectedTaskId.value = subtaskItem.id;
	taskStore.setActiveTask(subtaskItem.id);
}

// ---------------------------------------------------------------------------
// Notes Section (Markdown-capable, RTM author/timestamp, safe sanitization)
// ---------------------------------------------------------------------------

const notes = computed<Note[]>(() => detailData.value?.notes ?? []);

function sanitizeUrl(rawUrl: string): string | null {
	const trimmed = rawUrl.trim();
	if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) {
		return trimmed;
	}
	return null;
}

function renderMarkdown(content: string): string {
	if (!content) return "";
	// 1. Fully escape raw HTML characters (prevent tag and attribute injection)
	let html = content
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");

	// 2. Headings
	html = html.replace(
		/^### (.*$)/gim,
		'<h4 class="font-bold text-sm mt-2 mb-1 text-zinc-900 dark:text-zinc-100">$1</h4>',
	);
	html = html.replace(
		/^## (.*$)/gim,
		'<h3 class="font-bold text-base mt-2 mb-1 text-zinc-900 dark:text-zinc-100">$1</h3>',
	);
	html = html.replace(
		/^# (.*$)/gim,
		'<h2 class="font-extrabold text-lg mt-3 mb-1.5 text-zinc-900 dark:text-zinc-100">$1</h2>',
	);

	// 3. Bold, italic, strike
	html = html.replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>");
	html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
	html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
	html = html.replace(/~~(.*?)~~/g, "<del>$1</del>");

	// 4. Inline code
	html = html.replace(
		/`([^`]+)`/g,
		'<code class="px-1 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-xs font-mono text-zinc-800 dark:text-zinc-200">$1</code>',
	);

	// 5. Safe links: validate protocol (strictly https?:// or mailto:) and attribute-encode
	html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, linkText, linkTarget) => {
		const safeTarget = sanitizeUrl(linkTarget);
		if (!safeTarget) {
			return linkText;
		}
		const encodedTarget = safeTarget.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
		return `<a href="${encodedTarget}" target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400 underline hover:text-blue-700">${linkText}</a>`;
	});

	// 6. Lists
	html = html.replace(/^\s*-\s+(.*$)/gim, '<li class="ml-4 list-disc text-sm">$1</li>');
	html = html.replace(/^\s*\*\s+(.*$)/gim, '<li class="ml-4 list-disc text-sm">$1</li>');

	// 7. Line breaks
	html = html.replace(/\n/g, "<br />");

	return html;
}

async function handleAddNote() {
	if (!task.value) return;
	const content = newNoteContent.value.trim();
	if (!content) return;

	isAddingNote.value = true;
	try {
		const created = await apiAddNote({
			task_id: task.value.id,
			title: newNoteTitle.value.trim() || null,
			content,
		});

		if (detailData.value) {
			detailData.value.notes.unshift(created);
		}
		newNoteTitle.value = "";
		newNoteContent.value = "";
	} catch (err) {
		console.error("Failed to add note:", err);
	} finally {
		isAddingNote.value = false;
	}
}

function startEditNote(note: Note) {
	editingNoteId.value = note.id;
	editingNoteTitle.value = note.title ?? "";
	editingNoteContent.value = note.content;
	editingNoteMode.value = "edit";
}

async function handleSaveNote(noteId: string) {
	const content = editingNoteContent.value.trim();
	if (!content) return;

	try {
		const updated = await apiUpdateNote({
			id: noteId,
			title: editingNoteTitle.value.trim() || null,
			content,
		});

		if (detailData.value) {
			const idx = detailData.value.notes.findIndex((n) => n.id === noteId);
			if (idx !== -1) {
				detailData.value.notes[idx] = updated;
			}
		}
		editingNoteId.value = null;
	} catch (err) {
		console.error("Failed to update note:", err);
	}
}

function cancelEditNote() {
	editingNoteId.value = null;
}

async function handleDeleteNote(noteId: string) {
	const confirmDelete = window.confirm("Delete this note?");
	if (!confirmDelete) return;

	try {
		await apiDeleteNote(noteId);
		if (detailData.value) {
			detailData.value.notes = detailData.value.notes.filter((n) => n.id !== noteId);
		}
	} catch (err) {
		console.error("Failed to delete note:", err);
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string | null | undefined): string {
	if (!dateStr) return "None";
	try {
		const d = new Date(dateStr);
		return d.toLocaleString(undefined, {
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
	} catch {
		return dateStr;
	}
}
</script>

<template>
	<aside
		class="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 select-none overflow-hidden"
	>
		<!-- Empty State -->
		<div
			v-if="!task"
			class="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-400 dark:text-zinc-500"
		>
			<FileText class="w-12 h-12 mb-3 opacity-30 stroke-1" />
			<p class="text-sm font-medium">No task selected</p>
			<p class="text-xs mt-1 text-zinc-400">Select a task from the list to view its details.</p>
		</div>

		<!-- Task Detail View -->
		<div v-else class="flex flex-col h-full min-h-0">
			<!-- Header -->
			<div
				class="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xs"
			>
				<div class="flex items-center gap-2">
					<!-- Back button if navigated from parent task -->
					<button
						v-if="parentStack.length > 0"
						type="button"
						@click="handleGoBack"
						class="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 py-1 px-1.5 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
						title="Back to parent task"
					>
						<ChevronRight class="w-3.5 h-3.5 rotate-180" />
						<span>Parent Task</span>
					</button>

					<!-- Completion status badge -->
					<span
						class="text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 cursor-pointer"
						:class="[
							task.completed
								? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
								: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
						]"
						@click="handleToggleComplete"
					>
						<CheckCircle2 v-if="task.completed" class="w-3.5 h-3.5" />
						<Circle v-else class="w-3.5 h-3.5" />
						<span>{{ task.completed ? "Completed" : "In Progress" }}</span>
					</span>
				</div>

				<button
					type="button"
					@click="handleClose"
					class="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
					title="Close details"
				>
					<X class="w-4 h-4" />
				</button>
			</div>

			<!-- Content Body: Scrollable -->
			<div class="flex-1 overflow-y-auto p-4 space-y-6 min-h-0">
				<!-- Editable Task Title & Checkbox -->
				<div class="flex items-start gap-3">
					<input
						type="checkbox"
						:checked="task.completed"
						@change="handleToggleComplete"
						class="mt-1 w-4 h-4 text-emerald-600 rounded border-zinc-300 focus:ring-emerald-500 cursor-pointer"
					/>

					<div class="flex-1 min-w-0">
						<!-- Inline editing input -->
						<div v-if="isEditingTitle" class="flex flex-col gap-1.5">
							<input
								ref="titleInputRef"
								v-model="editingTitleValue"
								type="text"
								class="w-full text-base font-semibold px-2 py-1 bg-white dark:bg-zinc-900 border border-emerald-500 rounded focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
								@keydown.enter="saveTitle"
								@keydown.esc="cancelEditingTitle"
								@blur="saveTitle"
							/>
							<div class="flex items-center gap-2 text-[11px] text-zinc-400">
								<span>Press Enter to save, Esc to cancel</span>
							</div>
						</div>

						<!-- Static title display with hover edit button -->
						<div
							v-else
							class="group flex items-start justify-between gap-2 cursor-pointer"
							@click="startEditingTitle"
						>
							<h3
								class="text-base font-semibold leading-snug break-words"
								:class="{ 'line-through text-zinc-400 dark:text-zinc-500': task.completed }"
							>
								{{ task.title }}
							</h3>
							<button
								type="button"
								class="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-opacity"
								title="Edit title"
							>
								<Pencil class="w-3.5 h-3.5" />
							</button>
						</div>
					</div>
				</div>

				<!-- Metadata Property Rows -->
				<div class="space-y-3.5 pt-1 text-sm border-t border-zinc-200/60 dark:border-zinc-800/60">
					<!-- Due Date Row -->
					<div class="space-y-1.5">
						<div class="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
							<Calendar class="w-4 h-4 shrink-0 text-zinc-400" />
							<span class="w-20 text-xs font-medium uppercase tracking-wider">Due</span>
							<div class="flex-1 flex items-center gap-2">
								<input
									type="date"
									:value="formattedDueDate"
									@input="(e) => setDueDate((e.target as HTMLInputElement).value || null)"
									class="text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 text-zinc-800 dark:text-zinc-200 focus:outline-hidden focus:border-zinc-400"
								/>
								<button
									v-if="task.due"
									type="button"
									@click="setDueDate(null)"
									class="text-[11px] text-zinc-400 hover:text-red-500 transition-colors cursor-pointer"
									title="Clear due date"
								>
									Clear
								</button>
							</div>
						</div>
						<!-- Quick Presets -->
						<div class="flex items-center gap-1.5 pl-27">
							<button
								type="button"
								@click="applyDuePreset('today')"
								class="px-2 py-0.5 text-[11px] font-medium bg-zinc-200/60 dark:bg-zinc-800/60 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
							>
								Today
							</button>
							<button
								type="button"
								@click="applyDuePreset('tomorrow')"
								class="px-2 py-0.5 text-[11px] font-medium bg-zinc-200/60 dark:bg-zinc-800/60 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
							>
								Tomorrow
							</button>
							<button
								type="button"
								@click="applyDuePreset('next_week')"
								class="px-2 py-0.5 text-[11px] font-medium bg-zinc-200/60 dark:bg-zinc-800/60 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
							>
								1 week
							</button>
							<button
								type="button"
								@click="applyDuePreset('never')"
								class="px-2 py-0.5 text-[11px] font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded transition-colors cursor-pointer"
							>
								Never
							</button>
						</div>
						<!-- Postpone Actions -->
						<div class="flex items-center gap-1.5 pl-27 pt-1">
							<span class="text-[10px] text-zinc-400 mr-0.5">Postpone:</span>
							<button
								type="button"
								@click="handlePostpone(1)"
								class="px-2 py-0.5 text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
								title="Postpone by 1 day"
							>
								+1 day
							</button>
							<button
								type="button"
								@click="handlePostpone(2)"
								class="px-2 py-0.5 text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
								title="Postpone by 2 days"
							>
								+2 days
							</button>
							<button
								type="button"
								@click="handlePostpone(7)"
								class="px-2 py-0.5 text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
								title="Postpone by 1 week"
							>
								+1 week
							</button>
						</div>
					</div>

					<!-- Repeats (Recurrence Rule) Row -->
					<div class="space-y-1.5">
						<div class="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
							<Repeat class="w-4 h-4 shrink-0 text-zinc-400" />
							<span class="w-20 text-xs font-medium uppercase tracking-wider">Repeats</span>
							<div class="flex-1">
								<select
									:value="selectedRecurrenceValue"
									@change="handleRecurrenceChange"
									class="w-full text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 text-zinc-800 dark:text-zinc-200 focus:outline-hidden focus:border-zinc-400 cursor-pointer"
								>
									<option v-for="opt in recurrenceOptions" :key="opt.value" :value="opt.value">
										{{ opt.label }}
									</option>
								</select>
							</div>
						</div>

						<!-- Custom RRULE text input field -->
						<div v-if="isCustomRecurrence" class="flex items-center gap-2 pl-27">
							<input
								v-model="customRruleInput"
								type="text"
								placeholder="e.g. RRULE:FREQ=DAILY;INTERVAL=2"
								class="flex-1 text-xs font-mono bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 text-zinc-800 dark:text-zinc-200 focus:outline-hidden focus:border-zinc-400"
								@keydown.enter="saveCustomRrule"
								@blur="saveCustomRrule"
							/>
							<button
								type="button"
								@click="saveCustomRrule"
								class="px-2 py-1 text-[11px] bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded text-zinc-700 dark:text-zinc-300 cursor-pointer"
							>
								Set
							</button>
						</div>
					</div>

					<!-- List Selector Row -->
					<div class="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
						<Folder class="w-4 h-4 shrink-0 text-zinc-400" />
						<span class="w-20 text-xs font-medium uppercase tracking-wider">List</span>
						<div class="flex-1">
							<select
								:value="task.list_id"
								@change="handleListChange"
								class="w-full text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 text-zinc-800 dark:text-zinc-200 focus:outline-hidden focus:border-zinc-400 cursor-pointer"
							>
								<option v-for="l in listStore.lists" :key="l.id" :value="l.id">
									{{ l.name }}
								</option>
							</select>
						</div>
					</div>

					<!-- Priority Selector Row -->
					<div class="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
						<Flag class="w-4 h-4 shrink-0 text-zinc-400" />
						<span class="w-20 text-xs font-medium uppercase tracking-wider">Priority</span>
						<div class="flex-1 flex items-center gap-1.5">
							<button
								type="button"
								@click="handlePriorityChange(PRIORITY.HIGH)"
								class="px-2 py-0.5 text-xs font-medium rounded transition-colors cursor-pointer"
								:class="[
									task.priority === PRIORITY.HIGH
										? 'bg-red-500 text-white font-bold'
										: 'bg-zinc-200/60 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700',
								]"
							>
								P1
							</button>
							<button
								type="button"
								@click="handlePriorityChange(PRIORITY.MEDIUM)"
								class="px-2 py-0.5 text-xs font-medium rounded transition-colors cursor-pointer"
								:class="[
									task.priority === PRIORITY.MEDIUM
										? 'bg-amber-500 text-white font-bold'
										: 'bg-zinc-200/60 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700',
								]"
							>
								P2
							</button>
							<button
								type="button"
								@click="handlePriorityChange(PRIORITY.LOW)"
								class="px-2 py-0.5 text-xs font-medium rounded transition-colors cursor-pointer"
								:class="[
									task.priority === PRIORITY.LOW
										? 'bg-blue-500 text-white font-bold'
										: 'bg-zinc-200/60 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700',
								]"
							>
								P3
							</button>
							<button
								type="button"
								@click="handlePriorityChange(null)"
								class="px-2 py-0.5 text-xs font-medium rounded transition-colors cursor-pointer"
								:class="[
									task.priority === null
										? 'bg-zinc-400 text-white dark:bg-zinc-600 font-bold'
										: 'bg-zinc-200/60 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700',
								]"
							>
								None
							</button>
						</div>
					</div>

					<!-- Tags Interactive Input Row -->
					<div class="flex items-start gap-3 text-zinc-600 dark:text-zinc-400">
						<TagIcon class="w-4 h-4 shrink-0 text-zinc-400 mt-1" />
						<span class="w-20 text-xs font-medium uppercase tracking-wider mt-1">Tags</span>
						<div class="flex-1 flex flex-wrap items-center gap-1.5">
							<span
								v-for="t in taskTags"
								:key="t.id"
								class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-300/50 dark:border-zinc-700/50"
							>
								#{{ t.name }}
								<button
									type="button"
									@click="handleRemoveTag(t.id)"
									class="hover:text-red-500 cursor-pointer"
									title="Remove tag"
								>
									<X class="w-3 h-3" />
								</button>
							</span>

							<!-- Inline Tag Creator -->
							<div v-if="isAddingTag" class="inline-flex items-center">
								<input
									ref="tagInputRef"
									v-model="newTagName"
									type="text"
									placeholder="tag name..."
									class="text-xs px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 w-24 focus:outline-hidden focus:border-zinc-500"
									@keydown.enter="handleAddTag"
									@keydown.esc="isAddingTag = false"
									@blur="handleAddTag"
								/>
							</div>

							<button
								v-else
								type="button"
								@click="startAddTag"
								class="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-full hover:border-zinc-400 cursor-pointer transition-colors"
							>
								<Plus class="w-3 h-3" />
								<span>Tag</span>
							</button>
						</div>
					</div>

					<!-- Location Row -->
					<div class="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
						<MapPin class="w-4 h-4 shrink-0 text-zinc-400" />
						<span class="w-20 text-xs font-medium uppercase tracking-wider">Location</span>
						<div class="flex-1">
							<input
								type="text"
								:value="task.location || ''"
								@input="handleLocationInput"
								@blur="handleLocationBlur"
								placeholder="Add location..."
								class="w-full text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 text-zinc-800 dark:text-zinc-200 focus:outline-hidden focus:border-zinc-400"
							/>
						</div>
					</div>

					<!-- URL Row -->
					<div class="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
						<ExternalLink class="w-4 h-4 shrink-0 text-zinc-400" />
						<span class="w-20 text-xs font-medium uppercase tracking-wider">URL</span>
						<div class="flex-1 flex items-center gap-1.5">
							<input
								type="text"
								:value="task.url || ''"
								@input="handleUrlInput"
								@blur="handleUrlBlur"
								placeholder="https://..."
								class="flex-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 text-zinc-800 dark:text-zinc-200 focus:outline-hidden focus:border-zinc-400 truncate"
							/>
							<button
								v-if="task.url"
								type="button"
								@click="openUrl(task.url)"
								class="p-1 text-zinc-500 hover:text-blue-500 cursor-pointer"
								title="Open link"
							>
								<ExternalLink class="w-3.5 h-3.5" />
							</button>
						</div>
					</div>
				</div>

				<!-- Subtasks Section (First-Class Tasks) -->
				<div class="pt-3 border-t border-zinc-200/60 dark:border-zinc-800/60 space-y-3">
					<div class="flex items-center justify-between">
						<h4
							class="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
						>
							Subtasks
							<span v-if="subtasks.length > 0" class="text-zinc-400 font-normal">
								({{ incompleteSubtasks.length }}/{{ subtasks.length }})
							</span>
						</h4>

						<!-- Incomplete / Completed Subtask Tabs -->
						<div
							class="flex items-center rounded-md bg-zinc-200/60 dark:bg-zinc-800/60 p-0.5 text-[11px] font-medium"
						>
							<button
								type="button"
								@click="subtaskTab = 'incomplete'"
								class="px-2 py-0.5 rounded transition-colors cursor-pointer"
								:class="[
									subtaskTab === 'incomplete'
										? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs'
										: 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200',
								]"
							>
								Active ({{ incompleteSubtasks.length }})
							</button>
							<button
								type="button"
								@click="subtaskTab = 'completed'"
								class="px-2 py-0.5 rounded transition-colors cursor-pointer"
								:class="[
									subtaskTab === 'completed'
										? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs'
										: 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200',
								]"
							>
								Done ({{ completedSubtasks.length }})
							</button>
						</div>
					</div>

					<!-- Add Subtask Input -->
					<div class="flex items-center gap-2">
						<input
							v-model="newSubtaskTitle"
							type="text"
							placeholder="Add a subtask..."
							class="flex-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded px-2.5 py-1.5 text-zinc-800 dark:text-zinc-200 focus:outline-hidden focus:border-emerald-500"
							@keydown.enter="handleAddSubtask"
						/>
						<button
							type="button"
							@click="handleAddSubtask"
							:disabled="!newSubtaskTitle.trim() || isAddingSubtask"
							class="p-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded cursor-pointer transition-colors"
							title="Add subtask"
						>
							<Plus class="w-3.5 h-3.5" />
						</button>
					</div>

					<!-- Subtask List -->
					<div v-if="displayedSubtasks.length > 0" class="space-y-1">
						<div
							v-for="st in displayedSubtasks"
							:key="st.id"
							class="group flex items-center justify-between gap-2 p-1.5 rounded-md hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 transition-colors"
						>
							<div class="flex items-center gap-2.5 min-w-0 flex-1">
								<input
									type="checkbox"
									:checked="st.completed"
									@change="handleToggleSubtask(st.id, !st.completed)"
									class="w-3.5 h-3.5 text-emerald-600 rounded border-zinc-300 focus:ring-emerald-500 cursor-pointer"
								/>
								<span
									class="text-xs truncate cursor-pointer select-text"
									:class="{ 'line-through text-zinc-400 dark:text-zinc-500': st.completed }"
									@click="inspectSubtask(st)"
									title="Click to inspect subtask details"
								>
									{{ st.title }}
								</span>
							</div>

							<!-- Subtask Inspector Navigation -->
							<button
								type="button"
								@click="inspectSubtask(st)"
								class="p-1 rounded text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 hover:bg-zinc-300/60 dark:hover:bg-zinc-700/60 transition-colors cursor-pointer"
								title="Inspect subtask details"
							>
								<ChevronRight class="w-3.5 h-3.5" />
							</button>
						</div>
					</div>
					<div v-else class="text-center py-2 text-xs text-zinc-400 dark:text-zinc-500 italic">
						No {{ subtaskTab === "incomplete" ? "active" : "completed" }} subtasks
					</div>
				</div>

				<!-- Notes Section (Markdown-capable) -->
				<div class="pt-3 border-t border-zinc-200/60 dark:border-zinc-800/60 space-y-3">
					<div class="flex items-center justify-between">
						<h4
							class="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
						>
							Notes
							<span v-if="notes.length > 0" class="text-zinc-400 font-normal">
								({{ notes.length }})
							</span>
						</h4>
					</div>

					<!-- Add Note Box -->
					<div
						class="space-y-2 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70"
					>
						<input
							v-model="newNoteTitle"
							type="text"
							placeholder="Note title (optional)..."
							class="w-full text-xs font-medium bg-transparent border-b border-zinc-100 dark:border-zinc-800 pb-1 text-zinc-800 dark:text-zinc-200 focus:outline-hidden focus:border-zinc-300"
						/>
						<textarea
							v-model="newNoteContent"
							rows="2"
							placeholder="Add a note (Markdown supported)..."
							class="w-full text-xs bg-transparent text-zinc-800 dark:text-zinc-200 focus:outline-hidden resize-y min-h-[40px]"
						></textarea>
						<div class="flex justify-end pt-1">
							<button
								type="button"
								@click="handleAddNote"
								:disabled="!newNoteContent.trim() || isAddingNote"
								class="px-2.5 py-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded cursor-pointer transition-colors"
							>
								Add Note
							</button>
						</div>
					</div>

					<!-- Note List (RTM-style with author/title and timestamp) -->
					<div v-if="notes.length > 0" class="space-y-3">
						<div
							v-for="note in notes"
							:key="note.id"
							class="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 space-y-1.5 shadow-2xs"
						>
							<!-- Editing Mode -->
							<div v-if="editingNoteId === note.id" class="space-y-2">
								<div
									class="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-1"
								>
									<div class="flex items-center gap-2">
										<button
											type="button"
											@click="editingNoteMode = 'edit'"
											class="text-[11px] font-medium px-2 py-0.5 rounded cursor-pointer"
											:class="[
												editingNoteMode === 'edit'
													? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
													: 'text-zinc-400',
											]"
										>
											Edit
										</button>
										<button
											type="button"
											@click="editingNoteMode = 'preview'"
											class="text-[11px] font-medium px-2 py-0.5 rounded cursor-pointer"
											:class="[
												editingNoteMode === 'preview'
													? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
													: 'text-zinc-400',
											]"
										>
											Preview
										</button>
									</div>
									<div class="flex items-center gap-1">
										<button
											type="button"
											@click="handleSaveNote(note.id)"
											class="p-1 text-emerald-600 hover:text-emerald-700 cursor-pointer"
											title="Save note"
										>
											<Check class="w-3.5 h-3.5" />
										</button>
										<button
											type="button"
											@click="cancelEditNote"
											class="p-1 text-zinc-400 hover:text-zinc-600 cursor-pointer"
											title="Cancel"
										>
											<X class="w-3.5 h-3.5" />
										</button>
									</div>
								</div>

								<div v-if="editingNoteMode === 'edit'" class="space-y-1.5">
									<input
										v-model="editingNoteTitle"
										type="text"
										placeholder="Note title..."
										class="w-full text-xs font-semibold bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 text-zinc-800 dark:text-zinc-200 focus:outline-hidden"
									/>
									<textarea
										v-model="editingNoteContent"
										rows="4"
										class="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded p-2 text-zinc-800 dark:text-zinc-200 focus:outline-hidden resize-y"
									></textarea>
								</div>
								<div
									v-else
									class="prose prose-sm dark:prose-invert max-w-none text-xs p-2 bg-zinc-50 dark:bg-zinc-950 rounded border border-zinc-200 dark:border-zinc-800 min-h-[60px]"
									v-html="renderMarkdown(editingNoteContent)"
								></div>
							</div>

							<!-- View Mode -->
							<div v-else>
								<div class="flex items-start justify-between gap-2">
									<div>
										<h5
											v-if="note.title"
											class="text-xs font-semibold text-zinc-900 dark:text-zinc-100"
										>
											{{ note.title }}
										</h5>
										<!-- RTM design author & timestamp header -->
										<div class="flex items-center gap-1.5 text-[10px] text-zinc-400 mt-0.5">
											<span
												class="inline-flex items-center gap-1 font-medium text-zinc-600 dark:text-zinc-300"
											>
												<User class="w-2.5 h-2.5 opacity-70" />
												You
											</span>
											<span>•</span>
											<span>{{ formatDate(note.created_at) }}</span>
										</div>
									</div>
									<div
										class="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity"
									>
										<button
											type="button"
											@click="startEditNote(note)"
											class="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
											title="Edit note"
										>
											<Pencil class="w-3 h-3" />
										</button>
										<button
											type="button"
											@click="handleDeleteNote(note.id)"
											class="p-1 text-zinc-400 hover:text-red-500 cursor-pointer"
											title="Delete note"
										>
											<Trash2 class="w-3 h-3" />
										</button>
									</div>
								</div>

								<div
									class="text-xs text-zinc-700 dark:text-zinc-300 pt-1 break-words select-text"
									v-html="renderMarkdown(note.content)"
								></div>
							</div>
						</div>
					</div>
					<div v-else class="text-center py-2 text-xs text-zinc-400 dark:text-zinc-500 italic">
						No notes yet
					</div>
				</div>
			</div>

			<!-- Footer Actions -->
			<div
				class="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/50 flex items-center justify-between shrink-0"
			>
				<button
					type="button"
					@click="handleDelete"
					class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
				>
					<Trash2 class="w-3.5 h-3.5" />
					<span>Delete Task</span>
				</button>

				<span class="text-[11px] text-zinc-400"> ID: {{ task.id.slice(0, 8) }}... </span>
			</div>
		</div>
	</aside>
</template>
