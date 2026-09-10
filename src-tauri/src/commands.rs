use chrono::Utc;
use libsql::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use uuid::Uuid;

use crate::db::DbState;
use crate::models::{
    opentask_to_priority, priority_to_opentask, status_to_completed, GeoLocation, List, Note,
    OpenTaskDocument, OpenTaskNote, OpenTaskReminder, OpenTaskTag, OpenTaskTask,
    OpenTaskTaskList, Reminder, Tag, Task,
};

pub const LIST_SELECT_COLS: &str =
    "id, name, color, position, is_archived, extra, created_at, updated_at, deleted_at";

pub const TASK_SELECT_COLS: &str =
    "id, uid, parent_id, list_id, title, description, due, is_all_day, rrule, priority, location, url, completed, completed_at, status, start, duration, timezone, percent_complete, color, position, geo_latitude, geo_longitude, extra, created_at, updated_at, deleted_at";

pub const REMINDER_SELECT_COLS: &str =
    "id, task_id, trigger, relative_to, action, description, created_at, updated_at, deleted_at";

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn row_to_list(row: &Row) -> Result<List, libsql::Error> {
    let is_archived_int: i64 = row.get(4).unwrap_or(0);
    let extra_str: Option<String> = row.get(5)?;
    let extra = extra_str.and_then(|s| serde_json::from_str(&s).ok());
    Ok(List {
        id: row.get(0)?,
        name: row.get(1)?,
        color: row.get(2)?,
        position: row.get(3)?,
        is_archived: is_archived_int != 0,
        extra,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
        deleted_at: row.get(8)?,
    })
}

fn row_to_task(row: &Row) -> Result<Task, libsql::Error> {
    let is_all_day_int: i64 = row.get(7)?;
    let completed_int: i64 = row.get(12)?;
    let status_str: Option<String> = row.get(14)?;
    let status = status_str.unwrap_or_else(|| {
        if completed_int != 0 {
            "completed".to_string()
        } else {
            "needs_action".to_string()
        }
    });
    let extra_str: Option<String> = row.get(23)?;
    let extra = extra_str.and_then(|s| serde_json::from_str(&s).ok());
    Ok(Task {
        id: row.get(0)?,
        uid: row.get(1)?,
        parent_id: row.get(2)?,
        list_id: row.get(3)?,
        title: row.get(4)?,
        description: row.get(5)?,
        due: row.get(6)?,
        is_all_day: is_all_day_int != 0,
        rrule: row.get(8)?,
        priority: row.get(9)?,
        location: row.get(10)?,
        url: row.get(11)?,
        completed: completed_int != 0,
        completed_at: row.get(13)?,
        status,
        start: row.get(15)?,
        duration: row.get(16)?,
        timezone: row.get(17)?,
        percent_complete: row.get(18).unwrap_or(0),
        color: row.get(19)?,
        position: row.get(20).unwrap_or(0),
        geo_latitude: row.get(21)?,
        geo_longitude: row.get(22)?,
        extra,
        created_at: row.get(24)?,
        updated_at: row.get(25)?,
        deleted_at: row.get(26)?,
    })
}

fn row_to_reminder(row: &Row) -> Result<Reminder, libsql::Error> {
    Ok(Reminder {
        id: row.get(0)?,
        task_id: row.get(1)?,
        trigger: row.get(2)?,
        relative_to: row.get(3)?,
        action: row.get(4)?,
        description: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
        deleted_at: row.get(8)?,
    })
}

fn row_to_tag(row: &Row) -> Result<Tag, libsql::Error> {
    Ok(Tag {
        id: row.get(0)?,
        name: row.get(1)?,
        color: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        deleted_at: row.get(5)?,
    })
}

fn row_to_note(row: &Row) -> Result<Note, libsql::Error> {
    Ok(Note {
        id: row.get(0)?,
        task_id: row.get(1)?,
        title: row.get(2)?,
        content: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
        deleted_at: row.get(6)?,
    })
}

// ---------------------------------------------------------------------------
// 3.1 List Commands
// ---------------------------------------------------------------------------

pub async fn get_lists_impl(conn: &Connection) -> Result<Vec<List>, String> {
    let query = format!(
        "SELECT {}
         FROM lists
         WHERE deleted_at IS NULL
         ORDER BY position ASC, created_at ASC",
        LIST_SELECT_COLS
    );

    let mut rows = conn
        .query(&query, ())
        .await
        .map_err(|e| format!("Failed to query lists: {}", e))?;

    let mut lists = Vec::new();
    while let Some(row) = rows
        .next()
        .await
        .map_err(|e| format!("Failed to read list row: {}", e))?
    {
        lists.push(row_to_list(&row).map_err(|e| format!("Failed to parse list: {}", e))?);
    }

    Ok(lists)
}

#[tauri::command]
pub async fn get_lists(state: State<'_, DbState>) -> Result<Vec<List>, String> {
    get_lists_impl(&state.conn).await
}

pub async fn create_list_impl(
    conn: &Connection,
    name: String,
    color: Option<String>,
) -> Result<List, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("List name cannot be empty".to_string());
    }

    let mut rows = conn
        .query(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM lists WHERE deleted_at IS NULL",
            (),
        )
        .await
        .map_err(|e| format!("Failed to compute next list position: {}", e))?;

    let position = if let Some(row) = rows
        .next()
        .await
        .map_err(|e| format!("Failed to read position row: {}", e))?
    {
        let pos: i64 = row.get(0).map_err(|e| format!("Failed to get position integer: {}", e))?;
        pos
    } else {
        0
    };

    let id = Uuid::now_v7().to_string();
    let now = now_iso();

    conn.execute(
        "INSERT INTO lists (id, name, color, position, is_archived, extra, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 0, NULL, ?5, ?5)",
        params![id.clone(), name.clone(), color.clone(), position, now.clone()],
    )
    .await
    .map_err(|e| format!("Failed to insert list: {}", e))?;

    Ok(List {
        id,
        name,
        color,
        position,
        is_archived: false,
        extra: None,
        created_at: now.clone(),
        updated_at: now,
        deleted_at: None,
    })
}

#[tauri::command]
pub async fn create_list(
    state: State<'_, DbState>,
    name: String,
    color: Option<String>,
) -> Result<List, String> {
    create_list_impl(&state.conn, name, color).await
}

