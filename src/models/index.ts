export type Priority = 1 | 2 | 3;

export const PRIORITY = {
	HIGH: 1,
	MEDIUM: 2,
	LOW: 3,
} as const;

export type TaskStatus =
	| "needs_action"
	| "in_progress"
	| "completed"
	| "cancelled";

export type OpenTaskPriority = "high" | "medium" | "low" | "none";

export interface GeoLocation {
	latitude: number;
	longitude: number;
}

export interface List {
	id: string;
	name: string;
	color: string | null;
	position: number;
	is_archived?: boolean;
	extra?: Record<string, unknown> | null;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
}

export interface Task {
	id: string;
	uid: string | null;
	parent_id: string | null;
	list_id: string;
	title: string;
	description: string | null;
	due: string | null;
	is_all_day: boolean;
	rrule: string | null;
	priority: Priority | null;
	location: string | null;
	url: string | null;
	completed: boolean;
	completed_at: string | null;
	status?: TaskStatus;
	start?: string | null;
	duration?: string | null;
	timezone?: string | null;
	percent_complete?: number;
	color?: string | null;
	position?: number;
	geo_latitude?: number | null;
	geo_longitude?: number | null;
	geo?: GeoLocation | null;
	extra?: Record<string, unknown> | null;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
}

export interface TaskDetail extends Task {
	tags: Tag[];
	notes: Note[];
	subtasks: Task[];
}

export interface Tag {
	id: string;
	name: string;
	color: string | null;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
}

export interface Note {
	id: string;
	task_id: string;
	title: string | null;
	content: string;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
}

export interface CreateListInput {
	name: string;
	color?: string | null;
	position?: number;
	is_archived?: boolean;
	extra?: Record<string, unknown> | null;
}

export interface UpdateListInput {
	id: string;
	name?: string;
	color?: string | null;
	position?: number;
}

export interface CreateTaskInput {
	list_id: string;
	title: string;
	description?: string | null;
	due?: string | null;
	is_all_day?: boolean;
	rrule?: string | null;
	priority?: Priority | null;
	parent_id?: string | null;
	status?: TaskStatus;
	start?: string | null;
	duration?: string | null;
	timezone?: string | null;
	percent_complete?: number;
	color?: string | null;
	position?: number;
	geo_latitude?: number | null;
	geo_longitude?: number | null;
	geo?: GeoLocation | null;
	extra?: Record<string, unknown> | null;
}

export interface UpdateTaskInput {
	id: string;
	uid?: string | null;
	title?: string;
	description?: string | null;
	list_id?: string;
	parent_id?: string | null;
	due?: string | null;
	is_all_day?: boolean;
	rrule?: string | null;
	repeats?: string | null;
	priority?: Priority | null;
	location?: string | null;
	url?: string | null;
	completed?: boolean;
	completed_at?: string | null;
	status?: TaskStatus;
	start?: string | null;
	duration?: string | null;
	timezone?: string | null;
	percent_complete?: number;
	color?: string | null;
	position?: number;
	geo_latitude?: number | null;
	geo_longitude?: number | null;
	geo?: GeoLocation | null;
	extra?: Record<string, unknown> | null;
}

export interface CreateTagInput {
	name: string;
	color?: string | null;
}

export interface AddNoteInput {
	task_id: string;
	content: string;
	title?: string | null;
}

export interface UpdateNoteInput {
	id: string;
	content?: string;
	title?: string | null;
}

export interface BatchUpdateTasksInput {
	task_ids: string[];
	completed?: boolean;
	postpone_days?: number;
	due?: string | null;
	list_id?: string;
	priority?: Priority | null;
}

export interface GetTasksOptions {
	listId?: string | null;
	includeCompleted?: boolean;
	view?: string | null;
	tag?: string | null;
	dueFrom?: string | null;
	dueTo?: string | null;
	parentId?: string | null;
}

export interface Reminder {
	id: string;
	task_id: string;
	trigger: string;
	relative_to: string;
	action: string;
	description?: string | null;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
}

export interface AddReminderInput {
	task_id: string;
	trigger: string;
	relative_to?: string;
	action?: string;
	description?: string | null;
}

// ---------------------------------------------------------------------------
// OpenTask v1.0 Interchange Specification Types (matching opentask-v1.json)
// ---------------------------------------------------------------------------

export interface OpenTaskChecklistItem {
	id: string;
	title: string;
	completed: boolean;
	position?: number;
}

export interface OpenTaskReminder {
	id: string;
	trigger: string;
	relative_to?: string;
	action?: string;
	description?: string | null;
}

export interface OpenTaskNote {
	id: string;
	title?: string | null;
	content: string;
	created_at?: string;
	updated_at?: string;
}

export interface OpenTaskTag {
	id: string;
	name: string;
	color?: string | null;
}

export interface OpenTaskTaskList {
	id: string;
	name: string;
	color?: string | null;
	position?: number;
	is_archived?: boolean;
	extra?: Record<string, unknown> | null;
}

export interface OpenTaskTask {
	id: string;
	uid?: string | null;
	list_id: string;
	parent_id?: string | null;
	title: string;
	description?: string | null;
	notes?: OpenTaskNote[];
	status?: TaskStatus;
	completed_at?: string | null;
	due?: string | null;
	is_all_day?: boolean;
	start?: string | null;
	duration?: string | null;
	timezone?: string | null;
	priority?: OpenTaskPriority;
	priority_raw?: number | string | null;
	percent_complete?: number;
	tags?: string[];
	rrule?: string | null;
	repeats?: string | null;
	location?: string | null;
	geo?: GeoLocation | null;
	color?: string | null;
	url?: string | null;
	position?: number;
	checklist?: OpenTaskChecklistItem[];
	reminders?: OpenTaskReminder[];
	created_at?: string;
	updated_at?: string;
	deleted_at?: string | null;
	extra?: Record<string, unknown> | null;
}

export interface OpenTaskDocument {
	version: "1.0";
	exported_at?: string;
	source?: string;
	lists: OpenTaskTaskList[];
	tags?: OpenTaskTag[];
	tasks: OpenTaskTask[];
}

export interface ImportBackupResult {
	lists_imported: number;
	tasks_imported: number;
	tags_imported: number;
	notes_imported: number;
	reminders_imported: number;
}
