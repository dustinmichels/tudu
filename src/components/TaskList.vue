<script setup lang="ts">
import {
	AlertCircle,
	ArrowDown,
	ArrowUp,
	Calendar,
	CalendarPlus,
	CalendarRange,
	Check,
	CheckCircle2,
	CheckSquare,
	ChevronDown,
	ChevronRight,
	Circle,
	CornerDownLeft,
	Flag,
	FolderInput,
	Inbox,
	ListFilter,
	ListTree,
	Menu,
	MinusSquare,
	PanelRight,
	PanelRightClose,
	Plus,
	Square,
	Sunrise,
	Tag as TagIcon,
	Tags,
	Trash2,
	Zap,
} from "lucide-vue-next";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { PRIORITY, type Priority, type Tag } from "../models/index.ts";
import { assignTag, getTaskDetail, removeTag } from "../services/api.ts";
import { useFilterStore } from "../stores/filters.ts";
import { useListStore } from "../stores/lists.ts";
import { useTagStore } from "../stores/tags.ts";
import { isOverdue, useTaskStore } from "../stores/tasks.ts";
import { useUIStore } from "../stores/ui.ts";
import {
	type ActiveSmartToken,
	detectSmartToken,
	getDueSuggestions,
	getPrioritySuggestions,
	getTagAndListSuggestions,
	parseSmartAdd,
	type SmartSuggestion,
} from "../utils/smartAdd.ts";
import {
	compareByCompletion,
	compareByDueDate,
	compareByPriority,
	type SortOrder,
} from "../utils/sorting.ts";
import { DEFAULT_LIST_ICON, getListIcon } from "../utils/icons.ts";
import IconPickerPopover from "./IconPickerPopover.vue";

const listStore = useListStore();
const taskStore = useTaskStore();
const filterStore = useFilterStore();
const tagStore = useTagStore();
const uiStore = useUIStore();

const newTaskTitle = ref("");
const quickAddInputRef = ref<HTMLInputElement | null>(null);
const isAdding = ref(false);

// List icon picker state for active list header
const isHeaderIconPickerOpen = ref(false);
const headerIconPickerTargetRect = ref<DOMRect | null>(null);

function openIconPickerForActiveList(event: MouseEvent) {
	event.stopPropagation();
	const el = event.currentTarget as HTMLElement;
	headerIconPickerTargetRect.value = el.getBoundingClientRect();
	isHeaderIconPickerOpen.value = true;
}

async function handleHeaderIconSelected(iconName: string) {
	if (activeList.value) {
		try {
			await listStore.updateList({ id: activeList.value.id, icon: iconName });
		} catch (err) {
			console.error("Failed to update list icon from header:", err);
		}
	}
}

// ---------------------------------------------------------------------------
// Smart Add & Shortcuts Dropdown State (#tag, ^due, !priority)
// ---------------------------------------------------------------------------
const activeSmartToken = ref<ActiveSmartToken | null>(null);
const smartSuggestions = ref<SmartSuggestion[]>([]);
const selectedSmartIndex = ref(0);
const isSmartMenuOpen = ref(false);

function updateSmartDropdown() {
	const input = quickAddInputRef.value;
	if (!input) {
		isSmartMenuOpen.value = false;
		return;
	}
	const cursorPos = input.selectionStart ?? newTaskTitle.value.length;
	const token = detectSmartToken(newTaskTitle.value, cursorPos);
	if (!token) {
		isSmartMenuOpen.value = false;
		activeSmartToken.value = null;
		smartSuggestions.value = [];
		return;
	}

	activeSmartToken.value = token;
	if (token.prefix === "#") {
		const tagNames = tagStore.tagsWithCounts.map((t) => t.name);
		const listNames = listStore.lists.map((l) => l.name);
		smartSuggestions.value = getTagAndListSuggestions(tagNames, listNames, token.query);
	} else if (token.prefix === "^") {
		smartSuggestions.value = getDueSuggestions(token.query);
	} else if (token.prefix === "!") {
		smartSuggestions.value = getPrioritySuggestions(token.query);
	}

	isSmartMenuOpen.value = smartSuggestions.value.length > 0;
	selectedSmartIndex.value = 0;
}

function selectSmartSuggestion(suggestion: SmartSuggestion) {
	const token = activeSmartToken.value;
	if (!token || !quickAddInputRef.value) return;

	const currentText = newTaskTitle.value;
	const before = currentText.slice(0, token.startIndex);
	const after = currentText.slice(token.endIndex);

	// Prefix remains (#, ^, or !) followed by suggestion.insertValue and a space
	const replacement = `${token.prefix}${suggestion.insertValue} `;
	newTaskTitle.value = before + replacement + after;

	isSmartMenuOpen.value = false;
	activeSmartToken.value = null;
	smartSuggestions.value = [];

	nextTick(() => {
		const input = quickAddInputRef.value;
		if (!input) return;
		input.focus();
		const newCursor = before.length + replacement.length;
		input.setSelectionRange(newCursor, newCursor);
	});
}

function handleQuickAddKeydown(e: KeyboardEvent) {
	if (!isSmartMenuOpen.value || smartSuggestions.value.length === 0) {
		return;
	}

	if (e.key === "ArrowDown") {
		e.preventDefault();
		selectedSmartIndex.value = (selectedSmartIndex.value + 1) % smartSuggestions.value.length;
		return;
	}

	if (e.key === "ArrowUp") {
		e.preventDefault();
		selectedSmartIndex.value =
			(selectedSmartIndex.value - 1 + smartSuggestions.value.length) %
			smartSuggestions.value.length;
		return;
	}

	if (e.key === "Enter" || e.key === "Tab") {
		const item = smartSuggestions.value[selectedSmartIndex.value];
		if (item) {
			e.preventDefault();
			selectSmartSuggestion(item);
		}
		return;
	}

	if (e.key === "Escape") {
		e.preventDefault();
		isSmartMenuOpen.value = false;
	}
}

function appendSmartPrefix(prefix: string) {
	const input = quickAddInputRef.value;
	const current = newTaskTitle.value;
	const needsSpace = current.length > 0 && !current.endsWith(" ");
	newTaskTitle.value = `${current}${needsSpace ? " " : ""}${prefix}`;
	nextTick(() => {
		if (!input) return;
		input.focus();
		updateSmartDropdown();
	});
}

const activeList = computed(() => listStore.activeList);
const isView = computed(() => listStore.activeView !== null);
const hasActiveSelection = computed(
	() => !!listStore.activeList || !!listStore.activeView || !!filterStore.selectedTag,
);

const viewTitle = computed(() => {
	if (filterStore.selectedTag) return `#${filterStore.selectedTag}`;
	if (listStore.activeView === "inbox") return "Inbox";
	if (listStore.activeView === "all") return "All Tasks";
	if (listStore.activeView === "today") return "Today";
	if (listStore.activeView === "tomorrow") return "Tomorrow";
	if (listStore.activeView === "this_week") return "This Week";
	if (listStore.activeView === "overdue") return "Overdue";
	if (listStore.activeView === "trash") return "Trash";
	return null;
});

const headerTitle = computed(() => {
	if (viewTitle.value) return viewTitle.value;
	return activeList.value ? activeList.value.name : "No Selection";
});

const quickAddPlaceholder = computed(() => {
	if (filterStore.selectedTag) return `Add a task tagged #${filterStore.selectedTag}...`;
	if (viewTitle.value) return `Add a task to ${viewTitle.value}...`;
	return activeList.value ? `Add a task to ${activeList.value.name}...` : "Add a task...";
});

// Tag cache for visible tasks: taskId -> Tag[]
const taskTagsCache = ref<Map<string, Tag[]>>(new Map());
const customNewTagName = ref("");

// ---------------------------------------------------------------------------
// Sort State
// ---------------------------------------------------------------------------
type SortFieldOption = "created_at" | "priority" | "due" | "list" | "tags";
const activeSortField = ref<SortFieldOption | null>(null);
const activeSortOrder = ref<SortOrder>("asc");

function handleSortClick(field: SortFieldOption) {
	if (activeSortField.value === field) {
		if (activeSortOrder.value === "asc") {
			activeSortOrder.value = "desc";
		} else {
			// third click clears back to default order
			activeSortField.value = null;
			activeSortOrder.value = "asc";
		}
	} else {
		activeSortField.value = field;
		activeSortOrder.value = "asc";
	}
}