pub async fn delete_list_impl(conn: &Connection, id: String) -> Result<(), String> {
    let now = now_iso();
    conn.execute(
        "UPDATE lists SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1 AND deleted_at IS NULL",
        params![id, now],
    )
    .await
    .map_err(|e| format!("Failed to delete list: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn delete_list(state: State<'_, DbState>, id: String) -> Result<(), String> {
    delete_list_impl(&state.conn, id).await
}

// ---------------------------------------------------------------------------
// 3.2 Task Commands
// ---------------------------------------------------------------------------

pub async fn get_tasks_impl(
    conn: &Connection,
    list_id: String,
    include_completed: Option<bool>,
) -> Result<Vec<Task>, String> {
    let include_completed = include_completed.unwrap_or(false);

    let query_str = if include_completed {
        format!(
            "SELECT {}
             FROM tasks
             WHERE list_id = ?1 AND deleted_at IS NULL
             ORDER BY completed ASC, priority ASC, due ASC, created_at ASC",
            TASK_SELECT_COLS
        )
    } else {
        format!(
            "SELECT {}
             FROM tasks
             WHERE list_id = ?1 AND completed = 0 AND deleted_at IS NULL
             ORDER BY priority ASC, due ASC, created_at ASC",
            TASK_SELECT_COLS
        )
    };

    let mut rows = conn
        .query(&query_str, params![list_id])
        .await
        .map_err(|e| format!("Failed to query tasks: {}", e))?;

    let mut tasks = Vec::new();
    while let Some(row) = rows
        .next()
        .await
        .map_err(|e| format!("Failed to read task row: {}", e))?
    {
        tasks.push(row_to_task(&row).map_err(|e| format!("Failed to parse task: {}", e))?);
    }

    Ok(tasks)
}

#[tauri::command]
pub async fn get_tasks(
    state: State<'_, DbState>,
    list_id: String,
    include_completed: Option<bool>,
) -> Result<Vec<Task>, String> {
    get_tasks_impl(&state.conn, list_id, include_completed).await
}

pub async fn create_task_impl(
    conn: &Connection,
    list_id: String,
    title: String,
    due: Option<String>,
    priority: Option<i64>,
    parent_id: Option<String>,
) -> Result<Task, String> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("Task title cannot be empty".to_string());
    }

    let mut list_rows = conn
        .query(
            "SELECT id FROM lists WHERE id = ?1 AND deleted_at IS NULL",
            params![list_id.clone()],
        )
        .await
        .map_err(|e| format!("Failed to verify list: {}", e))?;

    if list_rows
        .next()
        .await
        .map_err(|e| format!("Failed to fetch list row: {}", e))?
        .is_none()
    {
        return Err(format!("List with ID '{}' does not exist", list_id));
    }

    if let Some(pid) = &parent_id {
        let mut parent_rows = conn
            .query(
                "SELECT id FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
                params![pid.clone()],
            )
            .await
            .map_err(|e| format!("Failed to verify parent task: {}", e))?;

        if parent_rows
            .next()
            .await
            .map_err(|e| format!("Failed to fetch parent task row: {}", e))?
            .is_none()
        {
            return Err(format!("Parent task with ID '{}' does not exist", pid));
        }
    }

    let id = Uuid::now_v7().to_string();
    let now = now_iso();

    conn.execute(
        "INSERT INTO tasks (id, uid, parent_id, list_id, title, description, due, is_all_day, rrule, priority, completed, status, percent_complete, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?9, 0, 'needs_action', 0, 0, ?10, ?10)",
        params![
            id.clone(),
            None::<String>,
            parent_id.clone(),
            list_id.clone(),
            title.clone(),
            None::<String>,
            due.clone(),
            None::<String>,
            priority,
            now.clone()
        ],
    )
    .await
    .map_err(|e| format!("Failed to insert task: {}", e))?;

    Ok(Task {
        id,
        uid: None,
        parent_id,
        list_id,
        title,
        description: None,
        due,
        is_all_day: false,
        rrule: None,
        priority,
        location: None,
        url: None,
        completed: false,
        completed_at: None,
        status: "needs_action".to_string(),
        start: None,
        duration: None,
        timezone: None,
        percent_complete: 0,
        color: None,
        position: 0,
        geo_latitude: None,
        geo_longitude: None,
        extra: None,
        created_at: now.clone(),
        updated_at: now,
        deleted_at: None,
    })
}

#[tauri::command]
pub async fn create_task(
    state: State<'_, DbState>,
    list_id: String,
    title: String,
    due: Option<String>,
    priority: Option<i64>,
    parent_id: Option<String>,
) -> Result<Task, String> {
    create_task_impl(&state.conn, list_id, title, due, priority, parent_id).await
}

async fn fetch_task_by_id(conn: &Connection, id: &str) -> Result<Option<Task>, String> {
    let query = format!(
        "SELECT {}
         FROM tasks
         WHERE id = ?1 AND deleted_at IS NULL",
        TASK_SELECT_COLS
    );

    let mut rows = conn
        .query(&query, params![id.to_string()])
        .await
        .map_err(|e| format!("Failed to query task: {}", e))?;

    if let Some(row) = rows
        .next()
        .await
        .map_err(|e| format!("Failed to read task row: {}", e))?
    {
        Ok(Some(
            row_to_task(&row).map_err(|e| format!("Failed to parse task: {}", e))?,
        ))
    } else {
        Ok(None)
    }
}

