use std::collections::HashMap;
use libsql::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::db::DbState;
use crate::models::{
    opentask_to_priority, priority_to_opentask, status_to_completed, GeoLocation,
    OpenTaskDocument, OpenTaskNote, OpenTaskReminder, OpenTaskTag, OpenTaskTask, OpenTaskTaskList,
};
use super::common::{now_iso, row_to_task, TASK_SELECT_COLS};
use super::lists::get_lists_impl;
use super::tags::get_tags_impl;

// ---------------------------------------------------------------------------
// OpenTask v1.0 Export and Import Commands
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ImportBackupResult {
    pub lists_imported: usize,
    pub tasks_imported: usize,
    pub tags_imported: usize,
    pub notes_imported: usize,
    pub reminders_imported: usize,
}

pub async fn export_backup_impl(conn: &Connection) -> Result<OpenTaskDocument, String> {
    // 1. Fetch lists
    let lists = get_lists_impl(conn).await?;
    let opentask_lists: Vec<OpenTaskTaskList> = lists
        .into_iter()
        .map(|l| OpenTaskTaskList {
            id: l.id,
            name: l.name,
            color: l.color,
            position: l.position,
            is_archived: l.is_archived,
            icon: l.icon,
            extra: l.extra,
        })
        .collect();

    // 2. Fetch tags
    let tags = get_tags_impl(conn).await?;
    let opentask_tags: Vec<OpenTaskTag> = tags
        .into_iter()
        .map(|t| OpenTaskTag {
            id: t.id,
            name: t.name,
            color: t.color,
        })
        .collect();

    // 3. Fetch all active tasks
    let task_query = format!(
        "SELECT {}
         FROM tasks
         WHERE deleted_at IS NULL
         ORDER BY position ASC, created_at ASC",
        TASK_SELECT_COLS
    );
    let mut task_rows = conn
        .query(&task_query, ())
        .await
        .map_err(|e| format!("Failed to query tasks for export: {}", e))?;

    let mut tasks = Vec::new();
    while let Some(row) = task_rows
        .next()
        .await
        .map_err(|e| format!("Failed to read task row for export: {}", e))?
    {
        tasks.push(row_to_task(&row).map_err(|e| format!("Failed to parse task for export: {}", e))?);
    }

    // Pre-fetch all notes for active tasks
    let mut notes_by_task: HashMap<String, Vec<OpenTaskNote>> = HashMap::new();
    let mut note_rows = conn
        .query(
            "SELECT task_id, id, title, content, created_at, updated_at
             FROM notes
             WHERE deleted_at IS NULL
             ORDER BY created_at ASC",
            (),
        )
        .await
        .map_err(|e| format!("Failed to query notes for export: {}", e))?;
    while let Some(row) = note_rows
        .next()
        .await
        .map_err(|e| format!("Failed to read note row for export: {}", e))?
    {
        let task_id: String = row.get(0).map_err(|e| format!("Failed to get note task_id: {}", e))?;
        notes_by_task.entry(task_id).or_default().push(OpenTaskNote {
            id: row.get(1).map_err(|e| format!("Failed to get note id: {}", e))?,
            title: row.get(2).map_err(|e| format!("Failed to get note title: {}", e))?,
            content: row.get(3).map_err(|e| format!("Failed to get note content: {}", e))?,
            created_at: Some(row.get(4).map_err(|e| format!("Failed to get note created_at: {}", e))?),
            updated_at: Some(row.get(5).map_err(|e| format!("Failed to get note updated_at: {}", e))?),
        });
    }

    // Pre-fetch all reminders for active tasks
    let mut reminders_by_task: HashMap<String, Vec<OpenTaskReminder>> = HashMap::new();
    let mut reminder_rows = conn
        .query(
            "SELECT task_id, id, trigger, relative_to, action, description
             FROM reminders
             WHERE deleted_at IS NULL
             ORDER BY created_at ASC",
            (),
        )
        .await
        .map_err(|e| format!("Failed to query reminders for export: {}", e))?;
    while let Some(row) = reminder_rows
        .next()
        .await
        .map_err(|e| format!("Failed to read reminder row for export: {}", e))?
    {
        let task_id: String = row.get(0).map_err(|e| format!("Failed to get reminder task_id: {}", e))?;
        reminders_by_task.entry(task_id).or_default().push(OpenTaskReminder {
            id: row.get(1).map_err(|e| format!("Failed to get reminder id: {}", e))?,
            trigger: row.get(2).map_err(|e| format!("Failed to get reminder trigger: {}", e))?,
            relative_to: row.get(3).map_err(|e| format!("Failed to get reminder relative_to: {}", e))?,
            action: row.get(4).map_err(|e| format!("Failed to get reminder action: {}", e))?,
            description: row.get(5).map_err(|e| format!("Failed to get reminder description: {}", e))?,
        });
    }

    // Pre-fetch all tags for active tasks
    let mut tags_by_task: HashMap<String, Vec<String>> = HashMap::new();
    let mut tag_rows = conn
        .query(
            "SELECT tt.task_id, t.name
             FROM tags t
             INNER JOIN task_tags tt ON t.id = tt.tag_id
             WHERE tt.deleted_at IS NULL AND t.deleted_at IS NULL
             ORDER BY t.name ASC",
            (),
        )
        .await
        .map_err(|e| format!("Failed to query task tags for export: {}", e))?;
    while let Some(row) = tag_rows
        .next()
        .await
        .map_err(|e| format!("Failed to read tag row for export: {}", e))?
    {
        let task_id: String = row.get(0).map_err(|e| format!("Failed to get tag task_id: {}", e))?;
        let name: String = row.get(1).map_err(|e| format!("Failed to get tag name: {}", e))?;
        tags_by_task.entry(task_id).or_default().push(name);
    }

    let mut opentask_tasks = Vec::with_capacity(tasks.len());
    for task in tasks {
        let opentask_notes = notes_by_task.remove(&task.id).unwrap_or_default();
        let opentask_reminders = reminders_by_task.remove(&task.id).unwrap_or_default();
        let task_tags = tags_by_task.remove(&task.id).unwrap_or_default();

        let geo = match (task.geo_latitude, task.geo_longitude) {
            (Some(latitude), Some(longitude)) => Some(GeoLocation {
                latitude,
                longitude,
            }),
            _ => None,
        };

        let priority_str = priority_to_opentask(task.priority);
        let priority_raw = task.priority.map(|p| serde_json::json!(p));
        let status_str = if task.completed {
            "completed".to_string()
        } else {
            task.status
        };

        opentask_tasks.push(OpenTaskTask {
            id: task.id,
            uid: task.uid,
            list_id: task.list_id,
            parent_id: task.parent_id,
            title: task.title,
            description: task.description,
            notes: opentask_notes,
            status: status_str,
            completed_at: task.completed_at,
            due: task.due,
            is_all_day: task.is_all_day,
            start: task.start,
            duration: task.duration,
            timezone: task.timezone,
            priority: priority_str,
            priority_raw,
            percent_complete: task.percent_complete,
            tags: task_tags,
            rrule: task.rrule.clone(),
            repeats: task.rrule,
            location: task.location,
            geo,
            color: task.color,
            url: task.url,
            position: task.position,
            checklist: None,
            reminders: opentask_reminders,
            created_at: Some(task.created_at),
            updated_at: Some(task.updated_at),
            deleted_at: task.deleted_at,
            extra: {
                let mut extra_val = task.extra;
                if task.freeform_x.is_some() || task.freeform_y.is_some() {
                    let mut map = match extra_val {
                        Some(serde_json::Value::Object(m)) => m,
                        _ => serde_json::Map::new(),
                    };
                    if let Some(x) = task.freeform_x {
                        map.insert("freeform_x".to_string(), serde_json::json!(x));
                    }
                    if let Some(y) = task.freeform_y {
                        map.insert("freeform_y".to_string(), serde_json::json!(y));
                    }
                    extra_val = Some(serde_json::Value::Object(map));
                }
                extra_val
            },
        });
    }

    Ok(OpenTaskDocument {
        version: "1.0".to_string(),
        exported_at: Some(now_iso()),
        source: Some("tudu".to_string()),
        lists: opentask_lists,
        tags: if opentask_tags.is_empty() {
            None
        } else {
            Some(opentask_tags)
        },
        tasks: opentask_tasks,
    })
}