const visibleTasks = computed(() => {
	// If user is searching, use filteredTasks which handles search across title, description, location, url
	const tasks = filterStore.searchQuery.trim()
		? taskStore.filteredTasks
		: taskStore.includeCompleted
			? taskStore.tasks
			: taskStore.incompleteTasks;

	// Subtasks belong in parent detail panes, not top-level center-pane list rows
	const rootTasks = tasks.filter((t) => !t.parent_id);

	const field = activeSortField.value;
	const order = activeSortOrder.value;
	const dir = order === "asc" ? 1 : -1;

	// Build list name map once for "by list" sort
	const listMap = new Map(listStore.lists.map((l) => [l.id, l.name.toLowerCase()]));

	return [...rootTasks].sort((a, b) => {
		// Completed tasks always sink to bottom
		const cmpCompletion = compareByCompletion(a, b);
		if (cmpCompletion !== 0) return cmpCompletion;

		// No user-chosen sort: preserve store order
		if (!field) return 0;

		if (field === "priority") return compareByPriority(a, b, order);
		if (field === "due") return compareByDueDate(a, b, order);

		if (field === "created_at") {
			const ta = a.created_at ?? "";
			const tb = b.created_at ?? "";
			return ta < tb ? -dir : ta > tb ? dir : 0;
		}

		if (field === "list") {
			const la = listMap.get(a.list_id) ?? "";
			const lb = listMap.get(b.list_id) ?? "";
			return la < lb ? -dir : la > lb ? dir : 0;
		}

		if (field === "tags") {
			// Sort by first tag name from the tag cache (tasks not yet cached sort last)
			const ta = taskTagsCache.value.get(a.id)?.[0]?.name?.toLowerCase() ?? "\uFFFF";
			const tb = taskTagsCache.value.get(b.id)?.[0]?.name?.toLowerCase() ?? "\uFFFF";
			return ta < tb ? -dir : ta > tb ? dir : 0;
		}

		return 0;
	});
});

// ---------------------------------------------------------------------------
// Selection & Batch Actions State
// ---------------------------------------------------------------------------
const selectedTaskIds = ref<Set<string>>(new Set());
const isBatchOperating = ref(false);

type DropdownMenu = "select" | "postpone" | "priority" | "list" | "tag" | null;
const activeDropdown = ref<DropdownMenu>(null);
const customPostponeDate = ref("");

interface ContextMenuState {
	visible: boolean;
	x: number;
	y: number;
	taskId: string | null;
}

const contextMenu = ref<ContextMenuState>({
	visible: false,
	x: 0,
	y: 0,
	taskId: null,
});

function closeContextMenu() {
	contextMenu.value.visible = false;
	contextMenu.value.taskId = null;
}

function handleTaskContextMenu(e: MouseEvent, taskId: string) {
	e.preventDefault();
	e.stopPropagation();
	closeDropdowns();
	taskStore.setActiveTask(taskId);
	contextMenu.value = {
		visible: true,
		x: Math.min(e.clientX, window.innerWidth - 200),
		y: Math.min(e.clientY, window.innerHeight - 240),
		taskId,
	};
}

async function handleContextMenuPostpone(days: number) {
	const id = contextMenu.value.taskId;
	closeContextMenu();
	if (!id) return;
	try {
		await taskStore.postponeTask(id, days);
	} catch (err) {
		console.error("Failed to postpone task from context menu:", err);
	}
}

function toggleDropdown(menu: DropdownMenu) {
	activeDropdown.value = activeDropdown.value === menu ? null : menu;
}

function closeDropdowns() {
	activeDropdown.value = null;
}

function handleDocumentClick(e: MouseEvent) {
	closeContextMenu();
	const target = e.target as HTMLElement | null;
	if (target && !target.closest("[data-dropdown-container]")) {
		closeDropdowns();
	}
}

function handleGlobalKeyDown(e: KeyboardEvent) {
	if (e.defaultPrevented) return;
	const target = e.target as HTMLElement | null;
	const isEditingInput =
		target &&
		(target.tagName === "INPUT" ||
			target.tagName === "TEXTAREA" ||
			target.tagName === "SELECT" ||
			target.isContentEditable);

	const isMod = e.metaKey || e.ctrlKey;

	// Global combinations (work even if typing in some cases, but especially outside or inside)
	// Cmd/Ctrl + Shift + P -> Open Command Palette (Control Panel)
	if (isMod && e.shiftKey && (e.key === "P" || e.key === "p")) {
		e.preventDefault();
		uiStore.toggleCommandPalette(undefined, "commands");
		return;
	}

	// Cmd/Ctrl + P -> Open List / View Picker
	if (isMod && !e.shiftKey && !e.altKey && (e.key === "p" || e.key === "P")) {
		e.preventDefault();
		uiStore.toggleCommandPalette(undefined, "lists");
		return;
	}

	// Cmd/Ctrl + C -> Open Calendar view (unless editing text or text is highlighted)
	if (isMod && !e.shiftKey && !e.altKey && (e.key === "c" || e.key === "C")) {
		const hasSelection =
			typeof window !== "undefined" && (window.getSelection()?.toString().trim().length ?? 0) > 0;

		if (!isEditingInput && !hasSelection) {
			e.preventDefault();
			filterStore.setTagFilter(null);
			filterStore.setListFilter(null);
			filterStore.setSmartView(null);
			listStore.setActiveView("calendar");
			listStore.setActiveList(null);
			taskStore.setActiveTask(null);
			return;
		}
	}

	// Cmd/Ctrl + B -> Toggle primary sidebar (VS Code / Zed convention)
	if (isMod && !e.shiftKey && !e.altKey && (e.key === "b" || e.key === "B")) {
		e.preventDefault();
		uiStore.toggleSidebar();
		return;
	}

	// Cmd/Ctrl + J -> Toggle detail panel (VS Code / Zed convention for bottom/side panel)
	if (isMod && !e.shiftKey && !e.altKey && (e.key === "j" || e.key === "J")) {
		e.preventDefault();
		uiStore.toggleDetail();
		return;
	}

	// Cmd/Ctrl + H -> Toggle show/hide completed tasks
	if (isMod && !e.shiftKey && !e.altKey && (e.key === "h" || e.key === "H")) {
		e.preventDefault();
		const next = !taskStore.includeCompleted;
		taskStore.setIncludeCompleted(next);
		filterStore.setIncludeCompleted(next);
		return;
	}

	// Cmd/Ctrl + U -> Toggle show/hide subtasks inline in main view
	if (isMod && !e.shiftKey && !e.altKey && (e.key === "u" || e.key === "U")) {
		e.preventDefault();
		uiStore.toggleSubtasksInline();
		return;
	}

	// Cmd/Ctrl + N -> Open Quick Capture modal
	if (isMod && !e.shiftKey && !e.altKey && (e.key === "n" || e.key === "N")) {
		e.preventDefault();
		uiStore.toggleCapture(true);
		return;
	}

	// Escape -> close menus / modals or escape focus (blur active element)
	if (e.key === "Escape") {
		if (contextMenu.value.visible) {
			e.preventDefault();
			closeContextMenu();
			return;
		}
		if (activeDropdown.value) {
			e.preventDefault();
			closeDropdowns();
			return;
		}
		if (isSmartMenuOpen.value) {
			e.preventDefault();
			isSmartMenuOpen.value = false;
			return;
		}
		if (uiStore.isCommandPaletteOpen) {
			e.preventDefault();
			uiStore.toggleCommandPalette(false);
			return;
		}
		if (uiStore.isShortcutsOpen) {
			e.preventDefault();
			uiStore.toggleShortcuts(false);
			return;
		}
		if (uiStore.isCaptureOpen) {
			e.preventDefault();
			uiStore.toggleCapture(false);
			return;
		}
		if (uiStore.isImportOpen) {
			e.preventDefault();
			uiStore.toggleImport(false);
			return;
		}

		const active = (document.activeElement as HTMLElement | null) || target;
		if (active && active !== document.body && typeof active.blur === "function") {
			e.preventDefault();
			active.blur();
			return;
		}
	}

	// Shortcuts when NOT typing in an input
	if (!isEditingInput) {
		// '/' or Cmd/Ctrl + F -> focus global search bar
		if (
			(e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) ||
			(isMod && !e.shiftKey && (e.key === "f" || e.key === "F"))
		) {
			e.preventDefault();
			const searchInput = document.querySelector<HTMLInputElement>("input[data-global-search]");

			searchInput?.focus();
			searchInput?.select();
			return;
		}

		// 't' -> focus task quick-add
		if (e.key === "t" && !e.ctrlKey && !e.metaKey && !e.altKey) {
			e.preventDefault();
			quickAddInputRef.value?.focus();
			quickAddInputRef.value?.select();
			return;
		}

		// j / k / ArrowDown / ArrowUp -> navigate between tasks
		const isNextTaskShortcut =
			(e.key === "j" || e.key === "ArrowDown") && !e.ctrlKey && !e.metaKey && !e.altKey;
		const isPrevTaskShortcut =
			(e.key === "k" || e.key === "ArrowUp") && !e.ctrlKey && !e.metaKey && !e.altKey;

		if (isNextTaskShortcut || isPrevTaskShortcut) {
			const tasks = visibleTasks.value;
			if (!tasks.length) return;
			e.preventDefault();
			const currentId = taskStore.activeTaskId;
			const currentIndex = currentId ? tasks.findIndex((t) => t.id === currentId) : -1;

			let nextIndex: number;
			if (isNextTaskShortcut) {
				nextIndex = currentIndex === -1 ? 0 : Math.min(currentIndex + 1, tasks.length - 1);
			} else {
				nextIndex = currentIndex === -1 ? tasks.length - 1 : Math.max(currentIndex - 1, 0);
			}

			const nextTask = tasks[nextIndex];
			if (nextTask) {
				taskStore.setActiveTask(nextTask.id);
				uiStore.toggleDetail(true);
				// Scroll into view if needed
				const el = document.querySelector(`[data-task-id="${nextTask.id}"]`);
				el?.scrollIntoView({ block: "nearest" });
			}
			return;
		}

		// 'c' -> complete selected task
		if (e.key === "c" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
			const currentId = taskStore.activeTaskId;
			if (!currentId) return;
			e.preventDefault();
			void taskStore.toggleTask(currentId).catch((err) => {
				console.error("Failed to toggle task via shortcut:", err);
			});
			return;
		}

		// 'p' -> postpone selected task by 1 day
		if (e.key === "p" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
			const currentId = taskStore.activeTaskId;
			if (!currentId) return;
			e.preventDefault();
			void taskStore.postponeTask(currentId, 1).catch((err) => {
				console.error("Failed to postpone task via shortcut:", err);
			});
			return;
		}

		// '1', '2', '3' -> priority 1-3, '4' -> priority None
		if (
			(e.key === "1" || e.key === "2" || e.key === "3" || e.key === "4") &&
			!e.repeat &&
			!e.ctrlKey &&
			!e.metaKey &&
			!e.altKey
		) {
			const currentId = taskStore.activeTaskId;
			if (!currentId) return;
			e.preventDefault();
			const priorityMap: Record<string, Priority | null> = {
				"1": PRIORITY.HIGH as Priority,
				"2": PRIORITY.MEDIUM as Priority,
				"3": PRIORITY.LOW as Priority,
				"4": null,
			};
			void taskStore
				.updateTask({
					id: currentId,
					priority: priorityMap[e.key] ?? null,
				})
				.catch((err) => {
					console.error("Failed to update priority via shortcut:", err);
				});
			return;
		}

		// Delete / Backspace or '#' / 'd' -> delete selected task
		if (
			((e.key === "Backspace" || e.key === "Delete") && !e.altKey) ||
			(e.key === "#" && !e.ctrlKey && !e.metaKey && !e.altKey) ||
			(e.key === "d" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey)
		) {
			const currentId = taskStore.activeTaskId;
			if (!currentId) return;
			e.preventDefault();
			void taskStore.deleteTask(currentId).catch((err) => {
				console.error("Failed to delete task via shortcut:", err);
			});
			return;
		}

		// '?' -> open keyboard shortcuts modal
		if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
			e.preventDefault();
			uiStore.toggleShortcuts(true);
			return;
		}
	}
}