pub async fn update_task_impl(conn: &Connection, task: Value) -> Result<Task, String> {
    let id = task
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing required 'id' in task payload".to_string())?;

    let existing = fetch_task_by_id(conn, id)
        .await?
        .ok_or_else(|| format!("Task with ID '{}' not found", id))?;

    let map = task
        .as_object()
        .ok_or_else(|| "Task payload must be a JSON object".to_string())?;

    let title = if let Some(v) = map.get("title") {
        let t = v
            .as_str()
            .ok_or_else(|| "'title' must be a string".to_string())?
            .trim()
            .to_string();
        if t.is_empty() {
            return Err("Task title cannot be empty".to_string());
        }
        t
    } else {
        existing.title
    };

    let list_id = if let Some(v) = map.get("list_id").or_else(|| map.get("listId")) {
        v.as_str()
            .ok_or_else(|| "'list_id' must be a string".to_string())?
            .to_string()
    } else {
        existing.list_id
    };

    let parent_id = if let Some(v) = map.get("parent_id").or_else(|| map.get("parentId")) {
        if v.is_null() {
            None
        } else {
            Some(
                v.as_str()
                    .ok_or_else(|| "'parent_id' must be a string or null".to_string())?
                    .to_string(),
            )
        }
    } else {
        existing.parent_id
    };

    let due = if let Some(v) = map.get("due") {
        if v.is_null() {
            None
        } else {
            Some(
                v.as_str()
                    .ok_or_else(|| "'due' must be a string or null".to_string())?
                    .to_string(),
            )
        }
    } else {
        existing.due
    };

    let uid = if let Some(v) = map.get("uid") {
        if v.is_null() {
            None
        } else {
            Some(
                v.as_str()
                    .ok_or_else(|| "'uid' must be a string or null".to_string())?
                    .to_string(),
            )
        }
    } else {
        existing.uid
    };

    let description = if let Some(v) = map.get("description") {
        if v.is_null() {
            None
        } else {
            Some(
                v.as_str()
                    .ok_or_else(|| "'description' must be a string or null".to_string())?
                    .to_string(),
            )
        }
    } else {
        existing.description
    };

    let is_all_day = if let Some(v) = map.get("is_all_day").or_else(|| map.get("isAllDay")) {
        v.as_bool()
            .ok_or_else(|| "'is_all_day' must be a boolean".to_string())?
    } else {
        existing.is_all_day
    };

    let rrule = if let Some(v) = map.get("rrule").or_else(|| map.get("repeats")) {
        if v.is_null() {
            None
        } else {
            Some(
                v.as_str()
                    .ok_or_else(|| "'rrule' must be a string or null".to_string())?
                    .to_string(),
            )
        }
    } else {
        existing.rrule
    };

    let priority = if let Some(v) = map.get("priority") {
        if v.is_null() {
            None
        } else {
            Some(
                v.as_i64()
                    .ok_or_else(|| "'priority' must be an integer or null".to_string())?,
            )
        }
    } else {
        existing.priority
    };

    let location = if let Some(v) = map.get("location") {
        if v.is_null() {
            None
        } else {
            Some(
                v.as_str()
                    .ok_or_else(|| "'location' must be a string or null".to_string())?
                    .to_string(),
            )
        }
    } else {
        existing.location
    };

    let url = if let Some(v) = map.get("url") {
        if v.is_null() {
            None
        } else {
            Some(
                v.as_str()
                    .ok_or_else(|| "'url' must be a string or null".to_string())?
                    .to_string(),
            )
        }
    } else {
        existing.url
    };

    let now = now_iso();

    // Synchronize completed, completed_at, and status
    let (completed, completed_at, status) = if let Some(status_val) = map.get("status") {
        let s = status_val
            .as_str()
            .ok_or_else(|| "'status' must be a string".to_string())?
            .to_string();
        let is_comp = s.eq_ignore_ascii_case("completed");
        let c_at = if is_comp {
            existing.completed_at.or(Some(now.clone()))
        } else {
            None
        };
        (is_comp, c_at, s)
    } else if let Some(v) = map.get("completed") {
        let is_comp = v
            .as_bool()
            .ok_or_else(|| "'completed' must be a boolean".to_string())?;
        if is_comp {
            let cat = if let Some(c_at_val) =
                map.get("completed_at").or_else(|| map.get("completedAt"))
            {
                if c_at_val.is_null() {
                    Some(now.clone())
                } else {
                    Some(
                        c_at_val
                            .as_str()
                            .ok_or_else(|| "'completed_at' must be a string or null".to_string())?
                            .to_string(),
                    )
                }
            } else {
                existing.completed_at.or(Some(now.clone()))
            };
            (true, cat, "completed".to_string())
        } else {
            (false, None, "needs_action".to_string())
        }
    } else {
        (existing.completed, existing.completed_at, existing.status)
    };

    let start = if let Some(v) = map.get("start") {
        if v.is_null() {
            None
        } else {
            Some(
                v.as_str()
                    .ok_or_else(|| "'start' must be a string or null".to_string())?
                    .to_string(),
            )
        }
    } else {
        existing.start
    };

    let duration = if let Some(v) = map.get("duration") {
        if v.is_null() {
            None
        } else {
            Some(
                v.as_str()
                    .ok_or_else(|| "'duration' must be a string or null".to_string())?
                    .to_string(),
            )
        }
    } else {
        existing.duration
    };

    let timezone = if let Some(v) = map.get("timezone") {
        if v.is_null() {
            None
        } else {
            Some(
                v.as_str()
                    .ok_or_else(|| "'timezone' must be a string or null".to_string())?
                    .to_string(),
            )
        }
    } else {
        existing.timezone
    };

    let percent_complete = if let Some(v) =
        map.get("percent_complete").or_else(|| map.get("percentComplete"))
    {
        v.as_i64()
            .ok_or_else(|| "'percent_complete' must be an integer".to_string())?
    } else {
        existing.percent_complete
    };

    let color = if let Some(v) = map.get("color") {
        if v.is_null() {
            None
        } else {
            Some(
                v.as_str()
                    .ok_or_else(|| "'color' must be a string or null".to_string())?
                    .to_string(),
            )
        }
    } else {
        existing.color
    };

    let position = if let Some(v) = map.get("position") {
        v.as_i64()
            .ok_or_else(|| "'position' must be an integer".to_string())?
    } else {
        existing.position
    };

    let (geo_latitude, geo_longitude) = if let Some(v) = map.get("geo") {
        if v.is_null() {
            (None, None)
        } else if let Some(geo_obj) = v.as_object() {
            let lat = geo_obj.get("latitude").and_then(|x| x.as_f64());
            let lng = geo_obj.get("longitude").and_then(|x| x.as_f64());
            (lat, lng)
        } else {
            (None, None)
        }
    } else {
        let lat = if let Some(v) = map.get("geo_latitude").or_else(|| map.get("geoLatitude")) {
            v.as_f64()
        } else {
            existing.geo_latitude
        };
        let lng = if let Some(v) = map.get("geo_longitude").or_else(|| map.get("geoLongitude")) {
            v.as_f64()
        } else {
            existing.geo_longitude
        };
        (lat, lng)
    };

    let extra_str = if let Some(v) = map.get("extra") {
        if v.is_null() {
            None
        } else {
            Some(v.to_string())
        }
    } else {
        existing.extra.map(|x| x.to_string())
    };

    let completed_int = if completed { 1i64 } else { 0i64 };
    let is_all_day_int = if is_all_day { 1i64 } else { 0i64 };

    conn.execute(
        "UPDATE tasks
         SET uid = ?2, parent_id = ?3, list_id = ?4, title = ?5, description = ?6,
             due = ?7, is_all_day = ?8, rrule = ?9, priority = ?10,
             location = ?11, url = ?12, completed = ?13,
             completed_at = ?14, status = ?15, start = ?16, duration = ?17,
             timezone = ?18, percent_complete = ?19, color = ?20, position = ?21,
             geo_latitude = ?22, geo_longitude = ?23, extra = ?24, updated_at = ?25
         WHERE id = ?1 AND deleted_at IS NULL",
        params![
            id.to_string(),
            uid,
            parent_id,
            list_id,
            title,
            description,
            due,
            is_all_day_int,
            rrule,
            priority,
            location,
            url,
            completed_int,
            completed_at,
            status,
            start,
            duration,
            timezone,
            percent_complete,
            color,
            position,
            geo_latitude,
            geo_longitude,
            extra_str,
            now
        ],
    )
    .await
    .map_err(|e| format!("Failed to update task: {}", e))?;

    fetch_task_by_id(conn, id)
        .await?
        .ok_or_else(|| format!("Task with ID '{}' not found after update", id))
}