#[tauri::command]
pub async fn export_backup(state: State<'_, DbState>) -> Result<OpenTaskDocument, String> {
    export_backup_impl(&state.conn).await
}

async fn import_backup_inner(
    conn: &Connection,
    doc: OpenTaskDocument,
) -> Result<ImportBackupResult, String> {
    if doc.version != "1.0" {
        return Err(format!(
            "Unsupported OpenTask version: '{}'. Expected '1.0'.",
            doc.version
        ));
    }

    let now = now_iso();
    let mut lists_imported = 0;
    let mut tags_imported = 0;
    let mut tasks_imported = 0;
    let mut notes_imported = 0;
    let mut reminders_imported = 0;

    // 1. Lists
    for list in doc.lists {
        let is_archived_int = if list.is_archived { 1i64 } else { 0i64 };
        let extra_str = list.extra.as_ref().map(|v| v.to_string());
        let list_id = list.id.clone();

        let mut existing = conn
            .query("SELECT id FROM lists WHERE id = ?1", params![list_id.clone()])
            .await
            .map_err(|e| format!("Failed to check existing list: {}", e))?;

        if existing
            .next()
            .await
            .map_err(|e| format!("Error checking list: {}", e))?
            .is_some()
        {
            conn.execute(
                "UPDATE lists
                 SET name = ?2, color = ?3, position = ?4, is_archived = ?5, icon = ?6, extra = ?7, updated_at = ?8, deleted_at = NULL
                 WHERE id = ?1",
                params![
                    list_id,
                    list.name,
                    list.color,
                    list.position,
                    is_archived_int,
                    list.icon,
                    extra_str,
                    now.clone()
                ],
            )
            .await
            .map_err(|e| format!("Failed to update list: {}", e))?;
        } else {
            conn.execute(
                "INSERT INTO lists (id, name, color, position, is_archived, icon, extra, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
                params![
                    list_id,
                    list.name,
                    list.color,
                    list.position,
                    is_archived_int,
                    list.icon,
                    extra_str,
                    now.clone()
                ],
            )
            .await
            .map_err(|e| format!("Failed to insert list: {}", e))?;
        }
        lists_imported += 1;
    }

    // 2. Tags
    if let Some(tags) = doc.tags {
        for tag in tags {
            let tag_id = tag.id.clone();
            let mut existing = conn
                .query(
                    "SELECT id FROM tags WHERE id = ?1 OR name = ?2",
                    params![tag_id.clone(), tag.name.clone()],
                )
                .await
                .map_err(|e| format!("Failed to check existing tag: {}", e))?;

            if let Some(row) = existing
                .next()
                .await
                .map_err(|e| format!("Error checking tag: {}", e))?
            {
                let found_id: String = row
                    .get(0)
                    .map_err(|e| format!("Failed to get tag id: {}", e))?;
                conn.execute(
                    "UPDATE tags SET color = ?2, updated_at = ?3, deleted_at = NULL WHERE id = ?1",
                    params![found_id, tag.color, now.clone()],
                )
                .await
                .map_err(|e| format!("Failed to update tag: {}", e))?;
            } else {
                conn.execute(
                    "INSERT INTO tags (id, name, color, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?4)",
                    params![tag_id, tag.name, tag.color, now.clone()],
                )
                .await
                .map_err(|e| format!("Failed to insert tag: {}", e))?;
            }
            tags_imported += 1;
        }
    }

    // Ensure default inbox exists and collect all known list ids
    let default_inbox_id = crate::db::ensure_default_inbox(conn)
        .await
        .map_err(|e| format!("Failed to ensure default inbox: {}", e))?;

    let mut list_rows = conn
        .query("SELECT id FROM lists", ())
        .await
        .map_err(|e| format!("Failed to query lists: {}", e))?;
    let mut known_list_ids = std::collections::HashSet::new();
    while let Some(row) = list_rows
        .next()
        .await
        .map_err(|e| format!("Error querying list: {}", e))?
    {
        let lid: String = row
            .get(0)
            .map_err(|e| format!("Error getting list id: {}", e))?;
        known_list_ids.insert(lid);
    }
    known_list_ids.insert(default_inbox_id.clone());

    let mut pending_parent_updates: Vec<(String, String)> = Vec::new();

    // 3. Tasks (Pass 1: Insert/Update tasks and subtasks without foreign key parent_id constraints)
    for task in doc.tasks {
        let task_id = task.id.clone();
        let completed = status_to_completed(&task.status);
        let completed_int = if completed { 1i64 } else { 0i64 };
        let completed_at = if completed {
            task.completed_at.clone().or_else(|| Some(now.clone()))
        } else {
            None
        };
        let is_all_day_int = if task.is_all_day { 1i64 } else { 0i64 };
        let priority = opentask_to_priority(&task.priority, task.priority_raw.as_ref());
        let rrule = task.rrule.clone().or(task.repeats.clone());
        let (geo_lat, geo_lng) = task
            .geo
            .as_ref()
            .map(|g| (Some(g.latitude), Some(g.longitude)))
            .unwrap_or((None, None));
        let extra_str = task.extra.as_ref().map(|v| v.to_string());
        let created_at = task.created_at.clone().unwrap_or_else(|| now.clone());
        let updated_at = task.updated_at.clone().unwrap_or_else(|| now.clone());

        // Ensure effective list_id exists in lists table to avoid foreign key failure
        let effective_list_id = if task.list_id.trim().is_empty()
            || task.list_id == "undefined"
            || task.list_id == "null"
        {
            default_inbox_id.clone()
        } else if !known_list_ids.contains(&task.list_id) {
            let new_list_name = "Imported List".to_string();
            conn.execute(
                "INSERT INTO lists (id, name, color, position, is_archived, created_at, updated_at)
                 VALUES (?1, ?2, NULL, 0, 0, ?3, ?3)",
                params![task.list_id.clone(), new_list_name, now.clone()],
            )
            .await
            .map_err(|e| format!("Failed to create missing list: {}", e))?;
            known_list_ids.insert(task.list_id.clone());
            lists_imported += 1;
            task.list_id.clone()
        } else {
            task.list_id.clone()
        };

        if let Some(pid) = &task.parent_id {
            let pid_trimmed = pid.trim();
            if !pid_trimmed.is_empty()
                && pid_trimmed != task_id
                && pid_trimmed != "null"
                && pid_trimmed != "undefined"
            {
                pending_parent_updates.push((task_id.clone(), pid_trimmed.to_string()));
            }
        }

        let freeform_x = task.extra.as_ref().and_then(|e| {
            e.get("freeform_x")
                .or_else(|| e.get("freeformX"))
                .and_then(|v| v.as_f64())
        });
        let freeform_y = task.extra.as_ref().and_then(|e| {
            e.get("freeform_y")
                .or_else(|| e.get("freeformY"))
                .and_then(|v| v.as_f64())
        });

        let mut existing = conn
            .query("SELECT id, freeform_x, freeform_y FROM tasks WHERE id = ?1", params![task_id.clone()])
            .await
            .map_err(|e| format!("Failed to check existing task: {}", e))?;

        if let Some(row) = existing
            .next()
            .await
            .map_err(|e| format!("Error checking task: {}", e))?
        {
            let existing_x: Option<f64> = row.get(1).unwrap_or(None);
            let existing_y: Option<f64> = row.get(2).unwrap_or(None);
            let final_x = freeform_x.or(existing_x);
            let final_y = freeform_y.or(existing_y);

            conn.execute(
                "UPDATE tasks
                 SET uid = ?2, parent_id = ?3, list_id = ?4, title = ?5, description = ?6,
                     due = ?7, is_all_day = ?8, rrule = ?9, priority = ?10, location = ?11,
                     url = ?12, completed = ?13, completed_at = ?14, status = ?15, start = ?16,
                     duration = ?17, timezone = ?18, percent_complete = ?19, color = ?20,
                     position = ?21, freeform_x = ?22, freeform_y = ?23, geo_latitude = ?24,
                     geo_longitude = ?25, extra = ?26, updated_at = ?27, deleted_at = ?28
                 WHERE id = ?1",
                params![
                    task_id.clone(),
                    task.uid,
                    None::<String>,
                    effective_list_id.clone(),
                    task.title,
                    task.description,
                    task.due,
                    is_all_day_int,
                    rrule,
                    priority,
                    task.location,
                    task.url,
                    completed_int,
                    completed_at,
                    task.status,
                    task.start,
                    task.duration,
                    task.timezone,
                    task.percent_complete,
                    task.color,
                    task.position,
                    final_x,
                    final_y,
                    geo_lat,
                    geo_lng,
                    extra_str,
                    updated_at,
                    task.deleted_at
                ],
            )
            .await
            .map_err(|e| format!("Failed to update task: {}", e))?;
        } else {
            conn.execute(
                "INSERT INTO tasks (id, uid, parent_id, list_id, title, description, due, is_all_day, rrule, priority, location, url, completed, completed_at, status, start, duration, timezone, percent_complete, color, position, freeform_x, freeform_y, geo_latitude, geo_longitude, extra, created_at, updated_at, deleted_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29)",
                params![
                    task_id.clone(),
                    task.uid,
                    None::<String>,
                    effective_list_id.clone(),
                    task.title,
                    task.description,
                    task.due,
                    is_all_day_int,
                    rrule,
                    priority,
                    task.location,
                    task.url,
                    completed_int,
                    completed_at,
                    task.status,
                    task.start,
                    task.duration,
                    task.timezone,
                    task.percent_complete,
                    task.color,
                    task.position,
                    freeform_x,
                    freeform_y,
                    geo_lat,
                    geo_lng,
                    extra_str,
                    created_at,
                    updated_at,
                    task.deleted_at
                ],
            )
            .await
            .map_err(|e| format!("Failed to insert task: {}", e))?;
        }
        tasks_imported += 1;

        // Tags on task
        for tag_name in task.tags {
            let tag_name = tag_name.trim().to_string();
            if tag_name.is_empty() {
                continue;
            }

            let mut tag_rows = conn
                .query("SELECT id FROM tags WHERE name = ?1", params![tag_name.clone()])
                .await
                .map_err(|e| format!("Failed to check tag: {}", e))?;

            let tag_id = if let Some(row) = tag_rows
                .next()
                .await
                .map_err(|e| format!("Error checking tag name: {}", e))?
            {
                row.get(0).map_err(|e| format!("Error getting tag id: {}", e))?
            } else {
                let new_tid = Uuid::now_v7().to_string();
                conn.execute(
                    "INSERT INTO tags (id, name, color, created_at, updated_at) VALUES (?1, ?2, NULL, ?3, ?3)",
                    params![new_tid.clone(), tag_name, now.clone()],
                )
                .await
                .map_err(|e| format!("Failed to insert tag: {}", e))?;
                tags_imported += 1;
                new_tid
            };

            conn.execute(
                "INSERT INTO task_tags (task_id, tag_id, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?3)
                 ON CONFLICT(task_id, tag_id) DO UPDATE SET deleted_at = NULL, updated_at = ?3",
                params![task_id.clone(), tag_id, now.clone()],
            )
            .await
            .map_err(|e| format!("Failed to link task tag: {}", e))?;
        }

        // Notes on task
        for note in task.notes {
            let note_created_at = note.created_at.unwrap_or_else(|| now.clone());
            let note_updated_at = note.updated_at.unwrap_or_else(|| now.clone());

            let mut existing_note = conn
                .query("SELECT id FROM notes WHERE id = ?1", params![note.id.clone()])
                .await
                .map_err(|e| format!("Failed to check note: {}", e))?;

            if existing_note
                .next()
                .await
                .map_err(|e| format!("Error checking note: {}", e))?
                .is_some()
            {
                conn.execute(
                    "UPDATE notes SET title = ?2, content = ?3, updated_at = ?4, deleted_at = NULL WHERE id = ?1",
                    params![note.id, note.title, note.content, note_updated_at],
                )
                .await
                .map_err(|e| format!("Failed to update note: {}", e))?;
            } else {
                conn.execute(
                    "INSERT INTO notes (id, task_id, title, content, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        note.id,
                        task_id.clone(),
                        note.title,
                        note.content,
                        note_created_at,
                        note_updated_at
                    ],
                )
                .await
                .map_err(|e| format!("Failed to insert note: {}", e))?;
            }
            notes_imported += 1;
        }

        // Reminders on task
        for reminder in task.reminders {
            let rel = reminder.relative_to;
            let act = reminder.action;

            let mut existing_rem = conn
                .query(
                    "SELECT id FROM reminders WHERE id = ?1",
                    params![reminder.id.clone()],
                )
                .await
                .map_err(|e| format!("Failed to check reminder: {}", e))?;

            if existing_rem
                .next()
                .await
                .map_err(|e| format!("Error checking reminder: {}", e))?
                .is_some()
            {
                conn.execute(
                    "UPDATE reminders SET trigger = ?2, relative_to = ?3, action = ?4, description = ?5, updated_at = ?6, deleted_at = NULL WHERE id = ?1",
                    params![
                        reminder.id,
                        reminder.trigger,
                        rel,
                        act,
                        reminder.description,
                        now.clone()
                    ],
                )
                .await
                .map_err(|e| format!("Failed to update reminder: {}", e))?;
            } else {
                conn.execute(
                    "INSERT INTO reminders (id, task_id, trigger, relative_to, action, description, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
                    params![
                        reminder.id,
                        task_id.clone(),
                        reminder.trigger,
                        rel,
                        act,
                        reminder.description,
                        now.clone()
                    ],
                )
                .await
                .map_err(|e| format!("Failed to insert reminder: {}", e))?;
            }
            reminders_imported += 1;
        }

        // Checklist items (normalize into subtasks per standard.md §5.3)
        if let Some(checklist) = task.checklist {
            for item in checklist {
                let sub_comp = if item.completed { 1i64 } else { 0i64 };
                let sub_comp_at = if item.completed {
                    Some(now.clone())
                } else {
                    None
                };
                let sub_status = if item.completed {
                    "completed"
                } else {
                    "needs_action"
                };

                let mut existing_sub = conn
                    .query(
                        "SELECT id FROM tasks WHERE id = ?1",
                        params![item.id.clone()],
                    )
                    .await
                    .map_err(|e| format!("Failed to check checklist subtask: {}", e))?;

                if existing_sub
                    .next()
                    .await
                    .map_err(|e| format!("Error checking checklist subtask: {}", e))?
                    .is_some()
                {
                    conn.execute(
                        "UPDATE tasks SET title = ?2, completed = ?3, completed_at = ?4, status = ?5, position = ?6, updated_at = ?7, deleted_at = NULL WHERE id = ?1",
                        params![
                            item.id.clone(),
                            item.title,
                            sub_comp,
                            sub_comp_at,
                            sub_status,
                            item.position,
                            now.clone()
                        ],
                    )
                    .await
                    .map_err(|e| format!("Failed to update checklist subtask: {}", e))?;
                } else {
                    conn.execute(
                        "INSERT INTO tasks (id, parent_id, list_id, title, completed, completed_at, status, position, created_at, updated_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
                        params![
                            item.id.clone(),
                            None::<String>,
                            effective_list_id.clone(),
                            item.title,
                            sub_comp,
                            sub_comp_at,
                            sub_status,
                            item.position,
                            now.clone()
                        ],
                    )
                    .await
                    .map_err(|e| format!("Failed to insert checklist subtask: {}", e))?;
                }
                pending_parent_updates.push((item.id.clone(), task_id.clone()));
                tasks_imported += 1;
            }
        }
    }

    // 4. Pass 2: Safely link parent-child task relationships
    for (child_id, parent_id) in pending_parent_updates {
        let mut p_check = conn
            .query("SELECT 1 FROM tasks WHERE id = ?1", params![parent_id.clone()])
            .await
            .map_err(|e| format!("Failed to check parent task: {}", e))?;
        if p_check
            .next()
            .await
            .map_err(|e| format!("Error checking parent task: {}", e))?
            .is_some()
        {
            conn.execute(
                "UPDATE tasks SET parent_id = ?1 WHERE id = ?2",
                params![parent_id, child_id],
            )
            .await
            .map_err(|e| format!("Failed to link parent task: {}", e))?;
        }
    }

    Ok(ImportBackupResult {
        lists_imported,
        tasks_imported,
        tags_imported,
        notes_imported,
        reminders_imported,
    })
}

