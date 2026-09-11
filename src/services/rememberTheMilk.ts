import type {
	OpenTaskDocument,
	OpenTaskNote,
	OpenTaskPriority,
	OpenTaskReminder,
	OpenTaskTag,
	OpenTaskTask,
	OpenTaskTaskList,
	TaskStatus,
} from "../models/index.ts";

export interface RTMConfig {
	timezone_id?: string;
	[key: string]: unknown;
}

export interface RTMList {
	id: string;
	name: string;
	date_created?: number;
	date_modified?: number;
	syncable?: boolean;
	token?: string;
	sorting_scheme_id?: string;
	relative_position?: number;
	[key: string]: unknown;
}

export interface RTMSmartList {
	id: string;
	name: string;
	filter?: string;
	date_created?: number;
	date_modified?: number;
	sorting_scheme_id?: string;
	relative_position?: number;
	[key: string]: unknown;
}

export interface RTMTag {
	id: string;
	name?: string;
	date_created?: number;
	date_modified?: number;
	relative_position?: number;
	background_color?: string;
	foreground_color?: string;
	[key: string]: unknown;
}

export interface RTMLocation {
	id: string;
	name: string;
	latitude?: number;
	longitude?: number;
	address?: string;
	zoom?: number;
	[key: string]: unknown;
}

export interface RTMNote {
	id: string;
	series_id?: string;
	task_id?: string;
	date_created?: number;
	date_modified?: number;
	title?: string;
	content?: string;
	creator_id?: string;
	last_editor_id?: string;
	[key: string]: unknown;
}

export interface RTMReminder {
	id: string;
	series_id?: string;
	task_id?: string;
	notification_sink_id?: string;
	reminder_type?: string;
	reminder_params?: string;
	date_modified?: number;
	[key: string]: unknown;
}

export interface RTMTask {
	id: string;
	series_id?: string;
	list_id: string;
	parent_id?: string;
	name: string;
	priority?: string;
	date_created?: number;
	date_added?: number;
	date_modified?: number;
	date_due?: number;
	date_due_has_time?: boolean;
	date_start_has_time?: boolean;
	date_completed?: number;
	postponed?: number;
	source?: string;
	repeat_every?: boolean | string;
	tags?: string[];
	url?: string;
	location_id?: string;
	[key: string]: unknown;
}

export interface RTMExport {
	config?: RTMConfig;
	lists?: RTMList[];
	smart_lists?: RTMSmartList[];
	tags?: RTMTag[];
	locations?: RTMLocation[];
	notes?: RTMNote[];
	reminders?: RTMReminder[];
	tasks?: RTMTask[];
	[key: string]: unknown;
}

function epochMsToIso(ms: number | undefined | null): string | null {
	if (ms === undefined || ms === null || Number.isNaN(ms)) {
		return null;
	}
	return new Date(ms).toISOString();
}

const RTM_PRIORITY_MAP: Record<string, OpenTaskPriority> = {
	P1: "high",
	P2: "medium",
	P3: "low",
	PN: "none",
};