#[tauri::command]
pub async fn update_task(state: State<'_, DbState>, task: Value) -> Result<Task, String> {
    update_task_impl(&state.conn, task).await
}

pub async fn delete_task_impl(conn: &Connection, id: String) -> Result<(), String> {
    let now = now_iso();
    // Soft delete task and all its descendant subtasks recursively
    conn.execute(
        "WITH RECURSIVE descendants AS (
            SELECT id FROM tasks WHERE id = ?1
            UNION ALL
            SELECT t.id FROM tasks t INNER JOIN descendants d ON t.parent_id = d.id
        )
        UPDATE tasks
        SET deleted_at = ?2, updated_at = ?2
        WHERE id IN (SELECT id FROM descendants) AND deleted_at IS NULL",
        params![id, now],
    )
    .await
    .map_err(|e| format!("Failed to recursively soft-delete task: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn delete_task(state: State<'_, DbState>, id: String) -> Result<(), String> {
    delete_task_impl(&state.conn, id).await
}

pub async fn toggle_task_complete_impl(
    conn: &Connection,
    id: String,
    completed: bool,
) -> Result<Task, String> {
    let now = now_iso();
    let (completed_int, completed_at, status) = if completed {
        (1i64, Some(now.clone()), "completed")
    } else {
        (0i64, None, "needs_action")
    };

    conn.execute(
        "UPDATE tasks
         SET completed = ?2, completed_at = ?3, status = ?4, updated_at = ?5
         WHERE id = ?1 AND deleted_at IS NULL",
        params![id.clone(), completed_int, completed_at, status, now],
    )
    .await
    .map_err(|e| format!("Failed to toggle task complete: {}", e))?;

    fetch_task_by_id(conn, &id)
        .await?
        .ok_or_else(|| format!("Task with ID '{}' not found", id))
}

#[tauri::command]
pub async fn toggle_task_complete(
    state: State<'_, DbState>,
    id: String,
    completed: bool,
) -> Result<Task, String> {
    toggle_task_complete_impl(&state.conn, id, completed).await
}

// ---------------------------------------------------------------------------
// 3.3 Tag & Note Commands
// ---------------------------------------------------------------------------

pub async fn get_tags_impl(conn: &Connection) -> Result<Vec<Tag>, String> {
    let mut rows = conn
        .query(
            "SELECT id, name, color, created_at, updated_at, deleted_at
             FROM tags
             WHERE deleted_at IS NULL
             ORDER BY name ASC",
            (),
        )
        .await
        .map_err(|e| format!("Failed to query tags: {}", e))?;

    let mut tags = Vec::new();
    while let Some(row) = rows
        .next()
        .await
        .map_err(|e| format!("Failed to read tag row: {}", e))?
    {
        tags.push(row_to_tag(&row).map_err(|e| format!("Failed to parse tag: {}", e))?);
    }

    Ok(tags)
}

#[tauri::command]
pub async fn get_tags(state: State<'_, DbState>) -> Result<Vec<Tag>, String> {
    get_tags_impl(&state.conn).await
}

pub async fn create_tag_impl(
    conn: &Connection,
    name: String,
    color: Option<String>,
) -> Result<Tag, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Tag name cannot be empty".to_string());
    }

    let mut existing_rows = conn
        .query(
            "SELECT id, name, color, created_at, updated_at, deleted_at FROM tags WHERE name = ?1",
            params![name.clone()],
        )
        .await
        .map_err(|e| format!("Failed to query existing tag: {}", e))?;

    if let Some(row) = existing_rows
        .next()
        .await
        .map_err(|e| format!("Failed to read tag row: {}", e))?
    {
        let mut tag = row_to_tag(&row).map_err(|e| format!("Failed to parse tag: {}", e))?;
        if tag.deleted_at.is_some() {
            let now = now_iso();
            conn.execute(
                "UPDATE tags SET deleted_at = NULL, color = ?2, updated_at = ?3 WHERE id = ?1",
                params![tag.id.clone(), color.clone(), now.clone()],
            )
            .await
            .map_err(|e| format!("Failed to restore tag: {}", e))?;
            tag.deleted_at = None;
            tag.color = color;
            tag.updated_at = now;
        }
        return Ok(tag);
    }

    let id = Uuid::now_v7().to_string();
    let now = now_iso();

    conn.execute(
        "INSERT INTO tags (id, name, color, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)",
        params![id.clone(), name.clone(), color.clone(), now.clone()],
    )
    .await
    .map_err(|e| format!("Failed to insert tag: {}", e))?;

    Ok(Tag {
        id,
        name,
        color,
        created_at: now.clone(),
        updated_at: now,
        deleted_at: None,
    })
}

#[tauri::command]
pub async fn create_tag(
    state: State<'_, DbState>,
    name: String,
    color: Option<String>,
) -> Result<Tag, String> {
    create_tag_impl(&state.conn, name, color).await
}

