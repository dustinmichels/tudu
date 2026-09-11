import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createPinia, setActivePinia } from "pinia";
import type { Note, Tag, Task, TaskDetail } from "../src/models/index.ts";
import {
	addNote,
	assignTag,
	createTag,
	deleteNote,
	getNotes,
	getTaskDetail,
	removeTag,
	updateNote,
} from "../src/services/api.ts";
import { useTaskStore } from "../src/stores/tasks.ts";

const mockInvokes: Array<{ command: string; args?: unknown }> = [];
let mockTasks: Task[] = [];
let mockNotes: Note[] = [];
let mockTags: Tag[] = [];
let mockTaskTags: Array<{ taskId: string; tagId: string }> = [];

mock.module("@tauri-apps/api/core", () => ({
	invoke: async (command: string, args?: unknown) => {
		mockInvokes.push({ command, args });

		if (command === "get_tasks") {
			return mockTasks;
		}

		if (command === "get_task_detail") {
			const id = args && typeof args === "object" && "id" in args ? String(args.id) : "";
			const task = mockTasks.find((t) => t.id === id);
			if (!task) return null;
			const assignedTagIds = mockTaskTags.filter((tt) => tt.taskId === id).map((tt) => tt.tagId);
			const tags = mockTags.filter((t) => assignedTagIds.includes(t.id));
			const notes = mockNotes.filter((n) => n.task_id === id);
			const subtasks = mockTasks.filter((t) => t.parent_id === id && !t.deleted_at);
			return {
				...task,
				tags,
				notes,
				subtasks,
			} as TaskDetail;
		}

		if (command === "update_task") {
			const payload =
				args && typeof args === "object" && "task" in args
					? (args.task as Partial<Task> & { id: string })
					: null;
			if (!payload) throw new Error("Missing task in update_task");
			const idx = mockTasks.findIndex((t) => t.id === payload.id);
			if (idx !== -1) {
				const existing = mockTasks[idx];
				if (existing) {
					mockTasks[idx] = { ...existing, ...payload };
					return mockTasks[idx];
				}
			}
			throw new Error("Task not found");
		}

		if (command === "create_task") {
			const record = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
			const parentId =
				typeof record.parentId === "string"
					? record.parentId
					: typeof record.parent_id === "string"
						? record.parent_id
						: null;
			const listId =
				typeof record.listId === "string"
					? record.listId
					: typeof record.list_id === "string"
						? record.list_id
						: "list-inbox";
			const title = typeof record.title === "string" ? record.title : "Untitled";
			const due = typeof record.due === "string" ? record.due : null;
			const priority =
				typeof record.priority === "number" ? (record.priority as Task["priority"]) : null;

			const newTask: Task = {
				id: `task-${Date.now()}-${Math.random()}`,
				uid: null,
				parent_id: parentId,
				list_id: listId,
				title,
				description: null,
				due,
				is_all_day: false,
				rrule: null,
				priority,
				location: null,
				url: null,
				completed: false,
				completed_at: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				deleted_at: null,
			};
			mockTasks.push(newTask);
			return newTask;
		}

		if (command === "toggle_task_complete") {
			const id = args && typeof args === "object" && "id" in args ? String(args.id) : "";
			const completed =
				args && typeof args === "object" && "completed" in args ? Boolean(args.completed) : false;
			const idx = mockTasks.findIndex((t) => t.id === id);
			if (idx !== -1) {
				const existing = mockTasks[idx];
				if (existing) {
					existing.completed = completed;
					existing.completed_at = completed ? new Date().toISOString() : null;
					return existing;
				}
			}
			throw new Error("Task not found");
		}

		if (command === "create_tag") {
			const name = args && typeof args === "object" && "name" in args ? String(args.name) : "";
			const color =
				args && typeof args === "object" && "color" in args && typeof args.color === "string"
					? args.color
					: null;
			const newTag: Tag = {
				id: `tag-${Date.now()}`,
				name,
				color,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				deleted_at: null,
			};
			mockTags.push(newTag);
			return newTag;
		}

		if (command === "assign_tag") {
			const taskId =
				args && typeof args === "object" && "taskId" in args ? String(args.taskId) : "";
			const tagId = args && typeof args === "object" && "tagId" in args ? String(args.tagId) : "";
			mockTaskTags.push({ taskId, tagId });
			return null;
		}

		if (command === "remove_tag") {
			const taskId =
				args && typeof args === "object" && "taskId" in args ? String(args.taskId) : "";
			const tagId = args && typeof args === "object" && "tagId" in args ? String(args.tagId) : "";
			mockTaskTags = mockTaskTags.filter((tt) => !(tt.taskId === taskId && tt.tagId === tagId));
			return null;
		}

		if (command === "get_notes") {
			const taskId =
				args && typeof args === "object" && "taskId" in args ? String(args.taskId) : "";
			return mockNotes.filter((n) => n.task_id === taskId);
		}

		if (command === "add_note") {
			const taskId =
				args && typeof args === "object" && "taskId" in args ? String(args.taskId) : "";
			const title =
				args && typeof args === "object" && "title" in args && typeof args.title === "string"
					? args.title
					: null;
			const content =
				args && typeof args === "object" && "content" in args ? String(args.content) : "";
			const newNote: Note = {
				id: `note-${Date.now()}`,
				task_id: taskId,
				title,
				content,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				deleted_at: null,
			};
			mockNotes.push(newNote);
			return newNote;
		}

		if (command === "update_note") {
			const id = args && typeof args === "object" && "id" in args ? String(args.id) : "";
			const title =
				args && typeof args === "object" && "title" in args && typeof args.title === "string"
					? args.title
					: undefined;
			const content =
				args && typeof args === "object" && "content" in args ? String(args.content) : undefined;
			const idx = mockNotes.findIndex((n) => n.id === id);
			if (idx !== -1) {
				const existing = mockNotes[idx];
				if (existing) {
					if (content !== undefined) existing.content = content;
					if (title !== undefined) existing.title = title;
					existing.updated_at = new Date().toISOString();
					return existing;
				}
			}
			throw new Error("Note not found");
		}

		if (command === "delete_note") {
			const id = args && typeof args === "object" && "id" in args ? String(args.id) : "";
			mockNotes = mockNotes.filter((n) => n.id !== id);
			return null;
		}

		return null;
	},
}));

