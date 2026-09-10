import { invoke } from "@tauri-apps/api/core";
import type {
	AddNoteInput,
	AddReminderInput,
	CreateTaskInput,
	ImportBackupResult,
	List,
	Note,
	OpenTaskDocument,
	Reminder,
	Tag,
	Task,
	UpdateTaskInput,
} from "../models/index.ts";

export class ApiError extends Error {
	constructor(
		message: string,
		public readonly command: string,
		public readonly originalError?: unknown,
	) {
		super(message);
		this.name = "ApiError";
	}
}

async function safeInvoke<T>(
	command: string,
	args?: Record<string, unknown>,
): Promise<T> {
	try {
		return await invoke<T>(command, args);
	} catch (error) {
		const message =
			typeof error === "string"
				? error
				: error instanceof Error
					? error.message
					: JSON.stringify(error);
		console.error(`[API Error] ${command}:`, message);
		throw new ApiError(message, command, error);
	}
}

// ---------------------------------------------------------------------------
// Lists API
// ---------------------------------------------------------------------------

export async function getLists(): Promise<List[]> {
	return safeInvoke<List[]>("get_lists");
}

export async function createList(
	name: string,
	color?: string | null,
): Promise<List> {
	return safeInvoke<List>("create_list", {
		name,
		color: color ?? null,
	});
}

export async function deleteList(id: string): Promise<void> {
	return safeInvoke<void>("delete_list", { id });
}

// ---------------------------------------------------------------------------
// Tasks API
// ---------------------------------------------------------------------------

export async function getTasks(
	listId: string,
	includeCompleted?: boolean,
): Promise<Task[]> {
	return safeInvoke<Task[]>("get_tasks", {
		listId,
		includeCompleted: includeCompleted ?? null,
	});
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
	return safeInvoke<Task>("create_task", {
		listId: input.list_id,
		title: input.title,
		due: input.due ?? null,
		priority: input.priority ?? null,
		parentId: input.parent_id ?? null,
	});
}

export async function updateTask(input: UpdateTaskInput): Promise<Task> {
	return safeInvoke<Task>("update_task", { task: input });
}

export async function deleteTask(id: string): Promise<void> {
	return safeInvoke<void>("delete_task", { id });
}

export async function toggleTaskComplete(
	id: string,
	completed: boolean,
): Promise<Task> {
	return safeInvoke<Task>("toggle_task_complete", { id, completed });
}

// ---------------------------------------------------------------------------
// Tags & Notes API
// ---------------------------------------------------------------------------

export async function getTags(): Promise<Tag[]> {
	return safeInvoke<Tag[]>("get_tags");
}

export async function createTag(
	name: string,
	color?: string | null,
): Promise<Tag> {
	return safeInvoke<Tag>("create_tag", {
		name,
		color: color ?? null,
	});
}

export async function getNotes(taskId: string): Promise<Note[]> {
	return safeInvoke<Note[]>("get_notes", { taskId });
}

export async function addNote(input: AddNoteInput): Promise<Note> {
	return safeInvoke<Note>("add_note", {
		taskId: input.task_id,
		content: input.content,
		title: input.title ?? null,
	});
}

// ---------------------------------------------------------------------------
// Reminders API
// ---------------------------------------------------------------------------

export async function getReminders(taskId: string): Promise<Reminder[]> {
	return safeInvoke<Reminder[]>("get_reminders", { taskId });
}

export async function addReminder(input: AddReminderInput): Promise<Reminder> {
	return safeInvoke<Reminder>("add_reminder", {
		taskId: input.task_id,
		trigger: input.trigger,
		relativeTo: input.relative_to ?? null,
		action: input.action ?? null,
		description: input.description ?? null,
	});
}

export async function deleteReminder(id: string): Promise<void> {
	return safeInvoke<void>("delete_reminder", { id });
}

// ---------------------------------------------------------------------------
// OpenTask Backup (Export & Import) API
// ---------------------------------------------------------------------------

export async function exportBackup(): Promise<OpenTaskDocument> {
	return safeInvoke<OpenTaskDocument>("export_backup");
}

export async function importBackup(
	document: OpenTaskDocument,
): Promise<ImportBackupResult> {
	return safeInvoke<ImportBackupResult>("import_backup", { document });
}

export const api = {
	lists: {
		getAll: getLists,
		create: createList,
		delete: deleteList,
	},
	tasks: {
		getAll: getTasks,
		create: createTask,
		update: updateTask,
		delete: deleteTask,
		toggleComplete: toggleTaskComplete,
	},
	tags: {
		getAll: getTags,
		create: createTag,
	},
	notes: {
		getByTaskId: getNotes,
		add: addNote,
	},
	reminders: {
		getByTaskId: getReminders,
		add: addReminder,
		delete: deleteReminder,
	},
	backup: {
		export: exportBackup,
		import: importBackup,
	},
};