pub async fn get_notes_impl(conn: &Connection, task_id: String) -> Result<Vec<Note>, String> {
    let mut rows = conn
        .query(
            "SELECT id, task_id, title, content, created_at, updated_at, deleted_at
             FROM notes
             WHERE task_id = ?1 AND deleted_at IS NULL
             ORDER BY created_at ASC",
            params![task_id],
        )
        .await
        .map_err(|e| format!("Failed to query notes: {}", e))?;

    let mut notes = Vec::new();
    while let Some(row) = rows
        .next()
        .await
        .map_err(|e| format!("Failed to read note row: {}", e))?
    {
        notes.push(row_to_note(&row).map_err(|e| format!("Failed to parse note: {}", e))?);
    }

    Ok(notes)
}

#[tauri::command]
pub async fn get_notes(state: State<'_, DbState>, task_id: String) -> Result<Vec<Note>, String> {
    get_notes_impl(&state.conn, task_id).await
}

pub async fn add_note_impl(
    conn: &Connection,
    task_id: String,
    content: String,
    title: Option<String>,
) -> Result<Note, String> {
    let mut task_rows = conn
        .query(
            "SELECT id FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
            params![task_id.clone()],
        )
        .await
        .map_err(|e| format!("Failed to verify task: {}", e))?;

    if task_rows
        .next()
        .await
        .map_err(|e| format!("Failed to fetch task row: {}", e))?
        .is_none()
    {
        return Err(format!("Task with ID '{}' does not exist", task_id));
    }

    let id = Uuid::now_v7().to_string();
    let now = now_iso();

    conn.execute(
        "INSERT INTO notes (id, task_id, title, content, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        params![
            id.clone(),
            task_id.clone(),
            title.clone(),
            content.clone(),
            now.clone()
        ],
    )
    .await
    .map_err(|e| format!("Failed to insert note: {}", e))?;

    Ok(Note {
        id,
        task_id,
        title,
        content,
        created_at: now.clone(),
        updated_at: now,
        deleted_at: None,
    })
}

#[tauri::command]
pub async fn add_note(
    state: State<'_, DbState>,
    task_id: String,
    content: String,
    title: Option<String>,
) -> Result<Note, String> {
    add_note_impl(&state.conn, task_id, content, title).await
}

// ---------------------------------------------------------------------------
// 3.4 Reminder Commands
// ---------------------------------------------------------------------------

pub async fn get_reminders_impl(
    conn: &Connection,
    task_id: String,
) -> Result<Vec<Reminder>, String> {
    let query = format!(
        "SELECT {}
         FROM reminders
         WHERE task_id = ?1 AND deleted_at IS NULL
         ORDER BY created_at ASC",
        REMINDER_SELECT_COLS
    );

    let mut rows = conn
        .query(&query, params![task_id])
        .await
        .map_err(|e| format!("Failed to query reminders: {}", e))?;

    let mut reminders = Vec::new();
    while let Some(row) = rows
        .next()
        .await
        .map_err(|e| format!("Failed to read reminder row: {}", e))?
    {
        reminders.push(row_to_reminder(&row).map_err(|e| format!("Failed to parse reminder: {}", e))?);
    }

    Ok(reminders)
}

#[tauri::command]
pub async fn get_reminders(
    state: State<'_, DbState>,
    task_id: String,
) -> Result<Vec<Reminder>, String> {
    get_reminders_impl(&state.conn, task_id).await
}

pub async fn add_reminder_impl(
    conn: &Connection,
    task_id: String,
    trigger: String,
    relative_to: Option<String>,
    action: Option<String>,
    description: Option<String>,
) -> Result<Reminder, String> {
    let trigger = trigger.trim().to_string();
    if trigger.is_empty() {
        return Err("Reminder trigger cannot be empty".to_string());
    }

    let mut task_rows = conn
        .query(
            "SELECT id FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
            params![task_id.clone()],
        )
        .await
        .map_err(|e| format!("Failed to verify task: {}", e))?;

    if task_rows
        .next()
        .await
        .map_err(|e| format!("Failed to fetch task row: {}", e))?
        .is_none()
    {
        return Err(format!("Task with ID '{}' does not exist", task_id));
    }

    let relative_to = relative_to.unwrap_or_else(|| "due".to_string());
    let action = action.unwrap_or_else(|| "display".to_string());
    let id = Uuid::now_v7().to_string();
    let now = now_iso();

    conn.execute(
        "INSERT INTO reminders (id, task_id, trigger, relative_to, action, description, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        params![
            id.clone(),
            task_id.clone(),
            trigger.clone(),
            relative_to.clone(),
            action.clone(),
            description.clone(),
            now.clone()
        ],
    )
    .await
    .map_err(|e| format!("Failed to insert reminder: {}", e))?;

    Ok(Reminder {
        id,
        task_id,
        trigger,
        relative_to,
        action,
        description,
        created_at: now.clone(),
        updated_at: now,
        deleted_at: None,
    })
}

#[tauri::command]
pub async fn add_reminder(
    state: State<'_, DbState>,
    task_id: String,
    trigger: String,
    relative_to: Option<String>,
    action: Option<String>,
    description: Option<String>,
) -> Result<Reminder, String> {
    add_reminder_impl(&state.conn, task_id, trigger, relative_to, action, description).await
}