pub async fn import_backup_impl(
    conn: &Connection,
    doc: OpenTaskDocument,
) -> Result<ImportBackupResult, String> {
    conn.execute("BEGIN TRANSACTION", ())
        .await
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    match import_backup_inner(conn, doc).await {
        Ok(res) => {
            conn.execute("COMMIT", ())
                .await
                .map_err(|e| format!("Failed to commit transaction: {}", e))?;
            Ok(res)
        }
        Err(err) => {
            let _ = conn.execute("ROLLBACK", ()).await;
            Err(err)
        }
    }
}

pub async fn import_backup_json_impl(
    conn: &Connection,
    json_str: &str,
) -> Result<ImportBackupResult, String> {
    let doc: OpenTaskDocument = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse OpenTask JSON: {}", e))?;
    import_backup_impl(conn, doc).await
}

#[tauri::command]
pub async fn import_backup(
    state: State<'_, DbState>,
    document: OpenTaskDocument,
) -> Result<ImportBackupResult, String> {
    import_backup_impl(&state.conn, document).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::common::setup_test_conn;
    use crate::commands::lists::{create_list_impl, get_lists_impl};
    use crate::commands::notes::add_note_impl;
    use crate::commands::reminders::add_reminder_impl;
    use crate::commands::tags::create_tag_impl;
    use crate::commands::tasks::{create_task_impl, fetch_task_by_id, update_task_impl};
    use crate::db::init_db;
    use crate::models::UpdateTaskInput;

    #[test]
    fn test_opentask_export_and_import() {
        tauri::async_runtime::block_on(async {
            let (conn, temp_dir) = setup_test_conn().await;

            // Create initial data
            let list = create_list_impl(&conn, "Sprint Tasks".to_string(), Some("#6366f1".to_string()), None)
                .await
                .expect("create list");

            let task = create_task_impl(
                &conn,
                list.id.clone(),
                "Implement OpenTask spec".to_string(),
                Some("2026-09-12T17:00:00Z".to_string()),
                Some(1),
                None,
            )
            .await
            .expect("create task");

            // Update with extra OpenTask metadata
            let opentask_update: UpdateTaskInput = serde_json::from_value(serde_json::json!({
                "id": task.id,
                "timezone": "America/Los_Angeles",
                "duration": "PT2H",
                "percent_complete": 75,
                "location": "HQ Room 4",
                "geo": { "latitude": 37.7749, "longitude": -122.4194 },
                "url": "https://example.com/spec",
                "freeform_x": 125.5,
                "freeform_y": 250.0,
                "extra": { "vendor_note": "custom ticktick token" }
            }))
            .expect("deserialize opentask update input");
            update_task_impl(&conn, opentask_update)
                .await
                .expect("update task with opentask metadata");

            // Add note and reminder
            add_note_impl(
                &conn,
                task.id.clone(),
                "Specs reviewed and approved".to_string(),
                Some("Spec Review".to_string()),
            )
            .await
            .expect("add note");

            add_reminder_impl(
                &conn,
                task.id.clone(),
                "-PT30M".to_string(),
                Some("due".to_string()),
                Some("display".to_string()),
                Some("Reminder to review".to_string()),
            )
            .await
            .expect("add reminder");

            // Add a tag and link it
            let tag = create_tag_impl(&conn, "release-v1".to_string(), Some("#ec4899".to_string()))
                .await
                .expect("create tag");
            conn.execute(
                "INSERT INTO task_tags (task_id, tag_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
                params![task.id.clone(), tag.id, now_iso()],
            )
            .await
            .expect("link tag");

            // 1. Export backup to OpenTaskDocument
            let exported = export_backup_impl(&conn).await.expect("export backup");
            assert_eq!(exported.version, "1.0");
            assert_eq!(exported.source, Some("tudu".to_string()));
            assert_eq!(exported.lists.len(), 2);
            assert!(exported.lists.iter().any(|l| l.name == "Inbox"));
            assert!(exported.lists.iter().any(|l| l.name == "Sprint Tasks"));
            assert_eq!(exported.tasks.len(), 1);

            let exp_task = &exported.tasks[0];
            assert_eq!(exp_task.title, "Implement OpenTask spec");
            assert_eq!(exp_task.priority, "high");
            assert_eq!(exp_task.priority_raw, Some(serde_json::json!(1)));
            assert_eq!(exp_task.status, "needs_action");
            assert_eq!(exp_task.timezone, Some("America/Los_Angeles".to_string()));
            assert_eq!(exp_task.duration, Some("PT2H".to_string()));
            assert_eq!(exp_task.percent_complete, 75);
            assert_eq!(exp_task.tags, vec!["release-v1"]);
            assert_eq!(exp_task.notes.len(), 1);
            assert_eq!(exp_task.notes[0].content, "Specs reviewed and approved");
            assert_eq!(exp_task.reminders.len(), 1);
            assert_eq!(exp_task.reminders[0].trigger, "-PT30M");
            assert_eq!(exp_task.reminders[0].description, Some("Reminder to review".to_string()));
            assert!(exp_task.geo.is_some());
            let geo = exp_task.geo.as_ref().unwrap();
            assert_eq!(geo.latitude, 37.7749);
            assert_eq!(geo.longitude, -122.4194);
            let extra_obj = exp_task.extra.as_ref().expect("has extra");
            assert_eq!(extra_obj.get("freeform_x"), Some(&serde_json::json!(125.5)));
            assert_eq!(extra_obj.get("freeform_y"), Some(&serde_json::json!(250.0)));
            assert_eq!(
                extra_obj.get("vendor_note"),
                Some(&serde_json::json!("custom ticktick token"))
            );

            // Validate that exported document serializes to JSON cleanly
            let json_str = serde_json::to_string_pretty(&exported).expect("serialize opentask json");
            assert!(json_str.contains("\"version\": \"1.0\""));

            // 2. Test importing an external OpenTask document with checklist items
            let external_json = r##"{
                "version": "1.0",
                "source": "todoist",
                "lists": [
                    { "id": "list-ext-1", "name": "Imported Project", "color": "#10b981", "position": 2 }
                ],
                "tags": [
                    { "id": "tag-ext-1", "name": "urgent", "color": "#ef4444" }
                ],
                "tasks": [
                    {
                        "id": "task-ext-1",
                        "list_id": "list-ext-1",
                        "title": "Imported Task with Checklist",
                        "priority": "medium",
                        "priority_raw": 2,
                        "status": "needs_action",
                        "tags": ["urgent"],
                        "extra": {
                            "freeform_x": 300.0,
                            "freeform_y": 450.0
                        },
                        "checklist": [
                            { "id": "sub-ext-1", "title": "First Subtask", "completed": true, "position": 0 },
                            { "id": "sub-ext-2", "title": "Second Subtask", "completed": false, "position": 1 }
                        ]
                    }
                ]
            }"##;

            let import_result = import_backup_json_impl(&conn, external_json)
                .await
                .expect("import backup json");
            assert_eq!(import_result.lists_imported, 1);
            // 1 parent task + 2 checklist subtasks = 3 tasks imported
            assert_eq!(import_result.tasks_imported, 3);
            assert_eq!(import_result.tags_imported, 1);

            // Verify imported task
            let imported_task = fetch_task_by_id(&conn, "task-ext-1")
                .await
                .expect("fetch imported task")
                .expect("imported task found");
            assert_eq!(imported_task.title, "Imported Task with Checklist");
            assert_eq!(imported_task.priority, Some(2));
            assert_eq!(imported_task.status, "needs_action");
            assert!(!imported_task.completed);

            assert_eq!(imported_task.freeform_x, Some(300.0));
            assert_eq!(imported_task.freeform_y, Some(450.0));

            // 3. Round-trip: import exported backup into a separate fresh DB and verify coordinates restored
            let (conn2, temp_dir2) = setup_test_conn().await;
            import_backup_json_impl(&conn2, &json_str)
                .await
                .expect("import exported backup into new db");
            let rt_task = fetch_task_by_id(&conn2, &task.id)
                .await
                .expect("fetch roundtrip task")
                .expect("roundtrip task found");
            assert_eq!(rt_task.freeform_x, Some(125.5));
            assert_eq!(rt_task.freeform_y, Some(250.0));
            let _ = std::fs::remove_dir_all(temp_dir2);
            // Verify checklist items were converted to subtasks with parent_id
            let sub1 = fetch_task_by_id(&conn, "sub-ext-1")
                .await
                .expect("fetch sub1")
                .expect("sub1 found");
            assert_eq!(sub1.parent_id, Some("task-ext-1".to_string()));
            assert_eq!(sub1.title, "First Subtask");
            assert!(sub1.completed);
            assert_eq!(sub1.status, "completed");

            let sub2 = fetch_task_by_id(&conn, "sub-ext-2")
                .await
                .expect("fetch sub2")
                .expect("sub2 found");
            assert_eq!(sub2.parent_id, Some("task-ext-1".to_string()));
            assert_eq!(sub2.title, "Second Subtask");
            assert!(!sub2.completed);
            assert_eq!(sub2.status, "needs_action");

            let _ = std::fs::remove_dir_all(temp_dir);
        });
    }

    #[test]
    fn test_import_backup_foreign_key_resilience() {
        tauri::async_runtime::block_on(async {
            let temp_dir = std::env::temp_dir().join(format!("tudu_test_fk_{}", uuid::Uuid::new_v4()));
            let db_path = temp_dir.join("test.db");
            let state = crate::db::init_db(&db_path).await.expect("init_db failed");
            let conn = state.conn;

            // JSON with:
            // 1. Child task "child-1" placed BEFORE parent task "parent-1"
            // 2. Orphaned child task "child-orphan" referencing non-existent parent "parent-ghost"
            // 3. Task with unlisted list_id "unlisted-list-1"
            // 4. Task with empty list_id ""
            let test_json = r##"{
                "version": "1.0",
                "source": "rtm",
                "exported_at": "2026-09-10T12:00:00Z",
                "lists": [
                    { "id": "list-known", "name": "Work", "position": 0, "is_archived": false }
                ],
                "tasks": [
                    {
                        "id": "child-1",
                        "list_id": "list-known",
                        "parent_id": "parent-1",
                        "title": "Subtask Before Parent",
                        "status": "needs_action"
                    },
                    {
                        "id": "parent-1",
                        "list_id": "list-known",
                        "parent_id": null,
                        "title": "Parent Task After Subtask",
                        "status": "needs_action"
                    },
                    {
                        "id": "child-orphan",
                        "list_id": "list-known",
                        "parent_id": "parent-ghost",
                        "title": "Orphan Subtask",
                        "status": "needs_action"
                    },
                    {
                        "id": "task-unlisted-list",
                        "list_id": "unlisted-list-1",
                        "parent_id": null,
                        "title": "Task in Unlisted List",
                        "status": "needs_action"
                    },
                    {
                        "id": "task-empty-list",
                        "list_id": "",
                        "parent_id": null,
                        "title": "Task in Empty List",
                        "status": "needs_action"
                    }
                ]
            }"##;

            let result = import_backup_json_impl(&conn, test_json)
                .await
                .expect("import backup json must succeed without foreign key failure");
            assert_eq!(result.tasks_imported, 5);

            // Verify child-1 is linked to parent-1
            let child1 = fetch_task_by_id(&conn, "child-1")
                .await
                .expect("fetch child1")
                .expect("child1 found");
            assert_eq!(child1.parent_id, Some("parent-1".to_string()));

            // Verify orphan child has parent_id = None
            let orphan = fetch_task_by_id(&conn, "child-orphan")
                .await
                .expect("fetch orphan")
                .expect("orphan found");
            assert_eq!(orphan.parent_id, None);

            // Verify unlisted list task was imported
            let unlisted_task = fetch_task_by_id(&conn, "task-unlisted-list")
                .await
                .expect("fetch unlisted_task")
                .expect("unlisted_task found");
            assert_eq!(unlisted_task.list_id, "unlisted-list-1");

            // Verify empty list task defaulted to default inbox
            let empty_list_task = fetch_task_by_id(&conn, "task-empty-list")
                .await
                .expect("fetch empty_list_task")
                .expect("empty_list_task found");
            assert_eq!(empty_list_task.list_id, "00000000-0000-0000-0000-000000000001");

            let _ = std::fs::remove_dir_all(temp_dir);
        });
    }

    #[test]
    fn test_import_backup_atomicity_rollback() {
        tauri::async_runtime::block_on(async {
            let temp_dir = std::env::temp_dir().join(format!("tudu_test_{}", Uuid::new_v4()));
            let db_path = temp_dir.join("test.db");
            let state = init_db(&db_path).await.expect("init db");
            let conn = state.conn;

            let lists_before = get_lists_impl(&conn).await.expect("get lists before");
            let count_before = lists_before.len();

            // Construct payload with 1 valid list and 1 task violating foreign key
            let rollback_list_id = Uuid::new_v4().to_string();
            let invalid_doc = OpenTaskDocument {
                version: "1.0".to_string(),
                exported_at: Some(now_iso()),
                source: Some("tudu".to_string()),
                lists: vec![OpenTaskTaskList {
                    id: rollback_list_id.clone(),
                    name: "Rollback List".to_string(),
                    color: Some("#ff0000".to_string()),
                    position: 10,
                    is_archived: false,
                    icon: None,
                    extra: None,
                }],
                tags: None,
                tasks: vec![OpenTaskTask {
                    id: Uuid::new_v4().to_string(),
                    uid: None,
                    list_id: "non-existent-list-id-violating-fk".to_string(),
                    parent_id: None,
                    title: "Invalid Task".to_string(),
                    description: None,
                    notes: Vec::new(),
                    status: "needs_action".to_string(),
                    completed_at: None,
                    due: None,
                    is_all_day: false,
                    start: None,
                    duration: None,
                    timezone: None,
                    priority: "none".to_string(),
                    priority_raw: None,
                    percent_complete: 0,
                    tags: Vec::new(),
                    rrule: None,
                    repeats: None,
                    location: None,
                    geo: None,
                    color: None,
                    url: None,
                    position: 0,
                    checklist: None,
                    reminders: Vec::new(),
                    created_at: None,
                    updated_at: None,
                    deleted_at: None,
                    extra: None,
                }],
            };

            // Force a failure on task insertion after list has been inserted
            conn.execute(
                "CREATE TRIGGER fail_task_insert BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'forced test failure'); END;",
                (),
            )
            .await
            .expect("create failure trigger");

            let res = import_backup_impl(&conn, invalid_doc).await;
            assert!(res.is_err(), "Expected import to fail due to trigger failure");

            // Verify transaction rolled back: the list inserted before task failure was not committed
            let lists_after = get_lists_impl(&conn).await.expect("get lists after");
            assert_eq!(lists_after.len(), count_before);
            assert!(
                !lists_after.iter().any(|l| l.id == rollback_list_id),
                "Rollback List should not exist after failed import"
            );

            let _ = std::fs::remove_dir_all(temp_dir);
        });
    }
}