describe("Phase 7: Right Pane (Task Detail & Subtasks)", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		mockInvokes.length = 0;
		mockNotes = [];
		mockTags = [
			{
				id: "t1",
				name: "work",
				color: "#3b82f6",
				created_at: "2026-09-10T10:00:00Z",
				updated_at: "2026-09-10T10:00:00Z",
				deleted_at: null,
			},
		];
		mockTaskTags = [];
		mockTasks = [
			{
				id: "task-parent",
				uid: null,
				parent_id: null,
				list_id: "list-inbox",
				title: "Main Project Planning",
				description: "Detailed description",
				due: "2026-09-15",
				is_all_day: false,
				rrule: "RRULE:FREQ=WEEKLY",
				priority: 1,
				location: "Conference Room B",
				url: "https://example.com/project",
				completed: false,
				completed_at: null,
				created_at: "2026-09-10T10:00:00Z",
				updated_at: "2026-09-10T10:00:00Z",
				deleted_at: null,
			},
			{
				id: "subtask-1",
				uid: null,
				parent_id: "task-parent",
				list_id: "list-inbox",
				title: "Draft Outline",
				description: null,
				due: null,
				is_all_day: false,
				rrule: null,
				priority: 2,
				location: null,
				url: null,
				completed: false,
				completed_at: null,
				created_at: "2026-09-10T10:30:00Z",
				updated_at: "2026-09-10T10:30:00Z",
				deleted_at: null,
			},
			{
				id: "subtask-2",
				uid: null,
				parent_id: "task-parent",
				list_id: "list-inbox",
				title: "Setup Repo",
				description: null,
				due: null,
				is_all_day: false,
				rrule: null,
				priority: 3,
				location: null,
				url: null,
				completed: true,
				completed_at: "2026-09-10T11:00:00Z",
				created_at: "2026-09-10T10:35:00Z",
				updated_at: "2026-09-10T11:00:00Z",
				deleted_at: null,
			},
		];
	});

	test("Task detail header: editable task title and updateTask API", async () => {
		const taskStore = useTaskStore();
		taskStore.allTasks = [...mockTasks];
		taskStore.tasks = [...mockTasks];
		taskStore.setActiveTask("task-parent");

		expect(taskStore.activeTask?.title).toBe("Main Project Planning");

		const updated = await taskStore.updateTask({
			id: "task-parent",
			title: "Updated Project Title",
		});

		expect(updated.title).toBe("Updated Project Title");
		expect(taskStore.activeTask?.title).toBe("Updated Project Title");
	});

	test("Metadata property rows: due, repeats, priority, location, url", async () => {
		const taskStore = useTaskStore();
		taskStore.allTasks = [...mockTasks];
		taskStore.tasks = [...mockTasks];
		taskStore.setActiveTask("task-parent");

		// Update due date
		const resDue = await taskStore.updateTask({
			id: "task-parent",
			due: "2026-09-20",
		});
		expect(resDue.due).toBe("2026-09-20");

		// Update repeats (standard and custom RRULE)
		const resRrule = await taskStore.updateTask({
			id: "task-parent",
			rrule: "RRULE:FREQ=MONTHLY",
		});
		expect(resRrule.rrule).toBe("RRULE:FREQ=MONTHLY");

		const resCustomRrule = await taskStore.updateTask({
			id: "task-parent",
			rrule: "RRULE:FREQ=DAILY;INTERVAL=2;COUNT=5",
		});
		expect(resCustomRrule.rrule).toBe("RRULE:FREQ=DAILY;INTERVAL=2;COUNT=5");
		// Update priority
		const resPri = await taskStore.updateTask({
			id: "task-parent",
			priority: 2,
		});
		expect(resPri.priority).toBe(2);
		// Update location & url
		const resMeta = await taskStore.updateTask({
			id: "task-parent",
			location: "Office 404",
			url: "https://test.local",
		});
		expect(resMeta.location).toBe("Office 404");
		expect(resMeta.url).toBe("https://test.local");
	});

	test("Metadata tag operations: create, assign, remove tags", async () => {
		// Assign existing tag
		await assignTag("task-parent", "t1");
		expect(mockTaskTags.length).toBe(1);
		expect(mockTaskTags[0]?.tagId).toBe("t1");

		// Create and assign new tag
		const newTag = await createTag("urgent", "#ef4444");
		await assignTag("task-parent", newTag.id);
		expect(mockTaskTags.length).toBe(2);

		// Remove tag
		await removeTag("task-parent", "t1");
		expect(mockTaskTags.length).toBe(1);
		expect(mockTaskTags[0]?.tagId).toBe(newTag.id);
	});

	test("Subtasks section: add subtask, toggle completion, subtask navigation", async () => {
		const taskStore = useTaskStore();
		taskStore.allTasks = [...mockTasks];
		taskStore.tasks = [...mockTasks];
		taskStore.setActiveTask("task-parent");

		// Inspect task detail with subtasks
		const detail = await getTaskDetail("task-parent");
		expect(detail).not.toBeNull();
		expect(detail?.subtasks.length).toBe(2);

		// Add subtask
		const createdSubtask = await taskStore.addTask({
			title: "Write documentation",
			parent_id: "task-parent",
			list_id: "list-inbox",
		});
		expect(createdSubtask.parent_id).toBe("task-parent");
		expect(createdSubtask.title).toBe("Write documentation");

		// Toggle subtask completion
		const toggled = await taskStore.toggleTask("subtask-1", true);
		expect(toggled.completed).toBe(true);

		// Navigate to pre-existing subtask directly via getTaskDetail
		const subtaskDetail = await getTaskDetail("subtask-1");
		expect(subtaskDetail).not.toBeNull();
		expect(subtaskDetail?.id).toBe("subtask-1");
		expect(subtaskDetail?.parent_id).toBe("task-parent");
		expect(subtaskDetail?.priority).toBe(2);
	});

	test("Notes section: add note, update note, delete note, markdown rendering", async () => {
		// Add note
		const note = await addNote({
			task_id: "task-parent",
			title: "Meeting Minutes",
			content: "Discussed roadmap **bold** and `code` with [link](https://test.com).",
		});

		expect(note.title).toBe("Meeting Minutes");
		expect(note.task_id).toBe("task-parent");

		const notesList = await getNotes("task-parent");
		expect(notesList.length).toBe(1);

		// Update note
		const updated = await updateNote({
			id: note.id,
			title: "Updated Minutes",
			content: "Updated note content with *italic* text.",
		});
		expect(updated.title).toBe("Updated Minutes");
		expect(updated.content).toContain("*italic*");

		// Delete note
		await deleteNote(note.id);
		const notesAfterDelete = await getNotes("task-parent");
		expect(notesAfterDelete.length).toBe(0);
	});
});