onMounted(() => {
	document.addEventListener("click", handleDocumentClick);
	window.addEventListener("keydown", handleGlobalKeyDown);
	loadVisibleTaskTags();
});

onUnmounted(() => {
	document.removeEventListener("click", handleDocumentClick);
	window.removeEventListener("keydown", handleGlobalKeyDown);
});

// Clear selections when active view or list changes
watch(
	() => [listStore.activeListId, listStore.activeView, filterStore.selectedTag],
	() => {
		selectedTaskIds.value.clear();
		closeDropdowns();
	},
);

// Keep tag cache populated for visible tasks (including expanded subtasks)
async function loadVisibleTaskTags() {
	const tasks = visibleTasks.value;
	const subtaskIds: string[] = [];
	for (const t of tasks) {
		if (uiStore.isTaskSubtasksExpanded(t.id)) {
			const subs = getSubtasks(t.id);
			for (const s of subs) {
				subtaskIds.push(s.id);
			}
		}
	}
	const allVisibleIds = [...tasks.map((t) => t.id), ...subtaskIds];
	const missingIds = allVisibleIds.filter((id) => !taskTagsCache.value.has(id));

	if (!missingIds.length) return;

	await Promise.all(
		missingIds.map(async (id) => {
			try {
				const detail = await getTaskDetail(id);
				if (detail?.tags) {
					taskTagsCache.value.set(id, detail.tags);
				} else {
					taskTagsCache.value.set(id, []);
				}
			} catch {
				taskTagsCache.value.set(id, []);
			}
		}),
	);
}

watch(
	() => [visibleTasks.value, uiStore.showSubtasksInline],
	() => {
		loadVisibleTaskTags();
	},
	{ immediate: true },
);

const subtaskCounts = computed(() => {
	const counts = new Map<string, { total: number; incomplete: number }>();
	for (const task of taskStore.allTasks) {
		if (task.parent_id && task.deleted_at === null) {
			const current = counts.get(task.parent_id) ?? {
				total: 0,
				incomplete: 0,
			};
			current.total += 1;
			if (!task.completed) {
				current.incomplete += 1;
			}
			counts.set(task.parent_id, current);
		}
	}
	return counts;
});

function getSubtaskCount(taskId: string) {
	return subtaskCounts.value.get(taskId) ?? null;
}

function getSubtasks(parentId: string) {
	return taskStore.allTasks
		.filter((t) => t.parent_id === parentId && t.deleted_at === null)
		.filter((t) => taskStore.includeCompleted || !t.completed)
		.sort((a, b) => {
			if (a.completed !== b.completed) {
				return a.completed ? 1 : -1;
			}
			return (a.position ?? 0) - (b.position ?? 0);
		});
}

// Inline quick-add subtask state
const addingSubtaskForTaskId = ref<string | null>(null);
const inlineSubtaskTitle = ref("");
const isAddingInlineSubtask = ref(false);

function startInlineAddSubtask(parentId: string) {
	addingSubtaskForTaskId.value = parentId;
	inlineSubtaskTitle.value = "";
}

function cancelInlineAddSubtask() {
	addingSubtaskForTaskId.value = null;
	inlineSubtaskTitle.value = "";
}

async function handleInlineAddSubtask(parentId: string, listId: string) {
	const title = inlineSubtaskTitle.value.trim();
	if (!title) {
		cancelInlineAddSubtask();
		return;
	}
	isAddingInlineSubtask.value = true;
	try {
		await taskStore.addTask({
			title,
			list_id: listId,
			parent_id: parentId,
		});
		inlineSubtaskTitle.value = "";
		addingSubtaskForTaskId.value = null;
	} catch (err) {
		console.error("Failed to add inline subtask:", err);
	} finally {
		isAddingInlineSubtask.value = false;
	}
}

function getTaskTags(taskId: string): Tag[] {
	return taskTagsCache.value.get(taskId) ?? [];
}

const allVisibleSelected = computed(() => {
	if (!visibleTasks.value.length) return false;
	return visibleTasks.value.every((t) => selectedTaskIds.value.has(t.id));
});

const someVisibleSelected = computed(() => {
	return (
		visibleTasks.value.some((t) => selectedTaskIds.value.has(t.id)) && !allVisibleSelected.value
	);
});

function handleToggleSelectTask(event: MouseEvent, taskId: string) {
	event.stopPropagation();
	const next = new Set(selectedTaskIds.value);
	if (next.has(taskId)) {
		next.delete(taskId);
	} else {
		next.add(taskId);
	}
	selectedTaskIds.value = next;
}

function selectAll() {
	selectedTaskIds.value = new Set(visibleTasks.value.map((t) => t.id));
	closeDropdowns();
}

function selectNone() {
	selectedTaskIds.value.clear();
	closeDropdowns();
}

function selectInvert() {
	const next = new Set<string>();
	for (const task of visibleTasks.value) {
		if (!selectedTaskIds.value.has(task.id)) {
			next.add(task.id);
		}
	}
	selectedTaskIds.value = next;
	closeDropdowns();
}

async function handleBatchComplete() {
	const ids = Array.from(selectedTaskIds.value);
	if (!ids.length) return;
	isBatchOperating.value = true;
	try {
		await taskStore.batchUpdate({
			task_ids: ids,
			completed: true,
		});
		selectedTaskIds.value.clear();
	} catch (err) {
		console.error("Failed to batch complete tasks:", err);
	} finally {
		isBatchOperating.value = false;
		closeDropdowns();
	}
}