pub async fn delete_reminder_impl(conn: &Connection, id: String) -> Result<(), String> {
    let now = now_iso();
    let rows_affected = conn
        .execute(
            "UPDATE reminders SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1 AND deleted_at IS NULL",
            params![id.clone(), now],
        )
        .await
        .map_err(|e| format!("Failed to delete reminder: {}", e))?;

    if rows_affected == 0 {
        return Err(format!("Reminder with ID '{}' not found", id));
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_reminder(state: State<'_, DbState>, id: String) -> Result<(), String> {
    delete_reminder_impl(&state.conn, id).await
}

// ---------------------------------------------------------------------------
// 3.5 OpenTask v1.0 Export and Import Commands
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

    let mut opentask_tasks = Vec::with_capacity(tasks.len());
    for task in tasks {
        // Fetch notes for task
        let notes_res = get_notes_impl(conn, task.id.clone()).await?;
        let opentask_notes: Vec<OpenTaskNote> = notes_res
            .into_iter()
            .map(|n| OpenTaskNote {
                id: n.id,
                title: n.title,
                content: n.content,
                created_at: Some(n.created_at),
                updated_at: Some(n.updated_at),
            })
            .collect();

        // Fetch reminders for task
        let reminders_res = get_reminders_impl(conn, task.id.clone()).await?;
        let opentask_reminders: Vec<OpenTaskReminder> = reminders_res
            .into_iter()
            .map(|r| OpenTaskReminder {
                id: r.id,
                trigger: r.trigger,
                relative_to: r.relative_to,
                action: r.action,
                description: r.description,
            })
            .collect();

        // Fetch tag names for task
        let mut tag_rows = conn
            .query(
                "SELECT t.name
                 FROM tags t
                 INNER JOIN task_tags tt ON t.id = tt.tag_id
                 WHERE tt.task_id = ?1 AND tt.deleted_at IS NULL AND t.deleted_at IS NULL
                 ORDER BY t.name ASC",
                params![task.id.clone()],
            )
            .await
            .map_err(|e| format!("Failed to query task tags: {}", e))?;

        let mut task_tags = Vec::new();
        while let Some(row) = tag_rows
            .next()
            .await
            .map_err(|e| format!("Failed to read tag row: {}", e))?
        {
            let name: String = row.get(0).map_err(|e| format!("Failed to get tag name: {}", e))?;
            task_tags.push(name);
        }

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
            extra: task.extra,
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

pub async fn import_backup_impl(
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
                 SET name = ?2, color = ?3, position = ?4, is_archived = ?5, extra = ?6, updated_at = ?7, deleted_at = NULL
                 WHERE id = ?1",
                params![
                    list_id,
                    list.name,
                    list.color,
                    list.position,
                    is_archived_int,
                    extra_str,
                    now.clone()
                ],
            )
            .await
            .map_err(|e| format!("Failed to update list: {}", e))?;
        } else {
            conn.execute(
                "INSERT INTO lists (id, name, color, position, is_archived, extra, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
                params![
                    list_id,
                    list.name,
                    list.color,
                    list.position,
                    is_archived_int,
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

    // 3. Tasks
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

        let mut existing = conn
            .query("SELECT id FROM tasks WHERE id = ?1", params![task_id.clone()])
            .await
            .map_err(|e| format!("Failed to check existing task: {}", e))?;

        if existing
            .next()
            .await
            .map_err(|e| format!("Error checking task: {}", e))?
            .is_some()
        {
            conn.execute(
                "UPDATE tasks
                 SET uid = ?2, parent_id = ?3, list_id = ?4, title = ?5, description = ?6,
                     due = ?7, is_all_day = ?8, rrule = ?9, priority = ?10, location = ?11,
                     url = ?12, completed = ?13, completed_at = ?14, status = ?15, start = ?16,
                     duration = ?17, timezone = ?18, percent_complete = ?19, color = ?20,
                     position = ?21, geo_latitude = ?22, geo_longitude = ?23, extra = ?24,
                     updated_at = ?25, deleted_at = ?26
                 WHERE id = ?1",
                params![
                    task_id.clone(),
                    task.uid,
                    task.parent_id,
                    task.list_id.clone(),
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
                "INSERT INTO tasks (id, uid, parent_id, list_id, title, description, due, is_all_day, rrule, priority, location, url, completed, completed_at, status, start, duration, timezone, percent_complete, color, position, geo_latitude, geo_longitude, extra, created_at, updated_at, deleted_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27)",
                params![
                    task_id.clone(),
                    task.uid,
                    task.parent_id,
                    task.list_id.clone(),
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
                            item.id,
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
                            item.id,
                            task_id.clone(),
                            task.list_id.clone(),
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
                tasks_imported += 1;
            }
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

// ---------------------------------------------------------------------------
// Unit & Integration Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_db;

    async fn setup_test_conn() -> (libsql::Connection, std::path::PathBuf) {
        let temp_dir = std::env::temp_dir().join(format!("tudu_cmd_test_{}", Uuid::new_v4()));
        let db_path = temp_dir.join("test.db");
        let state = init_db(&db_path).await.expect("init_db failed");
        (state.conn, temp_dir)
    }

    #[test]
    fn test_list_crud() {
        tauri::async_runtime::block_on(async {
            let (conn, temp_dir) = setup_test_conn().await;

            // Create lists
            let list1 = create_list_impl(&conn, "Inbox".to_string(), Some("#ff0000".to_string()))
                .await
                .expect("create list 1");
            assert_eq!(list1.name, "Inbox");
            assert_eq!(list1.color, Some("#ff0000".to_string()));
            assert_eq!(list1.position, 0);
            assert!(!list1.is_archived);

            let list2 = create_list_impl(&conn, "Work".to_string(), None)
                .await
                .expect("create list 2");
            assert_eq!(list2.name, "Work");
            assert_eq!(list2.position, 1);
            assert!(!list2.is_archived);

            // Get lists
            let lists = get_lists_impl(&conn).await.expect("get lists");
            assert_eq!(lists.len(), 2);
            assert_eq!(lists[0].id, list1.id);
            assert_eq!(lists[1].id, list2.id);

            // Delete list (soft delete)
            delete_list_impl(&conn, list1.id.clone())
                .await
                .expect("delete list");

            let remaining = get_lists_impl(&conn).await.expect("get lists after delete");
            assert_eq!(remaining.len(), 1);
            assert_eq!(remaining[0].id, list2.id);

            // Direct check in DB that list1 has deleted_at set
            let mut rows = conn
                .query(
                    "SELECT deleted_at FROM lists WHERE id = ?1",
                    params![list1.id],
                )
                .await
                .unwrap();
            let row = rows.next().await.unwrap().unwrap();
            let deleted_at: Option<String> = row.get(0).unwrap();
            assert!(deleted_at.is_some());
            let _ = std::fs::remove_dir_all(temp_dir);
        });
    }

    #[test]
    fn test_task_crud_and_subtasks() {
        tauri::async_runtime::block_on(async {
            let (conn, temp_dir) = setup_test_conn().await;

            let list = create_list_impl(&conn, "Personal".to_string(), None)
                .await
                .expect("create list");

            // Create parent task
            let parent = create_task_impl(
                &conn,
                list.id.clone(),
                "Parent Task".to_string(),
                Some("2026-09-15".to_string()),
                Some(1),
                None,
            )
            .await
            .expect("create parent task");
            assert_eq!(parent.title, "Parent Task");
            assert_eq!(parent.due, Some("2026-09-15".to_string()));
            assert_eq!(parent.priority, Some(1));
            assert_eq!(parent.status, "needs_action");
            assert!(!parent.completed);

            // Create subtask
            let subtask = create_task_impl(
                &conn,
                list.id.clone(),
                "Child Subtask".to_string(),
                None,
                None,
                Some(parent.id.clone()),
            )
            .await
            .expect("create subtask");
            assert_eq!(subtask.parent_id, Some(parent.id.clone()));

            // Get tasks excluding completed
            let active_tasks = get_tasks_impl(&conn, list.id.clone(), None)
                .await
                .expect("get active tasks");
            assert_eq!(active_tasks.len(), 2);

            // Toggle subtask complete
            let toggled = toggle_task_complete_impl(&conn, subtask.id.clone(), true)
                .await
                .expect("toggle complete");
            assert!(toggled.completed);
            assert_eq!(toggled.status, "completed");
            assert!(toggled.completed_at.is_some());

            // Get tasks without completed -> only parent returned
            let incomplete = get_tasks_impl(&conn, list.id.clone(), Some(false))
                .await
                .expect("get incomplete tasks");
            assert_eq!(incomplete.len(), 1);
            assert_eq!(incomplete[0].id, parent.id);

            // Get tasks including completed -> both returned
            let all = get_tasks_impl(&conn, list.id.clone(), Some(true))
                .await
                .expect("get all tasks");
            assert_eq!(all.len(), 2);

            // Toggle back to incomplete
            let untoggled = toggle_task_complete_impl(&conn, subtask.id.clone(), false)
                .await
                .expect("toggle incomplete");
            assert!(!untoggled.completed);
            assert_eq!(untoggled.status, "needs_action");
            assert!(untoggled.completed_at.is_none());

            // Update task with description, rrule, is_all_day, priority, start, duration, timezone
            let updated = update_task_impl(
                &conn,
                serde_json::json!({
                    "id": parent.id,
                    "title": "Updated Parent Title",
                    "description": "Parent task description",
                    "rrule": "FREQ=DAILY",
                    "is_all_day": true,
                    "priority": 2,
                    "start": "2026-09-15T09:00:00Z",
                    "duration": "PT1H30M",
                    "timezone": "America/New_York",
                    "percent_complete": 50,
                    "color": "#3b82f6",
                    "geo": {
                        "latitude": 40.7128,
                        "longitude": -74.0060
                    }
                }),
            )
            .await
            .expect("update task");
            assert_eq!(updated.title, "Updated Parent Title");
            assert_eq!(
                updated.description,
                Some("Parent task description".to_string())
            );
            assert_eq!(updated.rrule, Some("FREQ=DAILY".to_string()));
            assert!(updated.is_all_day);
            assert_eq!(updated.priority, Some(2));
            assert_eq!(updated.start, Some("2026-09-15T09:00:00Z".to_string()));
            assert_eq!(updated.duration, Some("PT1H30M".to_string()));
            assert_eq!(updated.timezone, Some("America/New_York".to_string()));
            assert_eq!(updated.percent_complete, 50);
            assert_eq!(updated.color, Some("#3b82f6".to_string()));
            assert_eq!(updated.geo_latitude, Some(40.7128));
            assert_eq!(updated.geo_longitude, Some(-74.0060));

            // Delete parent task -> subtask must also be soft-deleted
            delete_task_impl(&conn, parent.id.clone())
                .await
                .expect("delete parent task");

            let after_delete = get_tasks_impl(&conn, list.id.clone(), Some(true))
                .await
                .expect("get tasks after delete");
            assert_eq!(after_delete.len(), 0);

            // Direct check in DB that subtask also has deleted_at set
            let mut rows = conn
                .query(
                    "SELECT deleted_at FROM tasks WHERE id = ?1",
                    params![subtask.id],
                )
                .await
                .unwrap();
            let row = rows.next().await.unwrap().unwrap();
            let subtask_deleted_at: Option<String> = row.get(0).unwrap();
            assert!(subtask_deleted_at.is_some());
            let _ = std::fs::remove_dir_all(temp_dir);
        });
    }

    #[test]
    fn test_tags_and_notes() {
        tauri::async_runtime::block_on(async {
            let (conn, temp_dir) = setup_test_conn().await;

            let list = create_list_impl(&conn, "Work".to_string(), None)
                .await
                .expect("create list");
            let task = create_task_impl(
                &conn,
                list.id.clone(),
                "Task with notes".to_string(),
                None,
                None,
                None,
            )
            .await
            .expect("create task");

            // Tags
            let tag1 = create_tag_impl(&conn, "urgent".to_string(), Some("#ff0000".to_string()))
                .await
                .expect("create tag 1");
            assert_eq!(tag1.name, "urgent");
            let _tag2 = create_tag_impl(&conn, "frontend".to_string(), None)
                .await
                .expect("create tag 2");

            let tags = get_tags_impl(&conn).await.expect("get tags");
            assert_eq!(tags.len(), 2);
            assert_eq!(tags[0].name, "frontend");
            assert_eq!(tags[1].name, "urgent");

            // Duplicate tag creation returns existing tag
            let dup = create_tag_impl(&conn, "urgent".to_string(), None)
                .await
                .expect("create duplicate tag");
            assert_eq!(dup.id, tag1.id);

            // Notes
            let note1 = add_note_impl(
                &conn,
                task.id.clone(),
                "Note content 1".to_string(),
                Some("Note Title".to_string()),
            )
            .await
            .expect("add note 1");
            assert_eq!(note1.task_id, task.id);
            assert_eq!(note1.title, Some("Note Title".to_string()));
            assert_eq!(note1.content, "Note content 1");

            let note2 = add_note_impl(&conn, task.id.clone(), "Note content 2".to_string(), None)
                .await
                .expect("add note 2");
            assert_eq!(note2.title, None);

            let notes = get_notes_impl(&conn, task.id.clone())
                .await
                .expect("get notes");
            assert_eq!(notes.len(), 2);
            assert_eq!(notes[0].id, note1.id);
            assert_eq!(notes[1].id, note2.id);

            let _ = std::fs::remove_dir_all(temp_dir);
        });
    }

    #[test]
    fn test_reminders() {
        tauri::async_runtime::block_on(async {
            let (conn, temp_dir) = setup_test_conn().await;

            let list = create_list_impl(&conn, "Reminders List".to_string(), None)
                .await
                .expect("create list");
            let task = create_task_impl(
                &conn,
                list.id.clone(),
                "Task with reminders".to_string(),
                Some("2026-09-20T10:00:00Z".to_string()),
                Some(1),
                None,
            )
            .await
            .expect("create task");

            // Add reminder 1 (15 mins before due, with description)
            let rem1 = add_reminder_impl(
                &conn,
                task.id.clone(),
                "-PT15M".to_string(),
                Some("due".to_string()),
                Some("display".to_string()),
                Some("Upcoming meeting alarm".to_string()),
            )
            .await
            .expect("add reminder 1");
            assert_eq!(rem1.trigger, "-PT15M");
            assert_eq!(rem1.relative_to, "due");
            assert_eq!(rem1.action, "display");
            assert_eq!(rem1.description, Some("Upcoming meeting alarm".to_string()));

            // Add reminder 2 (1 day before)
            let rem2 = add_reminder_impl(
                &conn,
                task.id.clone(),
                "-P1D".to_string(),
                None,
                None,
                None,
            )
            .await
            .expect("add reminder 2");
            assert_eq!(rem2.trigger, "-P1D");
            assert_eq!(rem2.relative_to, "due");
            assert_eq!(rem2.action, "display");
            assert_eq!(rem2.description, None);

            let reminders = get_reminders_impl(&conn, task.id.clone())
                .await
                .expect("get reminders");
            assert_eq!(reminders.len(), 2);
            assert_eq!(reminders[0].id, rem1.id);
            assert_eq!(reminders[1].id, rem2.id);

            // Delete rem1
            delete_reminder_impl(&conn, rem1.id.clone())
                .await
                .expect("delete reminder 1");

            let remaining = get_reminders_impl(&conn, task.id.clone())
                .await
                .expect("get reminders after delete");
            assert_eq!(remaining.len(), 1);
            assert_eq!(remaining[0].id, rem2.id);

            let _ = std::fs::remove_dir_all(temp_dir);
        });
    }

    #[test]
    fn test_opentask_export_and_import() {
        tauri::async_runtime::block_on(async {
            let (conn, temp_dir) = setup_test_conn().await;

            // Create initial data
            let list = create_list_impl(&conn, "Sprint Tasks".to_string(), Some("#6366f1".to_string()))
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
            update_task_impl(
                &conn,
                serde_json::json!({
                    "id": task.id,
                    "timezone": "America/Los_Angeles",
                    "duration": "PT2H",
                    "percent_complete": 75,
                    "location": "HQ Room 4",
                    "geo": { "latitude": 37.7749, "longitude": -122.4194 },
                    "url": "https://example.com/spec",
                    "extra": { "vendor_note": "custom ticktick token" }
                }),
            )
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
            assert_eq!(exported.lists.len(), 1);
            assert_eq!(exported.lists[0].name, "Sprint Tasks");
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
    fn test_e2e_persistence_restart_smoke() {
        tauri::async_runtime::block_on(async {
            let temp_dir = std::env::temp_dir().join(format!("tudu_smoke_test_{}", Uuid::new_v4()));
            let db_path = temp_dir.join("tudu.db");

            // === SESSION 1: Launch app, create list, add multiple tasks, check off a task ===
            let list_id: String;
            let task1_id: String;
            let task2_id: String;
            {
                let state = init_db(&db_path).await.expect("Session 1 init_db failed");
                let conn = &state.conn;

                // 1. Create a list
                let list = create_list_impl(
                    conn,
                    "Project Launch".to_string(),
                    Some("#10b981".to_string()),
                )
                .await
                .expect("create list");
                list_id = list.id;
                assert_eq!(list.name, "Project Launch");

                // 2. Add multiple tasks
                let task1 = create_task_impl(
                    conn,
                    list_id.clone(),
                    "Design 3-Pane Shell".to_string(),
                    Some("2026-09-15".to_string()),
                    Some(1),
                    None,
                )
                .await
                .expect("create task 1");
                task1_id = task1.id;
                assert!(!task1.completed);

                let task2 = create_task_impl(
                    conn,
                    list_id.clone(),
                    "Implement Database Layer".to_string(),
                    None,
                    Some(2),
                    None,
                )
                .await
                .expect("create task 2");
                task2_id = task2.id;
                assert!(!task2.completed);

                // 3. Check off a task
                let toggled = toggle_task_complete_impl(conn, task1_id.clone(), true)
                    .await
                    .expect("toggle task 1 complete");
                assert!(toggled.completed);
                assert!(toggled.completed_at.is_some());

                // State drops here (simulating app shutdown / close)
            }

            // === SESSION 2: Restart desktop app (re-open database from disk) ===
            {
                let state2 = init_db(&db_path)
                    .await
                    .expect("Session 2 restart init_db failed");
                let conn2 = &state2.conn;

                // Verify list was persisted
                let lists = get_lists_impl(conn2)
                    .await
                    .expect("get lists after restart");
                assert_eq!(lists.len(), 1);
                assert_eq!(lists[0].id, list_id);
                assert_eq!(lists[0].name, "Project Launch");
                assert_eq!(lists[0].color, Some("#10b981".to_string()));

                // Verify tasks were persisted
                let all_tasks = get_tasks_impl(conn2, list_id.clone(), Some(true))
                    .await
                    .expect("get all tasks after restart");
                assert_eq!(all_tasks.len(), 2);

                let persisted_task1 = all_tasks
                    .iter()
                    .find(|t| t.id == task1_id)
                    .expect("task 1 found");
                assert_eq!(persisted_task1.title, "Design 3-Pane Shell");
                assert!(
                    persisted_task1.completed,
                    "Task 1 completed status must persist across restarts"
                );
                assert_eq!(persisted_task1.status, "completed");
                assert!(persisted_task1.completed_at.is_some());
                assert_eq!(persisted_task1.priority, Some(1));

                let persisted_task2 = all_tasks
                    .iter()
                    .find(|t| t.id == task2_id)
                    .expect("task 2 found");
                assert_eq!(persisted_task2.title, "Implement Database Layer");
                assert!(!persisted_task2.completed, "Task 2 must remain incomplete");
                assert_eq!(persisted_task2.status, "needs_action");
                assert!(persisted_task2.completed_at.is_none());

                // Incomplete tasks query should only return task 2
                let incomplete_tasks = get_tasks_impl(conn2, list_id.clone(), Some(false))
                    .await
                    .expect("get incomplete tasks after restart");
                assert_eq!(incomplete_tasks.len(), 1);
                assert_eq!(incomplete_tasks[0].id, task2_id);
            }

            let _ = std::fs::remove_dir_all(temp_dir);
        });
    }
}