export function mapRememberTheMilkToOpenTask(rtmData: RTMExport): OpenTaskDocument {
	const timezone = rtmData.config?.timezone_id || null;

	// Map regular lists
	const lists: OpenTaskTaskList[] = (rtmData.lists || []).map((l, index) => {
		const extra: Record<string, unknown> = {};
		if (l.sorting_scheme_id !== undefined) extra.sorting_scheme_id = l.sorting_scheme_id;
		if (l.token !== undefined) extra.token = l.token;
		if (l.syncable !== undefined) extra.syncable = l.syncable;

		const isArchived = Boolean(
			l.archived === 1 || l.archived === "1" || l.archived === true || l.is_archived === true,
		);

		return {
			id: String(l.id),
			name: l.name,
			color: null,
			position: typeof l.relative_position === "number" ? l.relative_position : index,
			is_archived: isArchived,
			extra: Object.keys(extra).length > 0 ? extra : null,
		};
	});

	// Also map archived_lists if present
	const rawArchived = ((rtmData as Record<string, unknown>).archived_lists as RTMList[]) || [];
	for (const al of rawArchived) {
		const existing = lists.find((l) => l.id === String(al.id));
		if (existing) {
			existing.is_archived = true;
		} else {
			lists.push({
				id: String(al.id),
				name: al.name,
				color: null,
				position: typeof al.relative_position === "number" ? al.relative_position : lists.length,
				is_archived: true,
			});
		}
	}

	// Also map smart lists if any, preserving their filter in extra
	if (rtmData.smart_lists) {
		for (const sl of rtmData.smart_lists) {
			const isArchived = Boolean(
				(sl as Record<string, unknown>).archived === 1 ||
				(sl as Record<string, unknown>).archived === "1" ||
				(sl as Record<string, unknown>).archived === true ||
				(sl as Record<string, unknown>).is_archived === true,
			);
			lists.push({
				id: String(sl.id),
				name: sl.name,
				color: null,
				position: typeof sl.relative_position === "number" ? sl.relative_position : lists.length,
				is_archived: isArchived,
				extra: {
					is_smart_list: true,
					filter: sl.filter,
					sorting_scheme_id: sl.sorting_scheme_id,
				},
			});
		}
	}

	const knownListIds = new Set(lists.map((l) => l.id));
	const inboxList = lists.find((l) => l.name.toLowerCase() === "inbox");
	const defaultListId = inboxList
		? inboxList.id
		: (lists[0]?.id ?? "00000000-0000-0000-0000-000000000001");

	const rawTasks = rtmData.tasks || [];
	const knownTaskIds = new Set(rawTasks.map((t) => String(t.id)));
	// Map tags
	const tags: OpenTaskTag[] = (rtmData.tags || []).map((t) => ({
		id: String(t.id),
		name: t.name ?? String(t.id),
		color: t.background_color || t.foreground_color || null,
	}));

	// Locations map for quick lookup
	const locationById: Record<string, RTMLocation> = {};
	if (rtmData.locations) {
		for (const loc of rtmData.locations) {
			locationById[String(loc.id)] = loc;
		}
	}

	// Group notes by series_id (and task_id if present)
	const notesBySeries: Record<string, OpenTaskNote[]> = {};
	if (rtmData.notes) {
		for (const n of rtmData.notes) {
			const targetKey = n.series_id ? String(n.series_id) : n.task_id ? String(n.task_id) : null;
			if (!targetKey) continue;

			const opentaskNote: OpenTaskNote = {
				id: String(n.id),
				title: n.title || null,
				content: n.content || "",
				created_at: epochMsToIso(n.date_created) ?? undefined,
				updated_at: epochMsToIso(n.date_modified) ?? undefined,
			};

			if (!notesBySeries[targetKey]) {
				notesBySeries[targetKey] = [];
			}
			notesBySeries[targetKey].push(opentaskNote);
		}
	}

	// Group reminders by series_id (and task_id if present)
	const remindersBySeries: Record<string, OpenTaskReminder[]> = {};
	if (rtmData.reminders) {
		for (const r of rtmData.reminders) {
			const targetKey = r.series_id ? String(r.series_id) : r.task_id ? String(r.task_id) : null;
			if (!targetKey) continue;

			let trigger = "-PT0M";
			if (r.reminder_type === "beforeDueDate" && r.reminder_params) {
				trigger = r.reminder_params.startsWith("-") ? r.reminder_params : `-${r.reminder_params}`;
			} else if (r.reminder_type === "atDueTime") {
				trigger = "-PT0M";
			}

			const reminder: OpenTaskReminder = {
				id: String(r.id),
				trigger,
				relative_to: "due",
				action: "display",
				description: r.reminder_type || null,
			};

			if (!remindersBySeries[targetKey]) {
				remindersBySeries[targetKey] = [];
			}
			remindersBySeries[targetKey].push(reminder);
		}
	}

	// Map tasks defensively
	const unmappedTasks: OpenTaskTask[] = rawTasks.map((t, index) => {
		const seriesKey = t.series_id ? String(t.series_id) : null;
		const taskKey = String(t.id);

		// Associated notes & reminders
		const taskNotes = [
			...(seriesKey && notesBySeries[seriesKey] ? notesBySeries[seriesKey] : []),
			...(notesBySeries[taskKey] && taskKey !== seriesKey ? notesBySeries[taskKey] : []),
		];

		const taskReminders = [
			...(seriesKey && remindersBySeries[seriesKey] ? remindersBySeries[seriesKey] : []),
			...(remindersBySeries[taskKey] && taskKey !== seriesKey ? remindersBySeries[taskKey] : []),
		];

		// Status & completion
		const isCompleted = !!t.date_completed;
		const status: TaskStatus = isCompleted ? "completed" : "needs_action";
		const completed_at = epochMsToIso(t.date_completed);

		// Due & all day
		const due = epochMsToIso(t.date_due);
		const is_all_day = t.date_due_has_time === false;

		// Priority
		const priorityRaw = t.priority ?? null;
		const priority = priorityRaw ? (RTM_PRIORITY_MAP[priorityRaw.toUpperCase()] ?? "none") : "none";

		// Location
		let locationName: string | null = null;
		let geo: { latitude: number; longitude: number } | null = null;
		const loc = t.location_id ? locationById[String(t.location_id)] : undefined;
		if (loc) {
			locationName = loc.address || loc.name;
			if (typeof loc.latitude === "number" && typeof loc.longitude === "number") {
				geo = { latitude: loc.latitude, longitude: loc.longitude };
			}
		}

		// Extra fields to preserve RTM vendor fidelity without loss
		const extra: Record<string, unknown> = {};
		if (t.series_id !== undefined) extra.series_id = t.series_id;
		if (t.postponed !== undefined) extra.postponed = t.postponed;
		if (t.source !== undefined) extra.source = t.source;
		if (t.repeat_every !== undefined) extra.repeat_every = t.repeat_every;

		// Resolve list_id safely
		let taskListId = defaultListId;
		if (
			t.list_id !== undefined &&
			t.list_id !== null &&
			String(t.list_id).trim() !== "" &&
			String(t.list_id).trim() !== "null" &&
			String(t.list_id).trim() !== "undefined"
		) {
			const candidate = String(t.list_id).trim();
			if (knownListIds.has(candidate)) {
				taskListId = candidate;
			} else {
				lists.push({
					id: candidate,
					name: `List ${candidate}`,
					color: null,
					position: lists.length,
					is_archived: false,
				});
				knownListIds.add(candidate);
				taskListId = candidate;
			}
		}

		// Resolve parent_id safely (prevent self-reference and dangling parents)
		let parentId: string | null = null;
		if (t.parent_id !== undefined && t.parent_id !== null) {
			const candidateParent = String(t.parent_id).trim();
			if (
				candidateParent !== "" &&
				candidateParent !== "null" &&
				candidateParent !== "undefined" &&
				candidateParent !== String(t.id) &&
				knownTaskIds.has(candidateParent)
			) {
				parentId = candidateParent;
			}
		}

		return {
			id: String(t.id),
			list_id: taskListId,
			parent_id: parentId,
			title: t.name,
			notes: taskNotes.length > 0 ? taskNotes : undefined,
			status,
			completed_at,
			due,
			is_all_day,
			timezone,
			priority,
			priority_raw: priorityRaw,
			tags: Array.isArray(t.tags) ? t.tags : [],
			repeats: typeof t.repeat_every === "string" ? t.repeat_every : null,
			location: locationName,
			geo,
			url: t.url || null,
			position: index,
			reminders: taskReminders.length > 0 ? taskReminders : undefined,
			created_at: epochMsToIso(t.date_created) ?? undefined,
			updated_at: epochMsToIso(t.date_modified) ?? undefined,
			extra: Object.keys(extra).length > 0 ? extra : null,
		};
	});

	// Topologically sort tasks so parents always appear before subtasks
	const tasks: OpenTaskTask[] = [];
	const insertedTaskIds = new Set<string>();

	for (const t of unmappedTasks) {
		if (!t.parent_id) {
			tasks.push(t);
			insertedTaskIds.add(t.id);
		}
	}

	let remaining = unmappedTasks.filter((t) => !insertedTaskIds.has(t.id));
	let progress = true;
	while (remaining.length > 0 && progress) {
		progress = false;
		const nextRemaining: OpenTaskTask[] = [];
		for (const t of remaining) {
			if (t.parent_id && insertedTaskIds.has(t.parent_id)) {
				tasks.push(t);
				insertedTaskIds.add(t.id);
				progress = true;
			} else {
				nextRemaining.push(t);
			}
		}
		remaining = nextRemaining;
	}

	// Break any cycles or orphaned subtasks that couldn't be resolved
	for (const t of remaining) {
		t.parent_id = null;
		tasks.push(t);
	}
	return {
		version: "1.0",
		exported_at: new Date().toISOString(),
		source: "rtm",
		lists,
		tags,
		tasks,
	};
}