async function handleBatchPostpone(days: number) {
	const ids = Array.from(selectedTaskIds.value);
	if (!ids.length) return;
	isBatchOperating.value = true;
	try {
		await taskStore.batchUpdate({
			task_ids: ids,
			postpone_days: days,
		});
	} catch (err) {
		console.error("Failed to batch postpone tasks:", err);
	} finally {
		isBatchOperating.value = false;
		closeDropdowns();
	}
}

async function handleBatchCustomDate() {
	const ids = Array.from(selectedTaskIds.value);
	const dateVal = customPostponeDate.value.trim();
	if (!ids.length || !dateVal) return;
	isBatchOperating.value = true;
	try {
		await taskStore.batchUpdate({
			task_ids: ids,
			due: dateVal,
		});
		customPostponeDate.value = "";
	} catch (err) {
		console.error("Failed to set custom date for tasks:", err);
	} finally {
		isBatchOperating.value = false;
		closeDropdowns();
	}
}

async function handleBatchSetPriority(priority: Priority | null) {
	const ids = Array.from(selectedTaskIds.value);
	if (!ids.length) return;
	isBatchOperating.value = true;
	try {
		await taskStore.batchUpdate({
			task_ids: ids,
			priority,
		});
	} catch (err) {
		console.error("Failed to batch set priority:", err);
	} finally {
		isBatchOperating.value = false;
		closeDropdowns();
	}
}

async function handleBatchMoveToList(listId: string) {
	const ids = Array.from(selectedTaskIds.value);
	if (!ids.length) return;
	isBatchOperating.value = true;
	try {
		await taskStore.batchUpdate({
			task_ids: ids,
			list_id: listId,
		});
		selectedTaskIds.value.clear();
	} catch (err) {
		console.error("Failed to batch move tasks to list:", err);
	} finally {
		isBatchOperating.value = false;
		closeDropdowns();
	}
}

async function handleBatchAssignTag(tagName: string) {
	const trimmed = tagName.trim();
	const ids = Array.from(selectedTaskIds.value);
	if (!ids.length || !trimmed) return;
	isBatchOperating.value = true;
	try {
		// Ensure tag exists in db before assigning (assignTag requires tag to exist)
		const existingTag = tagStore.tags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
		const tag = existingTag ?? (await tagStore.createTag(trimmed));
		await Promise.all(ids.map((id) => assignTag(id, tag.id)));
		await Promise.all(
			ids.map(async (id) => {
				try {
					const detail = await getTaskDetail(id);
					taskTagsCache.value.set(id, detail?.tags ?? []);
				} catch {
					// ignore
				}
			}),
		);
		await tagStore.fetchTags();
		await taskStore.fetchAllTasks();
		customNewTagName.value = "";
	} catch (err) {
		console.error("Failed to assign tag to tasks:", err);
	} finally {
		isBatchOperating.value = false;
		closeDropdowns();
	}
}

async function handleBatchRemoveTag(tagName: string) {
	const ids = Array.from(selectedTaskIds.value);
	if (!ids.length || !tagName.trim()) return;
	isBatchOperating.value = true;
	try {
		await Promise.all(ids.map((id) => removeTag(id, tagName.trim())));
		await Promise.all(
			ids.map(async (id) => {
				try {
					const detail = await getTaskDetail(id);
					taskTagsCache.value.set(id, detail?.tags ?? []);
				} catch {
					// ignore
				}
			}),
		);
		await tagStore.fetchTags();
		await taskStore.fetchAllTasks();
	} catch (err) {
		console.error("Failed to remove tag from tasks:", err);
	} finally {
		isBatchOperating.value = false;
		closeDropdowns();
	}
}

async function handleBatchDelete() {
	const ids = Array.from(selectedTaskIds.value);
	if (!ids.length) return;
	const confirmDelete = window.confirm(
		`Delete ${ids.length} selected task${ids.length > 1 ? "s" : ""}?`,
	);
	if (!confirmDelete) return;

	isBatchOperating.value = true;
	try {
		for (const id of ids) {
			await taskStore.deleteTask(id);
		}
		selectedTaskIds.value.clear();
	} catch (err) {
		console.error("Failed to delete selected tasks:", err);
	} finally {
		isBatchOperating.value = false;
		closeDropdowns();
	}
}

function handleTagPillClick(e: MouseEvent, tagName: string) {
	e.stopPropagation();
	filterStore.setSmartView(null);
	filterStore.setListFilter(null);
	listStore.setActiveView(null);
	listStore.setActiveList(null);
	filterStore.setTagFilter(tagName);
	taskStore.setActiveTask(null);
}

function getTodayDateStr(): string {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function getTomorrowDateStr(): string {
	const d = new Date();
	d.setDate(d.getDate() + 1);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function getYesterdayDateStr(): string {
	const d = new Date();
	d.setDate(d.getDate() - 1);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function getListName(listId: string): string {
	return listStore.lists.find((l) => l.id === listId)?.name ?? "";
}

async function handleAddTask() {
	const rawInput = newTaskTitle.value.trim();
	if (!rawInput) return;

	// Close smart dropdown if open
	isSmartMenuOpen.value = false;

	const knownListNames = listStore.lists.map((l) => l.name);
	const parsed = parseSmartAdd(rawInput, knownListNames);
	const title = parsed.title || rawInput;

	let due: string | null = parsed.due ?? null;
	if (!due) {
		if (listStore.activeView === "today") {
			due = getTodayDateStr();
		} else if (listStore.activeView === "tomorrow") {
			due = getTomorrowDateStr();
		} else if (listStore.activeView === "this_week") {
			due = getTodayDateStr();
		} else if (listStore.activeView === "overdue") {
			due = getYesterdayDateStr();
		}
	}

	// Determine target list:
	// 1. If parsed listName matches a list, prioritize that
	// 2. Otherwise activeList -> inboxList -> first list
	let targetListId: string | undefined;
	if (parsed.listName) {
		const matchedList = listStore.lists.find(
			(l) => l.name.toLowerCase() === parsed.listName?.toLowerCase(),
		);
		if (matchedList) {
			targetListId = matchedList.id;
		}
	}
	if (!targetListId) {
		targetListId = activeList.value?.id ?? listStore.inboxList?.id ?? listStore.lists[0]?.id;
	}
	if (!targetListId) return;

	try {
		isAdding.value = true;
		const created = await taskStore.addTask({
			title,
			list_id: targetListId,
			due,
			priority: parsed.priority ?? null,
		});

		// Tags to assign: from current filterStore (if any) + any parsed tags
		const tagsToAssign = new Set<string>();
		if (filterStore.selectedTag) {
			tagsToAssign.add(filterStore.selectedTag);
		}
		for (const tag of parsed.tags) {
			tagsToAssign.add(tag);
		}

		if (tagsToAssign.size > 0) {
			for (const tag of tagsToAssign) {
				try {
					await assignTag(created.id, tag);
				} catch (tagErr) {
					console.error(`Failed to assign tag ${tag} to created task:`, tagErr);
				}
			}
			(created as { tags?: unknown }).tags = Array.from(tagsToAssign);
			await taskStore.fetchAllTasks();
			await tagStore.fetchTags();
		}

		newTaskTitle.value = "";
		taskStore.setActiveTask(created.id);
	} catch (err) {
		console.error("Failed to add task:", err);
	} finally {
		isAdding.value = false;
	}
}

async function handleToggleComplete(event: MouseEvent, taskId: string) {
	event.stopPropagation();
	try {
		await taskStore.toggleTask(taskId);
		// Refresh tag cache if needed
		const detail = await getTaskDetail(taskId);
		if (detail?.tags) {
			taskTagsCache.value.set(taskId, detail.tags);
		}
	} catch (err) {
		console.error("Failed to toggle task:", err);
	}
}

async function handleDeleteTask(event: MouseEvent, taskId: string) {
	event.stopPropagation();
	try {
		selectedTaskIds.value.delete(taskId);
		await taskStore.deleteTask(taskId);
	} catch (err) {
		console.error("Failed to delete task:", err);
	}
}

function handleSelectTask(event: MouseEvent, taskId: string) {
	// If the user clicks while holding meta/ctrl key, toggle multi-selection
	if (event.metaKey || event.ctrlKey) {
		handleToggleSelectTask(event, taskId);
		return;
	}
	taskStore.setActiveTask(taskId);
	uiStore.toggleDetail(true);
}

function formatDue(dateStr: string | null): string {
	if (!dateStr) return "";
	try {
		const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
		if (y && m && d) {
			const date = new Date(y, m - 1, d);
			return date.toLocaleDateString(undefined, {
				month: "short",
				day: "numeric",
			});
		}
		const date = new Date(dateStr);
		return date.toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
		});
	} catch {
		return dateStr;
	}
}
</script>

<template>
	<section
		class="flex flex-col h-full bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 select-none overflow-hidden"
	>
		<!-- Header -->
		<div
			class="p-3 sm:p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2"
		>
			<div class="flex items-center gap-2.5 min-w-0">
				<!-- Mobile Drawer Toggle Hamburger -->
				<button
					type="button"
					@click="uiStore.toggleSidebar()"
					class="md:hidden p-1.5 -ml-1 rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
					title="Toggle Navigation Sidebar"
				>
					<Menu class="w-5 h-5" />
				</button>

				<div class="min-w-0">
					<h2 class="text-lg sm:text-xl font-bold truncate flex items-center gap-2">
						<!-- Tag Icon or View or List Icon -->
						<TagIcon v-if="filterStore.selectedTag" class="w-5 h-5 text-emerald-500 shrink-0" />
						<Inbox
							v-else-if="
								(activeList && activeList.name.toLowerCase() === 'inbox') ||
								listStore.activeView === 'inbox'
							"
							class="w-5 h-5 text-blue-500 shrink-0"
						/>
						<CheckSquare
							v-else-if="listStore.activeView === 'all'"
							class="w-5 h-5 text-indigo-500 shrink-0"
						/>
						<Calendar
							v-else-if="listStore.activeView === 'today'"
							class="w-5 h-5 text-emerald-500 shrink-0"
						/>
						<Sunrise
							v-else-if="listStore.activeView === 'tomorrow'"
							class="w-5 h-5 text-amber-500 shrink-0"
						/>
						<CalendarRange
							v-else-if="listStore.activeView === 'this_week'"
							class="w-5 h-5 text-purple-500 shrink-0"
						/>
						<AlertCircle
							v-else-if="listStore.activeView === 'overdue'"
							class="w-5 h-5 text-red-500 shrink-0"
						/>
						<Trash2
							v-else-if="listStore.activeView === 'trash'"
							class="w-5 h-5 text-rose-500 shrink-0"
						/>
						<button
							v-else-if="activeList"
							type="button"
							@click="openIconPickerForActiveList($event)"
							class="p-1 -ml-1 rounded-md hover:bg-zinc-200/70 dark:hover:bg-zinc-800 transition-colors shrink-0 cursor-pointer"
							title="Change list icon"
						>
							<component
								:is="getListIcon(activeList.icon)"
								class="w-5 h-5 shrink-0"
								:class="activeList.color ? '' : 'text-emerald-500'"
								:style="activeList.color ? { color: activeList.color } : {}"
							/>
						</button>

						<span>{{ headerTitle }}</span>
					</h2>
					<p v-if="hasActiveSelection" class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
						{{ taskStore.incompleteTasks.length }} pending,
						{{ taskStore.completedTasks.length }} completed
					</p>
				</div>
			</div>

			<!-- Right actions: Completed filter toggle + Detail panel toggle -->
			<div class="flex items-center gap-1.5 shrink-0">
				<button
					v-if="hasActiveSelection"
					type="button"
					@click="
						() => {
							const next = !taskStore.includeCompleted;
							taskStore.setIncludeCompleted(next);
							filterStore.setIncludeCompleted(next);
						}
					"
					class="flex items-center gap-1 text-xs px-2 sm:px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-600 dark:text-zinc-300 cursor-pointer"
					:title="
						taskStore.includeCompleted ? 'Hide completed tasks (⌘H)' : 'Show completed tasks (⌘H)'
					"
				>
					<ListFilter class="w-3.5 h-3.5" />
					<span class="hidden sm:inline">{{
						taskStore.includeCompleted ? "Showing all" : "Active only"
					}}</span>
				</button>

				<!-- Subtasks Display Toggle -->
				<button
					v-if="hasActiveSelection"
					type="button"
					@click="uiStore.toggleSubtasksInline()"
					:class="[
						'flex items-center gap-1 text-xs px-2 sm:px-2.5 py-1 rounded-md border transition-colors cursor-pointer',
						uiStore.showSubtasksInline
							? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-medium'
							: 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300',
					]"
					:title="
						uiStore.showSubtasksInline
							? 'Hide indented subtasks (show in detail view only) (⌘U)'
							: 'Expand subtasks indented under tasks in main view (⌘U)'
					"
					data-toggle-subtasks-button
				>
					<ListTree class="w-3.5 h-3.5" />
					<span class="hidden sm:inline">{{
						uiStore.showSubtasksInline ? "Subtasks: Expanded" : "Subtasks: Hidden"
					}}</span>
				</button>

				<!-- Toggle Right Detail Pane -->
				<button
					type="button"
					@click="uiStore.toggleDetail()"
					:title="uiStore.isDetailOpen ? 'Collapse task details' : 'Expand task details'"
					class="p-1 sm:p-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer"
				>
					<PanelRightClose v-if="uiStore.isDetailOpen" class="w-4 h-4" />
					<PanelRight v-else class="w-4 h-4" />
				</button>
			</div>
		</div>

		<!-- Sort Controls Toolbar -->
		<div
			v-if="hasActiveSelection"
			class="px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2 text-xs overflow-x-auto"
		>
			<span class="shrink-0 text-zinc-400 dark:text-zinc-500 font-medium select-none">Sort:</span>
			<div class="flex items-center gap-1 flex-wrap">
				<button
					v-for="opt in [
						{ field: 'created_at', label: 'Created' },
						{ field: 'priority', label: 'Priority' },
						{ field: 'due', label: 'Due Date' },
						{ field: 'list', label: 'List', listOnly: true },
						{ field: 'tags', label: 'Tags' },
					] as { field: SortFieldOption; label: string; listOnly?: boolean }[]"
					:key="opt.field"
					v-show="!opt.listOnly || !listStore.activeListId"
					type="button"
					@click="handleSortClick(opt.field)"
					:class="[
						'flex items-center gap-0.5 px-2 py-0.5 rounded-full border transition-colors cursor-pointer select-none',
						activeSortField === opt.field
							? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/60 dark:text-indigo-300'
							: 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-200',
					]"
				>
					{{ opt.label }}
					<ArrowUp
						v-if="activeSortField === opt.field && activeSortOrder === 'asc'"
						class="w-3 h-3"
					/>
					<ArrowDown
						v-else-if="activeSortField === opt.field && activeSortOrder === 'desc'"
						class="w-3 h-3"
					/>
				</button>
			</div>
		</div>

		<!-- Batch Action Toolbar (When tasks are available or selected) -->
		<div
			v-if="hasActiveSelection && visibleTasks.length > 0"
			class="px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/90 flex flex-wrap items-center justify-between gap-2 text-xs"
		>
			<div class="flex items-center gap-1.5 flex-wrap">
				<!-- Multi-select checkbox dropdown (Select All / None / Invert) -->
				<div class="relative" data-dropdown-container>
					<button
						type="button"
						@click="toggleDropdown('select')"
						class="flex items-center gap-1 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
						title="Selection menu"
					>
						<CheckSquare v-if="allVisibleSelected" class="w-3.5 h-3.5 text-emerald-600" />
						<MinusSquare v-else-if="someVisibleSelected" class="w-3.5 h-3.5 text-emerald-600" />
						<Square v-else class="w-3.5 h-3.5 text-zinc-400" />
						<ChevronDown class="w-3 h-3 opacity-60" />
					</button>

					<!-- Dropdown menu -->
					<div
						v-if="activeDropdown === 'select'"
						class="absolute left-0 top-full mt-1 w-36 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg z-30 space-y-0.5"
					>
						<button
							type="button"
							@click="selectAll"
							class="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 cursor-pointer"
						>
							Select All
						</button>
						<button
							type="button"
							@click="selectNone"
							class="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 cursor-pointer"
						>
							Select None
						</button>
						<button
							type="button"
							@click="selectInvert"
							class="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 cursor-pointer"
						>
							Invert Selection
						</button>
					</div>
				</div>

				<!-- Selected count label -->
				<span
					v-if="selectedTaskIds.size > 0"
					class="text-zinc-500 dark:text-zinc-400 font-medium px-1"
				>
					{{ selectedTaskIds.size }} selected
				</span>

				<!-- Action buttons (active only when >= 1 task selected) -->
				<template v-if="selectedTaskIds.size > 0">
					<!-- Mark Completed (✓) -->
					<button
						type="button"
						@click="handleBatchComplete"
						:disabled="isBatchOperating"
						class="flex items-center gap-1 px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors cursor-pointer disabled:opacity-50"
						title="Mark selected completed"
					>
						<Check class="w-3.5 h-3.5" />
						<span>Complete</span>
					</button>

					<!-- Postpone Menu (📅 ▾) -->
					<div class="relative" data-dropdown-container>
						<button
							type="button"
							@click="toggleDropdown('postpone')"
							:disabled="isBatchOperating"
							class="flex items-center gap-1 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer disabled:opacity-50"
							title="Postpone due date"
						>
							<CalendarPlus class="w-3.5 h-3.5 text-blue-500" />
							<span>Postpone</span>
							<ChevronDown class="w-3 h-3 opacity-60" />
						</button>

						<div
							v-if="activeDropdown === 'postpone'"
							class="absolute left-0 top-full mt-1 w-44 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg z-30 text-xs space-y-1"
						>
							<button
								type="button"
								@click="handleBatchPostpone(1)"
								class="w-full text-left px-3 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 cursor-pointer"
							>
								+1 Day (Tomorrow)
							</button>
							<button
								type="button"
								@click="handleBatchPostpone(2)"
								class="w-full text-left px-3 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 cursor-pointer"
							>
								+2 Days
							</button>
							<button
								type="button"
								@click="handleBatchPostpone(7)"
								class="w-full text-left px-3 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 cursor-pointer"
							>
								+1 Week
							</button>
							<div class="border-t border-zinc-100 dark:border-zinc-800 pt-1 px-3">
								<label class="block text-[10px] text-zinc-400 mb-0.5">Custom Date</label>
								<div class="flex items-center gap-1">
									<input
										type="date"
										v-model="customPostponeDate"
										class="w-full px-1.5 py-0.5 border border-zinc-200 dark:border-zinc-700 rounded text-xs bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200"
									/>
									<button
										type="button"
										@click="handleBatchCustomDate"
										:disabled="!customPostponeDate"
										class="px-1.5 py-0.5 bg-emerald-600 text-white rounded text-[10px] cursor-pointer disabled:opacity-40"
									>
										Set
									</button>
								</div>
							</div>
						</div>
					</div>

					<!-- Set Priority Menu (! ▾) -->
					<div class="relative" data-dropdown-container>
						<button
							type="button"
							@click="toggleDropdown('priority')"
							:disabled="isBatchOperating"
							class="flex items-center gap-1 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer disabled:opacity-50"
							title="Set priority"
						>
							<AlertCircle class="w-3.5 h-3.5 text-amber-500" />
							<span>Priority</span>
							<ChevronDown class="w-3 h-3 opacity-60" />
						</button>

						<div
							v-if="activeDropdown === 'priority'"
							class="absolute left-0 top-full mt-1 w-36 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg z-30 text-xs space-y-0.5"
						>
							<button
								type="button"
								@click="handleBatchSetPriority(PRIORITY.HIGH)"
								class="w-full flex items-center justify-between px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-red-600 dark:text-red-400 font-medium cursor-pointer"
							>
								<span>Priority 1</span>
								<span class="text-[10px] px-1 rounded bg-red-100 dark:bg-red-950">P1</span>
							</button>
							<button
								type="button"
								@click="handleBatchSetPriority(PRIORITY.MEDIUM)"
								class="w-full flex items-center justify-between px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-amber-600 dark:text-amber-400 font-medium cursor-pointer"
							>
								<span>Priority 2</span>
								<span class="text-[10px] px-1 rounded bg-amber-100 dark:bg-amber-950">P2</span>
							</button>
							<button
								type="button"
								@click="handleBatchSetPriority(PRIORITY.LOW)"
								class="w-full flex items-center justify-between px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-blue-600 dark:text-blue-400 font-medium cursor-pointer"
							>
								<span>Priority 3</span>
								<span class="text-[10px] px-1 rounded bg-blue-100 dark:bg-blue-950">P3</span>
							</button>
							<div class="border-t border-zinc-100 dark:border-zinc-800 my-1"></div>
							<button
								type="button"
								@click="handleBatchSetPriority(null)"
								class="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 cursor-pointer"
							>
								None
							</button>
						</div>
					</div>

					<!-- Move to List (📋 ▾) -->
					<div class="relative" data-dropdown-container>
						<button
							type="button"
							@click="toggleDropdown('list')"
							:disabled="isBatchOperating"
							class="flex items-center gap-1 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer disabled:opacity-50"
							title="Move to list"
						>
							<FolderInput class="w-3.5 h-3.5 text-indigo-500" />
							<span>List</span>
							<ChevronDown class="w-3 h-3 opacity-60" />
						</button>

						<div
							v-if="activeDropdown === 'list'"
							class="absolute left-0 top-full mt-1 w-44 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg z-30 text-xs max-h-48 overflow-y-auto space-y-0.5"
						>
							<button
								v-for="list in listStore.lists"
								:key="list.id"
								type="button"
								@click="handleBatchMoveToList(list.id)"
								class="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 text-left cursor-pointer"
							>
								<component
									:is="getListIcon(list.icon)"
									class="w-3.5 h-3.5 shrink-0"
									:class="list.color ? '' : 'text-zinc-500 dark:text-zinc-400'"
									:style="list.color ? { color: list.color } : {}"
								/>
								<span class="truncate">{{ list.name }}</span>
							</button>
						</div>
					</div>

					<!-- Add/Remove Tags (🏷 ▾) -->
					<div class="relative" data-dropdown-container>
						<button
							type="button"
							@click="toggleDropdown('tag')"
							:disabled="isBatchOperating"
							class="flex items-center gap-1 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer disabled:opacity-50"
							title="Tags"
						>
							<Tags class="w-3.5 h-3.5 text-purple-500" />
							<span>Tags</span>
							<ChevronDown class="w-3 h-3 opacity-60" />
						</button>

						<div
							v-if="activeDropdown === 'tag'"
							class="absolute left-0 top-full mt-1 w-52 p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg z-30 text-xs space-y-2"
						>
							<div class="flex items-center gap-1">
								<input
									type="text"
									v-model="customNewTagName"
									placeholder="Tag name..."
									@keyup.enter="handleBatchAssignTag(customNewTagName)"
									class="w-full px-2 py-1 border border-zinc-200 dark:border-zinc-700 rounded text-xs bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200"
								/>
								<button
									type="button"
									@click="handleBatchAssignTag(customNewTagName)"
									:disabled="!customNewTagName.trim()"
									class="px-2 py-1 bg-emerald-600 text-white rounded text-xs cursor-pointer disabled:opacity-40"
								>
									Add
								</button>
							</div>

							<div
								v-if="tagStore.tagsWithCounts.length > 0"
								class="border-t border-zinc-100 dark:border-zinc-800 pt-1.5 max-h-36 overflow-y-auto space-y-1"
							>
								<div class="text-[10px] uppercase font-semibold text-zinc-400">Existing tags</div>
								<div
									v-for="tag in tagStore.tagsWithCounts"
									:key="tag.id"
									class="flex items-center justify-between gap-1 px-1.5 py-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
								>
									<span class="truncate text-zinc-700 dark:text-zinc-300">#{{ tag.name }}</span>
									<div class="flex items-center gap-1 shrink-0">
										<button
											type="button"
											@click="handleBatchAssignTag(tag.name)"
											class="px-1.5 py-0.2 rounded bg-emerald-50 dark:bg-emerald-950 text-emerald-600 text-[10px] hover:bg-emerald-100 cursor-pointer"
										>
											+
										</button>
										<button
											type="button"
											@click="handleBatchRemoveTag(tag.name)"
											class="px-1.5 py-0.2 rounded bg-rose-50 dark:bg-rose-950 text-rose-600 text-[10px] hover:bg-rose-100 cursor-pointer"
										>
											-
										</button>
									</div>
								</div>
							</div>
						</div>
					</div>

					<!-- Delete / Move to Trash -->
					<button
						type="button"
						@click="handleBatchDelete"
						:disabled="isBatchOperating"
						class="flex items-center gap-1 px-2 py-1 rounded border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors cursor-pointer disabled:opacity-50"
						title="Delete selected tasks"
					>
						<Trash2 class="w-3.5 h-3.5" />
						<span>Delete</span>
					</button>
				</template>
			</div>
		</div>

		<!-- Quick Add Input & Smart Add Dropdown -->
		<div
			v-if="hasActiveSelection"
			class="p-3 border-b border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/50 relative"
		>
			<form @submit.prevent="handleAddTask" class="relative flex items-center">
				<input
					ref="quickAddInputRef"
					v-model="newTaskTitle"
					@input="updateSmartDropdown"
					@click="updateSmartDropdown"
					@keydown="handleQuickAddKeydown"
					type="text"
					data-quick-add-input
					:placeholder="quickAddPlaceholder"
					:disabled="isAdding"
					class="w-full pl-3 pr-10 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 shadow-2xs"
				/>
				<button
					type="submit"
					:disabled="isAdding || !newTaskTitle.trim()"
					class="absolute right-2 p-1 text-zinc-400 hover:text-emerald-600 disabled:opacity-30 disabled:hover:text-zinc-400 transition-colors cursor-pointer"
					title="Add task"
				>
					<CornerDownLeft class="w-4 h-4" />
				</button>
			</form>

			<!-- Smart Add Suggestions Dropdown -->
			<div
				v-if="isSmartMenuOpen && smartSuggestions.length > 0"
				class="absolute left-3 right-3 top-full mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-40 max-h-60 overflow-y-auto py-1 animate-in fade-in zoom-in-95 duration-100"
			>
				<div
					class="px-2 py-1 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800"
				>
					<span v-if="activeSmartToken?.prefix === '#'">Tags & Lists (#)</span>
					<span v-else-if="activeSmartToken?.prefix === '^'">Due Dates (^)</span>
					<span v-else-if="activeSmartToken?.prefix === '!'">Priority (!)</span>
					<span class="text-[10px] font-normal normal-case text-zinc-400"
						>↑↓ to navigate, Enter or Tab to pick</span
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
							<!-- Icon for suggestion type -->
							<TagIcon v-if="item.type === 'tag'" class="w-3.5 h-3.5 text-purple-500 shrink-0" />
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
								:class="[
									'w-3.5 h-3.5 shrink-0',
									item.insertValue === '1'
										? 'text-red-500'
										: item.insertValue === '2'
											? 'text-amber-500'
											: item.insertValue === '3'
												? 'text-blue-500'
												: 'text-zinc-400',
								]"
							/>
							<span class="truncate">{{ item.label }}</span>
							<span v-if="item.description" class="text-[10px] text-zinc-400 truncate">
								{{ item.description }}
							</span>
						</div>
						<span
							v-if="item.badge"
							class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 shrink-0 ml-2"
						>
							{{ item.badge }}
						</span>
					</button>
				</div>
			</div>

			<!-- Quick Shortcut Hints Toolbar below input -->
			<div
				class="flex items-center gap-2 mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500 select-none"
			>
				<span class="text-[10px] uppercase font-semibold tracking-wider text-zinc-400/80"
					>Shortcuts:</span
				>
				<button
					type="button"
					@click="appendSmartPrefix('#')"
					class="hover:text-purple-600 dark:hover:text-purple-400 font-mono flex items-center gap-0.5 cursor-pointer"
					title="Add tag or list"
				>
					<span class="font-bold">#</span>tag
				</button>
				<span>•</span>
				<button
					type="button"
					@click="appendSmartPrefix('^')"
					class="hover:text-blue-600 dark:hover:text-blue-400 font-mono flex items-center gap-0.5 cursor-pointer"
					title="Add due date"
				>
					<span class="font-bold">^</span>due
				</button>
				<span>•</span>
				<button
					type="button"
					@click="appendSmartPrefix('!')"
					class="hover:text-red-600 dark:hover:text-red-400 font-mono flex items-center gap-0.5 cursor-pointer"
					title="Set priority (1, 2, 3)"
				>
					<span class="font-bold">!</span>priority
				</button>
			</div>
		</div>

		<!-- Tasks List Container -->
		<div class="flex-1 overflow-y-auto p-3 space-y-1">
			<!-- Empty state (no list/view selected) -->
			<div
				v-if="!hasActiveSelection"
				class="h-full flex flex-col items-center justify-center px-6 py-10 text-center"
			>
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

			<!-- Loading state -->
			<div
				v-else-if="taskStore.loading && taskStore.tasks.length === 0"
				class="py-8 text-center text-sm text-zinc-400"
			>
				Loading tasks...
			</div>

			<!-- Empty state: Active list/view has no tasks -->
			<div
				v-else-if="visibleTasks.length === 0"
				class="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-400 dark:text-zinc-500"
			>
				<CheckCircle2 class="w-12 h-12 mb-3 text-emerald-500/40 stroke-1" />
				<p class="text-sm font-medium">All clear!</p>
				<p class="text-xs mt-1">
					{{
						listStore.activeView === "overdue"
							? "No overdue tasks. You're all caught up!"
							: "No tasks to display. Add one using the input above."
					}}
				</p>
			</div>

			<!-- Tasks list -->
			<div v-for="task in visibleTasks" :key="task.id" class="space-y-1">
				<div
					:data-task-id="task.id"
					@click="handleSelectTask($event, task.id)"
					@contextmenu="handleTaskContextMenu($event, task.id)"
					class="group flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border text-sm cursor-pointer transition-all"
					:class="[
						task.id === taskStore.activeTaskId
							? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-700 shadow-2xs'
							: selectedTaskIds.has(task.id)
								? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/60'
								: 'border-zinc-100 dark:border-zinc-800/80 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:border-zinc-200 dark:hover:border-zinc-700',
					]"
				>
					<!-- Task Select Box, Complete Checkbox & Title -->
					<div class="flex items-center gap-2.5 min-w-0 flex-1">
						<!-- Multi-selection checkbox -->
						<button
							type="button"
							@click="handleToggleSelectTask($event, task.id)"
							class="shrink-0 p-0.5 rounded text-zinc-300 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors cursor-pointer"
							:class="{
								'opacity-100 text-emerald-600 dark:text-emerald-500': selectedTaskIds.has(task.id),
								'opacity-0 group-hover:opacity-100': !selectedTaskIds.has(task.id),
							}"
							:title="selectedTaskIds.has(task.id) ? 'Deselect task' : 'Select task'"
						>
							<CheckSquare
								v-if="selectedTaskIds.has(task.id)"
								class="w-4 h-4 text-emerald-600 dark:text-emerald-500"
							/>
							<Square v-else class="w-4 h-4" />
						</button>

						<!-- Task Complete Toggle -->
						<button
							type="button"
							@click="handleToggleComplete($event, task.id)"
							class="shrink-0 text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer"
							:title="task.completed ? 'Mark incomplete' : 'Mark complete'"
						>
							<CheckCircle2
								v-if="task.completed"
								class="w-5 h-5 text-emerald-600 dark:text-emerald-500"
							/>
							<Circle
								v-else
								class="w-5 h-5 text-zinc-300 dark:text-zinc-600 hover:text-emerald-500"
							/>
						</button>

						<!-- Title and inline Tag Pills -->
						<div class="min-w-0 flex-1 flex flex-wrap items-center gap-1.5">
							<span
								class="text-sm font-medium truncate"
								:class="[
									task.completed
										? 'line-through text-zinc-400 dark:text-zinc-500 font-normal'
										: 'text-zinc-800 dark:text-zinc-200',
								]"
							>
								{{ task.title }}
							</span>

							<!-- Tag Pills on Task Row -->
							<div
								v-if="getTaskTags(task.id).length > 0"
								class="flex items-center gap-1 flex-wrap shrink-0"
							>
								<button
									v-for="tag in getTaskTags(task.id)"
									:key="tag.id"
									type="button"
									@click="handleTagPillClick($event, tag.name)"
									class="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80 hover:bg-emerald-100 transition-colors cursor-pointer"
								>
									<span class="opacity-60">#</span>
									<span>{{ tag.name }}</span>
								</button>
							</div>
						</div>
					</div>

					<!-- Task Metadata Badges & Actions -->
					<div class="flex items-center gap-2 shrink-0">
						<!-- Subtask count badge & per-task expand/collapse toggle -->
						<button
							v-if="getSubtaskCount(task.id) && getSubtaskCount(task.id)!.total > 0"
							type="button"
							@click.stop="uiStore.toggleTaskSubtasks(task.id)"
							class="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border transition-colors cursor-pointer"
							:class="[
								uiStore.isTaskSubtasksExpanded(task.id)
									? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
									: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700/60 hover:bg-zinc-200 dark:hover:bg-zinc-700',
							]"
							:title="
								uiStore.isTaskSubtasksExpanded(task.id)
									? 'Click to collapse subtasks'
									: `${getSubtaskCount(task.id)!.incomplete} of ${getSubtaskCount(task.id)!.total} subtasks remaining. Click to expand.`
							"
							:data-subtask-toggle-id="task.id"
						>
							<ChevronDown
								v-if="uiStore.isTaskSubtasksExpanded(task.id)"
								class="w-3 h-3 text-indigo-500 shrink-0"
							/>
							<ChevronRight v-else class="w-3 h-3 text-zinc-400 shrink-0" />
							<ListTree class="w-3 h-3 text-zinc-400 shrink-0" />
							<span
								>{{ getSubtaskCount(task.id)!.total - getSubtaskCount(task.id)!.incomplete }}/{{
									getSubtaskCount(task.id)!.total
								}}</span
							>
						</button>

						<!-- List badge (shown in Views) -->
						<span
							v-if="isView && getListName(task.list_id)"
							class="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded"
						>
							{{ getListName(task.list_id) }}
						</span>

						<!-- Priority indicator badge / border color (P1, P2, P3, None) -->
						<span
							v-if="task.priority === PRIORITY.HIGH"
							class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900"
						>
							P1
						</span>
						<span
							v-else-if="task.priority === PRIORITY.MEDIUM"
							class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900"
						>
							P2
						</span>
						<span
							v-else-if="task.priority === PRIORITY.LOW"
							class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900"
						>
							P3
						</span>

						<!-- Due date badge -->
						<span
							v-if="task.due"
							class="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded"
							:class="
								!task.completed && isOverdue(task.due)
									? 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950'
									: 'text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800'
							"
						>
							<Calendar class="w-3 h-3" />
							<span>{{ formatDue(task.due) }}</span>
						</span>

						<!-- Delete action -->
						<button
							type="button"
							title="Delete task"
							class="opacity-0 group-hover:opacity-100 hover:text-red-500 p-1 text-zinc-400 transition-opacity cursor-pointer"
							@click="handleDeleteTask($event, task.id)"
						>
							<Trash2 class="w-3.5 h-3.5" />
						</button>
					</div>
				</div>

				<!-- Indented subtasks under parent task -->
				<div
					v-if="uiStore.isTaskSubtasksExpanded(task.id)"
					class="ml-6 sm:ml-8 pl-3 border-l-2 border-zinc-200 dark:border-zinc-800 space-y-1 my-1"
					data-subtasks-container
				>
					<!-- Subtask rows -->
					<div
						v-for="subtask in getSubtasks(task.id)"
						:key="subtask.id"
						:data-task-id="subtask.id"
						@click="handleSelectTask($event, subtask.id)"
						@contextmenu="handleTaskContextMenu($event, subtask.id)"
						class="group/sub flex items-center justify-between gap-2.5 px-2.5 py-1.5 rounded-md border text-xs cursor-pointer transition-all"
						:class="[
							subtask.id === taskStore.activeTaskId
								? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-700 shadow-2xs'
								: selectedTaskIds.has(subtask.id)
									? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/60'
									: 'border-zinc-100 dark:border-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 hover:border-zinc-200 dark:hover:border-zinc-700 bg-zinc-50/40 dark:bg-zinc-900/40',
						]"
					>
						<!-- Left: Select box, Checkbox & Title -->
						<div class="flex items-center gap-2 min-w-0 flex-1">
							<!-- Multi-selection checkbox -->
							<button
								type="button"
								@click="handleToggleSelectTask($event, subtask.id)"
								class="shrink-0 p-0.5 rounded text-zinc-300 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors cursor-pointer"
								:class="{
									'opacity-100 text-emerald-600 dark:text-emerald-500': selectedTaskIds.has(
										subtask.id,
									),
									'opacity-0 group-hover/sub:opacity-100': !selectedTaskIds.has(subtask.id),
								}"
								:title="selectedTaskIds.has(subtask.id) ? 'Deselect subtask' : 'Select subtask'"
							>
								<CheckSquare
									v-if="selectedTaskIds.has(subtask.id)"
									class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-500"
								/>
								<Square v-else class="w-3.5 h-3.5" />
							</button>

							<!-- Subtask Complete Toggle -->
							<button
								type="button"
								@click="handleToggleComplete($event, subtask.id)"
								class="shrink-0 text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer"
								:title="subtask.completed ? 'Mark incomplete' : 'Mark complete'"
							>
								<CheckCircle2
									v-if="subtask.completed"
									class="w-4 h-4 text-emerald-600 dark:text-emerald-500"
								/>
								<Circle
									v-else
									class="w-4 h-4 text-zinc-300 dark:text-zinc-600 hover:text-emerald-500"
								/>
							</button>

							<!-- Title and inline Tag Pills -->
							<div class="min-w-0 flex-1 flex flex-wrap items-center gap-1.5">
								<span
									class="truncate font-normal select-text"
									:class="[
										subtask.completed
											? 'line-through text-zinc-400 dark:text-zinc-500 font-normal'
											: 'text-zinc-700 dark:text-zinc-300',
									]"
								>
									{{ subtask.title }}
								</span>

								<!-- Tag Pills on Subtask Row -->
								<div
									v-if="getTaskTags(subtask.id).length > 0"
									class="flex items-center gap-1 flex-wrap shrink-0"
								>
									<button
										v-for="tag in getTaskTags(subtask.id)"
										:key="tag.id"
										type="button"
										@click="handleTagPillClick($event, tag.name)"
										class="inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.2 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80 hover:bg-emerald-100 transition-colors cursor-pointer"
									>
										<span class="opacity-60">#</span>
										<span>{{ tag.name }}</span>
									</button>
								</div>
							</div>
						</div>

						<!-- Right: Priority, Due Date, Delete button -->
						<div class="flex items-center gap-1.5 shrink-0">
							<!-- Priority indicator badge -->
							<span
								v-if="subtask.priority === PRIORITY.HIGH"
								class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900"
							>
								P1
							</span>
							<span
								v-else-if="subtask.priority === PRIORITY.MEDIUM"
								class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900"
							>
								P2
							</span>
							<span
								v-else-if="subtask.priority === PRIORITY.LOW"
								class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900"
							>
								P3
							</span>

							<!-- Due date badge -->
							<span
								v-if="subtask.due"
								class="flex items-center gap-0.5 text-[10px] px-1.5 py-0.2 rounded"
								:class="
									!subtask.completed && isOverdue(subtask.due)
										? 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950'
										: 'text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800'
								"
							>
								<Calendar class="w-2.5 h-2.5" />
								<span>{{ formatDue(subtask.due) }}</span>
							</span>

							<!-- Delete action -->
							<button
								type="button"
								title="Delete subtask"
								class="opacity-0 group-hover/sub:opacity-100 hover:text-red-500 p-0.5 text-zinc-400 transition-opacity cursor-pointer"
								@click="handleDeleteTask($event, subtask.id)"
							>
								<Trash2 class="w-3 h-3" />
							</button>
						</div>
					</div>

					<!-- Empty active subtasks notice if all completed and hiding completed -->
					<div
						v-if="getSubtasks(task.id).length === 0 && addingSubtaskForTaskId !== task.id"
						class="text-[11px] text-zinc-400 italic py-0.5 px-2"
					>
						No active subtasks
					</div>

					<!-- Inline quick-add subtask form or button -->
					<div class="pt-0.5">
						<form
							v-if="addingSubtaskForTaskId === task.id"
							@submit.prevent="handleInlineAddSubtask(task.id, task.list_id)"
							class="flex items-center gap-1.5"
						>
							<input
								v-model="inlineSubtaskTitle"
								type="text"
								placeholder="Add a subtask..."
								autofocus
								class="flex-1 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 text-zinc-800 dark:text-zinc-200 focus:outline-hidden focus:border-emerald-500"
								@keydown.esc="cancelInlineAddSubtask"
							/>
							<button
								type="submit"
								:disabled="!inlineSubtaskTitle.trim() || isAddingInlineSubtask"
								class="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded text-xs cursor-pointer transition-colors shrink-0"
							>
								Add
							</button>
							<button
								type="button"
								@click="cancelInlineAddSubtask"
								class="px-2 py-1 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 text-xs cursor-pointer shrink-0"
							>
								Cancel
							</button>
						</form>

						<button
							v-else
							type="button"
							@click="startInlineAddSubtask(task.id)"
							class="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 py-0.5 px-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer"
						>
							<Plus class="w-3 h-3" />
							<span>Add subtask</span>
						</button>
					</div>
				</div>
			</div>
		</div>
		<!-- Task Context Menu: Postpone Actions -->
		<div
			v-if="contextMenu.visible"
			class="fixed z-50 w-48 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl text-xs space-y-0.5"
			:style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
			@click.stop
		>
			<div class="px-3 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
				Postpone
			</div>
			<button
				type="button"
				@click="handleContextMenuPostpone(1)"
				class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
			>
				<Calendar class="w-3.5 h-3.5 text-zinc-400" />
				<span>+1 Day (Tomorrow)</span>
			</button>
			<button
				type="button"
				@click="handleContextMenuPostpone(2)"
				class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
			>
				<CalendarPlus class="w-3.5 h-3.5 text-zinc-400" />
				<span>+2 Days</span>
			</button>
			<button
				type="button"
				@click="handleContextMenuPostpone(7)"
				class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
			>
				<CalendarRange class="w-3.5 h-3.5 text-zinc-400" />
				<span>+1 Week</span>
			</button>
		</div>

		<!-- List Header Icon Picker Popover -->
		<IconPickerPopover
			:is-open="isHeaderIconPickerOpen"
			:selected-icon="activeList?.icon ?? DEFAULT_LIST_ICON"
			:target-rect="headerIconPickerTargetRect"
			title="Choose List Icon"
			@select="handleHeaderIconSelected"
			@close="isHeaderIconPickerOpen = false"
		/>
	</section>
</template>
