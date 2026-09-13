use libsql::{params, Connection};
use tauri::State;
use uuid::Uuid;

use super::common::{fetch_tags_for_task_ids, now_iso, row_to_task, TASK_SELECT_COLS};
use super::notes::get_notes_impl;
use crate::db::DbState;
use crate::models::{BatchUpdateTasksInput, Task, TaskDetail, UpdateTaskInput};

// ---------------------------------------------------------------------------
// Task Commands
// ---------------------------------------------------------------------------

pub async fn get_tasks_impl(
    conn: &Connection,
    list_id: Option<String>,
    include_completed: Option<bool>,
    view: Option<String>,
    tag: Option<String>,
    due_from: Option<String>,
    due_to: Option<String>,
    parent_id: Option<Option<String>>,
) -> Result<Vec<Task>, String> {
    let include_completed = include_completed.unwrap_or(false);
    let is_trash = matches!(
        view.as_deref().map(|v| v.trim().to_lowercase()).as_deref(),
        Some("trash")
    );
    let mut conditions = if is_trash {
        vec!["t.deleted_at IS NOT NULL".to_string()]
    } else {
        vec![
            "t.deleted_at IS NULL".to_string(),
            "t.list_id IN (SELECT id FROM lists WHERE deleted_at IS NULL)".to_string(),
        ]
    };
    let mut param_values: Vec<libsql::Value> = Vec::new();

    if let Some(lid) = &list_id {
        if !lid.trim().is_empty() {
            param_values.push(libsql::Value::Text(lid.clone()));
            conditions.push(format!("t.list_id = ?{}", param_values.len()));
        }
    }

    if let Some(tag_filter) = &tag {
        let trimmed = tag_filter.trim();
        if !trimmed.is_empty() {
            param_values.push(libsql::Value::Text(trimmed.to_string()));
            conditions.push(format!(
                "EXISTS (
                    SELECT 1 FROM task_tags tt
                    JOIN tags tg ON tg.id = tt.tag_id
                    WHERE tt.task_id = t.id
                      AND tt.deleted_at IS NULL
                      AND tg.deleted_at IS NULL
                      AND (tg.id = ?{p} OR tg.name = ?{p})
                )",
                p = param_values.len()
            ));
        }
    }

    if let Some(df) = &due_from {
        let trimmed = df.trim();
        if !trimmed.is_empty() {
            param_values.push(libsql::Value::Text(trimmed.to_string()));
            conditions.push(format!(
                "(t.due IS NOT NULL AND date(t.due) >= date(?{}))",
                param_values.len()
            ));
        }
    }

    if let Some(dt) = &due_to {
        let trimmed = dt.trim();
        if !trimmed.is_empty() {
            param_values.push(libsql::Value::Text(trimmed.to_string()));
            conditions.push(format!(
                "(t.due IS NOT NULL AND date(t.due) <= date(?{}))",
                param_values.len()
            ));
        }
    }

    if let Some(pid_opt) = &parent_id {
        match pid_opt {
            Some(pid) if !pid.trim().is_empty() => {
                param_values.push(libsql::Value::Text(pid.clone()));
                conditions.push(format!("t.parent_id = ?{}", param_values.len()));
            }
            _ => {
                conditions.push("t.parent_id IS NULL".to_string());
            }
        }
    }

    if let Some(v) = &view {
        match v.trim().to_lowercase().as_str() {
            "today" => {
                if include_completed {
                    conditions.push("(t.due IS NOT NULL AND ((t.completed = 0 AND date(t.due) <= date('now', 'localtime')) OR (t.completed = 1 AND (date(t.due) = date('now', 'localtime') OR (date(t.due) <= date('now', 'localtime') AND date(t.completed_at, 'localtime') = date('now', 'localtime'))))))".to_string());
                } else {
                    conditions.push("(t.completed = 0 AND t.due IS NOT NULL AND date(t.due) <= date('now', 'localtime'))".to_string());
                }
            }
            "tomorrow" => {
                if !include_completed {
                    conditions.push("t.completed = 0".to_string());
                }
                conditions.push(
                    "(t.due IS NOT NULL AND date(t.due) = date('now', 'localtime', '+1 day'))"
                        .to_string(),
                );
            }
            "this_week" => {
                if include_completed {
                    conditions.push("(t.due IS NOT NULL AND ((t.completed = 0 AND date(t.due) <= date('now', 'localtime', '+7 days')) OR (t.completed = 1 AND date(t.due) >= date('now', 'localtime') AND date(t.due) <= date('now', 'localtime', '+7 days'))))".to_string());
                } else {
                    conditions.push("(t.completed = 0 AND t.due IS NOT NULL AND date(t.due) <= date('now', 'localtime', '+7 days'))".to_string());
                }
            }
            "overdue" => {
                if !include_completed {
                    conditions.push("t.completed = 0".to_string());
                }
                conditions.push(
                    "(t.due IS NOT NULL AND date(t.due) < date('now', 'localtime'))".to_string(),
                );
            }
            "trash" => {
                if !include_completed {
                    conditions.push("t.completed = 0".to_string());
                }
            }
            "all" => {
                if !include_completed {
                    conditions.push("t.completed = 0".to_string());
                }
            }
            _ => {
                if !include_completed {
                    conditions.push("t.completed = 0".to_string());
                }
            }
        }
    } else if !include_completed {
        conditions.push("t.completed = 0".to_string());
    }

    let where_str = conditions.join(" AND ");
    let cols_with_prefix = TASK_SELECT_COLS
        .split(',')
        .map(|col| format!("t.{}", col.trim()))
        .collect::<Vec<_>>()
        .join(", ");
    let query_str = format!(
        "SELECT {} FROM tasks t WHERE {} ORDER BY t.completed ASC, t.priority ASC, t.due ASC, t.created_at ASC",
        cols_with_prefix, where_str
    );

    let mut rows = if param_values.is_empty() {
        conn.query(&query_str, ())
            .await
            .map_err(|e| format!("Failed to query tasks: {}", e))?
    } else {
        conn.query(&query_str, param_values)
            .await
            .map_err(|e| format!("Failed to query tasks: {}", e))?
    };

    let mut tasks = Vec::new();
    while let Some(row) = rows
        .next()
        .await
        .map_err(|e| format!("Failed to read task row: {}", e))?
    {
        tasks.push(row_to_task(&row).map_err(|e| format!("Failed to parse task: {}", e))?);
    }

    if !tasks.is_empty() {
        let task_ids: Vec<String> = tasks.iter().map(|t| t.id.clone()).collect();
        let mut tags_map = fetch_tags_for_task_ids(conn, &task_ids).await?;
        for task in &mut tasks {
            task.tags = tags_map.remove(&task.id).unwrap_or_default();
        }
    }

    Ok(tasks)
}

#[tauri::command]
pub async fn get_tasks(
    state: State<'_, DbState>,
    list_id: Option<String>,
    include_completed: Option<bool>,
    view: Option<String>,
    tag: Option<String>,
    due_from: Option<String>,
    due_to: Option<String>,
    parent_id: Option<Option<String>>,
) -> Result<Vec<Task>, String> {
    get_tasks_impl(
        &state.conn,
        list_id,
        include_completed,
        view,
        tag,
        due_from,
        due_to,
        parent_id,
    )
    .await
}

pub async fn fetch_task_by_id(conn: &Connection, id: &str) -> Result<Option<Task>, String> {
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
        let mut task = row_to_task(&row).map_err(|e| format!("Failed to parse task: {}", e))?;
        let mut tags_map = fetch_tags_for_task_ids(conn, &[task.id.clone()]).await?;
        task.tags = tags_map.remove(&task.id).unwrap_or_default();
        Ok(Some(task))
    } else {
        Ok(None)
    }
}

pub async fn get_task_detail_impl(
    conn: &Connection,
    id: String,
) -> Result<Option<TaskDetail>, String> {
    let task = match fetch_task_by_id(conn, &id).await? {
        Some(t) => t,
        None => return Ok(None),
    };

    // Notes for this task
    let notes = get_notes_impl(conn, id.clone()).await?;

    // Subtasks for this task
    let subtask_query = format!(
        "SELECT {} FROM tasks WHERE parent_id = ?1 AND deleted_at IS NULL ORDER BY completed ASC, priority ASC, due ASC, created_at ASC",
        TASK_SELECT_COLS
    );
    let mut subtask_rows = conn
        .query(&subtask_query, params![id])
        .await
        .map_err(|e| format!("Failed to query subtasks: {}", e))?;

    let mut subtasks = Vec::new();
    while let Some(row) = subtask_rows
        .next()
        .await
        .map_err(|e| format!("Failed to read subtask row: {}", e))?
    {
        subtasks.push(row_to_task(&row).map_err(|e| format!("Failed to parse subtask: {}", e))?);
    }
    if !subtasks.is_empty() {
        let subtask_ids: Vec<String> = subtasks.iter().map(|s| s.id.clone()).collect();
        let mut subtask_tags_map = fetch_tags_for_task_ids(conn, &subtask_ids).await?;
        for sub in &mut subtasks {
            sub.tags = subtask_tags_map.remove(&sub.id).unwrap_or_default();
        }
    }

    Ok(Some(TaskDetail {
        task,
        notes,
        subtasks,
    }))
}

#[tauri::command]
pub async fn get_task_detail(
    state: State<'_, DbState>,
    id: String,
) -> Result<Option<TaskDetail>, String> {
    get_task_detail_impl(&state.conn, id).await
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

    let target_list_id = if list_id.trim().is_empty() {
        let mut inbox_rows = conn
            .query(
                "SELECT id FROM lists WHERE lower(name) = 'inbox' AND deleted_at IS NULL LIMIT 1",
                (),
            )
            .await
            .map_err(|e| format!("Failed to find Inbox list: {}", e))?;
        if let Some(row) = inbox_rows
            .next()
            .await
            .map_err(|e| format!("Failed to fetch inbox: {}", e))?
        {
            row.get::<String>(0)
                .map_err(|e| format!("Failed to get inbox id: {}", e))?
        } else {
            return Err("No list specified and default Inbox list not found".to_string());
        }
    } else {
        list_id.clone()
    };

    let mut list_rows = conn
        .query(
            "SELECT id FROM lists WHERE id = ?1 AND deleted_at IS NULL",
            params![target_list_id.clone()],
        )
        .await
        .map_err(|e| format!("Failed to verify list: {}", e))?;

    if list_rows
        .next()
        .await
        .map_err(|e| format!("Failed to fetch list row: {}", e))?
        .is_none()
    {
        return Err(format!("List with ID '{}' does not exist", target_list_id));
    }
    let list_id = target_list_id;

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
        freeform_x: None,
        freeform_y: None,
        geo_latitude: None,
        geo_longitude: None,
        extra: None,
        tags: Vec::new(),
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

pub async fn update_task_impl(conn: &Connection, task: UpdateTaskInput) -> Result<Task, String> {
    let id = &task.id;

    let existing = fetch_task_by_id(conn, id)
        .await?
        .ok_or_else(|| format!("Task with ID '{}' not found", id))?;

    let title = match task.title {
        Some(t) => {
            let trimmed = t.trim();
            if trimmed.is_empty() {
                return Err("Task title cannot be empty".to_string());
            }
            trimmed.to_string()
        }
        None => existing.title,
    };

    let list_id = task.list_id.unwrap_or(existing.list_id);
    let parent_id = match task.parent_id {
        Some(p) => p,
        None => existing.parent_id,
    };
    let due = match task.due {
        Some(d) => d,
        None => existing.due,
    };
    let uid = match task.uid {
        Some(u) => u,
        None => existing.uid,
    };
    let description = match task.description {
        Some(d) => d,
        None => existing.description,
    };
    let is_all_day = task.is_all_day.unwrap_or(existing.is_all_day);
    let rrule = match task.rrule {
        Some(r) => r,
        None => existing.rrule,
    };
    let priority = match task.priority {
        Some(p) => p,
        None => existing.priority,
    };
    let location = match task.location {
        Some(l) => l,
        None => existing.location,
    };
    let url = match task.url {
        Some(u) => u,
        None => existing.url,
    };

    let now = now_iso();

    // Synchronize completed, completed_at, and status
    let (completed, completed_at, status) = if let Some(s) = task.status {
        let is_comp = s.eq_ignore_ascii_case("completed");
        let c_at = if is_comp {
            existing.completed_at.or(Some(now.clone()))
        } else {
            None
        };
        (is_comp, c_at, s)
    } else if let Some(is_comp) = task.completed {
        if is_comp {
            let c_at = match task.completed_at {
                Some(Some(cat)) => Some(cat),
                Some(None) => Some(now.clone()),
                None => existing.completed_at.or(Some(now.clone())),
            };
            (true, c_at, "completed".to_string())
        } else {
            (false, None, "needs_action".to_string())
        }
    } else if let Some(cat_opt) = task.completed_at {
        (existing.completed, cat_opt, existing.status)
    } else {
        (existing.completed, existing.completed_at, existing.status)
    };

    let start = match task.start {
        Some(s) => s,
        None => existing.start,
    };
    let duration = match task.duration {
        Some(d) => d,
        None => existing.duration,
    };
    let timezone = match task.timezone {
        Some(tz) => tz,
        None => existing.timezone,
    };
    let percent_complete = task.percent_complete.unwrap_or(existing.percent_complete);
    let color = match task.color {
        Some(c) => c,
        None => existing.color,
    };
    let position = task.position.unwrap_or(existing.position);
    let freeform_x = match task.freeform_x {
        Some(x) => x,
        None => existing.freeform_x,
    };
    let freeform_y = match task.freeform_y {
        Some(y) => y,
        None => existing.freeform_y,
    };

    let (geo_latitude, geo_longitude) = if let Some(geo_opt) = task.geo {
        match geo_opt {
            Some(g) => (Some(g.latitude), Some(g.longitude)),
            None => (None, None),
        }
    } else {
        let lat = match task.geo_latitude {
            Some(l) => l,
            None => existing.geo_latitude,
        };
        let lng = match task.geo_longitude {
            Some(l) => l,
            None => existing.geo_longitude,
        };
        (lat, lng)
    };

    let extra_str = match task.extra {
        Some(Some(extra_val)) => Some(extra_val.to_string()),
        Some(None) => None,
        None => existing.extra.map(|x| x.to_string()),
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
             freeform_x = ?22, freeform_y = ?23, geo_latitude = ?24,
             geo_longitude = ?25, extra = ?26, updated_at = ?27
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
            freeform_x,
            freeform_y,
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
pub async fn update_task(state: State<'_, DbState>, task: UpdateTaskInput) -> Result<Task, String> {
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
pub async fn batch_delete_tasks_impl(conn: &Connection, ids: Vec<String>) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }
    let now = now_iso();
    for chunk in ids.chunks(500) {
        let placeholders = chunk.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "WITH RECURSIVE descendants AS (
                SELECT id FROM tasks WHERE id IN ({})
                UNION ALL
                SELECT t.id FROM tasks t INNER JOIN descendants d ON t.parent_id = d.id
            )
            UPDATE tasks
            SET deleted_at = ?, updated_at = ?
            WHERE id IN (SELECT id FROM descendants) AND deleted_at IS NULL",
            placeholders
        );
        let mut params: Vec<libsql::Value> = chunk
            .iter()
            .map(|id| libsql::Value::Text(id.clone()))
            .collect();
        params.push(libsql::Value::Text(now.clone()));
        params.push(libsql::Value::Text(now.clone()));

        conn.execute(&sql, params)
            .await
            .map_err(|e| format!("Failed to recursively soft-delete tasks in batch: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn batch_delete_tasks(
    state: State<'_, DbState>,
    ids: Vec<String>,
) -> Result<(), String> {
    batch_delete_tasks_impl(&state.conn, ids).await
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

pub async fn batch_update_tasks_impl(
    conn: &Connection,
    input: BatchUpdateTasksInput,
) -> Result<Vec<Task>, String> {
    if input.task_ids.is_empty() {
        return Ok(Vec::new());
    }

    // Validate list_id if provided
    if let Some(lid) = &input.list_id {
        let mut list_rows = conn
            .query(
                "SELECT id FROM lists WHERE id = ?1 AND deleted_at IS NULL",
                params![lid.clone()],
            )
            .await
            .map_err(|e| format!("Failed to verify list: {}", e))?;
        if list_rows
            .next()
            .await
            .map_err(|e| format!("Failed to read list row: {}", e))?
            .is_none()
        {
            return Err(format!("List with ID '{}' does not exist", lid));
        }
    }

    // Validate priority if provided
    if let Some(Some(p)) = input.priority {
        if !(1..=3).contains(&p) {
            return Err("Priority must be 1, 2, 3, or null".to_string());
        }
    }

    let now = now_iso();
    let mut updated_tasks = Vec::new();

    for id in &input.task_ids {
        let existing = match fetch_task_by_id(conn, id).await? {
            Some(t) => t,
            None => continue,
        };

        let mut sets = Vec::new();
        let mut query_params: Vec<libsql::Value> = vec![libsql::Value::Text(id.clone())];

        if let Some(completed) = input.completed {
            let (completed_int, completed_at, status) = if completed {
                (1i64, Some(now.clone()), "completed")
            } else {
                (0i64, None, "needs_action")
            };
            query_params.push(libsql::Value::Integer(completed_int));
            sets.push(format!("completed = ?{}", query_params.len()));

            match completed_at {
                Some(ca) => query_params.push(libsql::Value::Text(ca)),
                None => query_params.push(libsql::Value::Null),
            }
            sets.push(format!("completed_at = ?{}", query_params.len()));

            query_params.push(libsql::Value::Text(status.to_string()));
            sets.push(format!("status = ?{}", query_params.len()));
        }

        if let Some(days) = input.postpone_days {
            // Base calculation: from existing due if present (RFC3339 or YYYY-MM-DD), else from now (UTC)
            let (base_datetime, is_date_only) = if let Some(due_str) = &existing.due {
                let trimmed = due_str.trim();
                if let Ok(naive_date) = chrono::NaiveDate::parse_from_str(trimmed, "%Y-%m-%d") {
                    let dt = naive_date
                        .and_hms_opt(0, 0, 0)
                        .unwrap()
                        .and_local_timezone(chrono::Utc)
                        .unwrap();
                    (dt, true)
                } else {
                    let dt = chrono::DateTime::parse_from_rfc3339(trimmed)
                        .map(|dt| dt.with_timezone(&chrono::Utc))
                        .unwrap_or_else(|_| chrono::Utc::now());
                    (dt, existing.is_all_day)
                }
            } else {
                (chrono::Utc::now(), existing.is_all_day)
            };
            let new_due = base_datetime + chrono::Duration::days(days);
            let new_due_str = if is_date_only || existing.is_all_day {
                new_due.format("%Y-%m-%d").to_string()
            } else {
                new_due.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
            };
            query_params.push(libsql::Value::Text(new_due_str));
            sets.push(format!("due = ?{}", query_params.len()));
        } else if let Some(due_val) = &input.due {
            if due_val.trim().is_empty() {
                query_params.push(libsql::Value::Null);
            } else {
                query_params.push(libsql::Value::Text(due_val.clone()));
            }
            sets.push(format!("due = ?{}", query_params.len()));
        }

        if let Some(lid) = &input.list_id {
            query_params.push(libsql::Value::Text(lid.clone()));
            sets.push(format!("list_id = ?{}", query_params.len()));
        }

        if let Some(p_opt) = input.priority {
            match p_opt {
                Some(p) => query_params.push(libsql::Value::Integer(p)),
                None => query_params.push(libsql::Value::Null),
            }
            sets.push(format!("priority = ?{}", query_params.len()));
        }

        if sets.is_empty() {
            updated_tasks.push(existing);
            continue;
        }

        query_params.push(libsql::Value::Text(now.clone()));
        sets.push(format!("updated_at = ?{}", query_params.len()));

        let sql = format!(
            "UPDATE tasks SET {} WHERE id = ?1 AND deleted_at IS NULL",
            sets.join(", ")
        );

        conn.execute(&sql, query_params)
            .await
            .map_err(|e| format!("Failed to batch update task '{}': {}", id, e))?;

        if let Some(updated) = fetch_task_by_id(conn, id).await? {
            updated_tasks.push(updated);
        }
    }

    Ok(updated_tasks)
}

#[tauri::command]
pub async fn batch_update_tasks(
    state: State<'_, DbState>,
    input: BatchUpdateTasksInput,
) -> Result<Vec<Task>, String> {
    batch_update_tasks_impl(&state.conn, input).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::common::setup_test_conn;
    use crate::commands::lists::{create_list_impl, get_lists_impl, update_list_impl};
    use crate::commands::notes::{
        add_note_impl, delete_note_impl, get_notes_impl, update_note_impl,
    };
    use crate::commands::tags::{assign_tag_impl, create_tag_impl, remove_tag_impl};
    use crate::db::init_db;

    #[test]
    fn test_task_crud_and_subtasks() {
        tauri::async_runtime::block_on(async {
            let (conn, temp_dir) = setup_test_conn().await;

            let list = create_list_impl(&conn, "Personal".to_string(), None, None)
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
            let active_tasks = get_tasks_impl(
                &conn,
                Some(list.id.clone()),
                None,
                None,
                None,
                None,
                None,
                None,
            )
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
            let incomplete = get_tasks_impl(
                &conn,
                Some(list.id.clone()),
                Some(false),
                None,
                None,
                None,
                None,
                None,
            )
            .await
            .expect("get incomplete tasks");
            assert_eq!(incomplete.len(), 1);
            assert_eq!(incomplete[0].id, parent.id);

            // Get tasks including completed -> both returned
            let all = get_tasks_impl(
                &conn,
                Some(list.id.clone()),
                Some(true),
                None,
                None,
                None,
                None,
                None,
            )
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

            // Update task metadata, including persisted freeform board placement
            let update_payload: UpdateTaskInput = serde_json::from_value(serde_json::json!({
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
                "freeform_x": 184.0,
                "freeform_y": 296.0,
                "geo": {
                    "latitude": 40.7128,
                    "longitude": -74.0060
                }
            }))
            .expect("deserialize update input");
            let updated = update_task_impl(&conn, update_payload)
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
            assert_eq!(updated.freeform_x, Some(184.0));
            assert_eq!(updated.freeform_y, Some(296.0));
            assert_eq!(updated.geo_latitude, Some(40.7128));
            assert_eq!(updated.geo_longitude, Some(-74.0060));
            // Clearing freeform_x and freeform_y by passing null
            let clear_freeform_payload: UpdateTaskInput = serde_json::from_value(serde_json::json!({
                "id": parent.id,
                "freeform_x": null,
                "freeform_y": null,
            }))
            .expect("deserialize clear freeform input");
            let cleared = update_task_impl(&conn, clear_freeform_payload)
                .await
                .expect("update task clear freeform");
            assert_eq!(cleared.freeform_x, None);
            assert_eq!(cleared.freeform_y, None);
            // Other fields should remain unchanged
            assert_eq!(cleared.title, "Updated Parent Title");

            // Delete parent task -> subtask must also be soft-deleted
            delete_task_impl(&conn, parent.id.clone())
                .await
                .expect("delete parent task");

            let after_delete = get_tasks_impl(
                &conn,
                Some(list.id.clone()),
                Some(true),
                None,
                None,
                None,
                None,
                None,
            )
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
    fn test_batch_delete_tasks() {
        tauri::async_runtime::block_on(async {
            let temp_dir = std::env::temp_dir().join(format!("tudu_test_batch_del_{}", Uuid::new_v4()));
            let db_path = temp_dir.join("tudu.db");
            let state = init_db(&db_path).await.expect("init_db failed");
            let conn = &state.conn;

            let list = create_list_impl(
                conn,
                "Batch Del List".to_string(),
                None,
                None,
            )
            .await
            .expect("create list");

            let t1 = create_task_impl(
                conn,
                list.id.clone(),
                "Task 1".to_string(),
                None,
                None,
                None,
            )
            .await
            .expect("create t1");

            let t2 = create_task_impl(
                conn,
                list.id.clone(),
                "Task 2".to_string(),
                None,
                None,
                None,
            )
            .await
            .expect("create t2");

            let t1_sub = create_task_impl(
                conn,
                list.id.clone(),
                "Subtask of 1".to_string(),
                None,
                None,
                Some(t1.id.clone()),
            )
            .await
            .expect("create t1_sub");

            // Batch delete [t1.id, t2.id]
            batch_delete_tasks_impl(conn, vec![t1.id.clone(), t2.id.clone()])
                .await
                .expect("batch delete");

            let tasks_after = get_tasks_impl(
                conn,
                Some(list.id.clone()),
                Some(true),
                None,
                None,
                None,
                None,
                None,
            )
            .await
            .expect("get tasks");

            assert_eq!(tasks_after.len(), 0);

            let mut rows = conn
                .query(
                    "SELECT deleted_at FROM tasks WHERE id = ?1",
                    params![t1_sub.id],
                )
                .await
                .unwrap();
            let row = rows.next().await.unwrap().unwrap();
            let sub_deleted: Option<String> = row.get(0).unwrap();
            assert!(sub_deleted.is_some());

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
                    None,
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
                assert_eq!(lists.len(), 2);
                assert!(lists.iter().any(|l| l.name == "Inbox"));
                let proj_list = lists
                    .iter()
                    .find(|l| l.id == list_id)
                    .expect("Project Launch list");
                assert_eq!(proj_list.name, "Project Launch");
                assert_eq!(proj_list.color, Some("#10b981".to_string()));
                // Verify tasks were persisted
                let all_tasks = get_tasks_impl(
                    conn2,
                    Some(list_id.clone()),
                    Some(true),
                    None,
                    None,
                    None,
                    None,
                    None,
                )
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
                let incomplete_tasks = get_tasks_impl(
                    conn2,
                    Some(list_id.clone()),
                    Some(false),
                    None,
                    None,
                    None,
                    None,
                    None,
                )
                .await
                .expect("get incomplete tasks after restart");
                assert_eq!(incomplete_tasks.len(), 1);
                assert_eq!(incomplete_tasks[0].id, task2_id);
            }

            let _ = std::fs::remove_dir_all(temp_dir);
        });
    }

    #[test]
    fn test_default_views() {
        tauri::async_runtime::block_on(async {
            let (conn, temp_dir) = setup_test_conn().await;

            // Get default Inbox list
            let lists = get_lists_impl(&conn).await.expect("get lists");
            let inbox_id = lists[0].id.clone();

            // Insert tasks with various due dates relative to today
            // Task 1: Overdue (yesterday)
            create_task_impl(
                &conn,
                inbox_id.clone(),
                "Overdue task".to_string(),
                Some(
                    chrono::Local::now()
                        .checked_sub_signed(chrono::Duration::days(1))
                        .unwrap()
                        .format("%Y-%m-%d")
                        .to_string(),
                ),
                Some(1),
                None,
            )
            .await
            .expect("create overdue task");

            // Task 2: Due today
            create_task_impl(
                &conn,
                inbox_id.clone(),
                "Today task".to_string(),
                Some(chrono::Local::now().format("%Y-%m-%d").to_string()),
                Some(2),
                None,
            )
            .await
            .expect("create today task");

            // Task 3: Due tomorrow
            create_task_impl(
                &conn,
                inbox_id.clone(),
                "Tomorrow task".to_string(),
                Some(
                    chrono::Local::now()
                        .checked_add_signed(chrono::Duration::days(1))
                        .unwrap()
                        .format("%Y-%m-%d")
                        .to_string(),
                ),
                None,
                None,
            )
            .await
            .expect("create tomorrow task");

            // Task 4: Due in 4 days (this week)
            create_task_impl(
                &conn,
                inbox_id.clone(),
                "This week task".to_string(),
                Some(
                    chrono::Local::now()
                        .checked_add_signed(chrono::Duration::days(4))
                        .unwrap()
                        .format("%Y-%m-%d")
                        .to_string(),
                ),
                None,
                None,
            )
            .await
            .expect("create this week task");

            // Task 5: Due in 20 days (future)
            create_task_impl(
                &conn,
                inbox_id.clone(),
                "Future task".to_string(),
                Some(
                    chrono::Local::now()
                        .checked_add_signed(chrono::Duration::days(20))
                        .unwrap()
                        .format("%Y-%m-%d")
                        .to_string(),
                ),
                None,
                None,
            )
            .await
            .expect("create future task");

            // Query "today" view -> overdue + today (2 tasks)
            let today_tasks = get_tasks_impl(
                &conn,
                None,
                Some(false),
                Some("today".to_string()),
                None,
                None,
                None,
                None,
            )
            .await
            .expect("get today tasks");
            assert_eq!(today_tasks.len(), 2);
            let titles: Vec<String> = today_tasks.into_iter().map(|t| t.title).collect();
            assert!(titles.contains(&"Overdue task".to_string()));
            assert!(titles.contains(&"Today task".to_string()));

            // Query "tomorrow" view -> tomorrow task (1 task)
            let tomorrow_tasks = get_tasks_impl(
                &conn,
                None,
                Some(false),
                Some("tomorrow".to_string()),
                None,
                None,
                None,
                None,
            )
            .await
            .expect("get tomorrow tasks");
            assert_eq!(tomorrow_tasks.len(), 1);
            assert_eq!(tomorrow_tasks[0].title, "Tomorrow task");

            // Query "this_week" view -> overdue, today, tomorrow, and in 4 days (4 tasks, excludes in 20 days)
            let this_week_tasks = get_tasks_impl(
                &conn,
                None,
                Some(false),
                Some("this_week".to_string()),
                None,
                None,
                None,
                None,
            )
            .await
            .expect("get this week tasks");
            assert_eq!(this_week_tasks.len(), 4);
            let week_titles: Vec<String> = this_week_tasks.into_iter().map(|t| t.title).collect();
            assert!(week_titles.contains(&"Overdue task".to_string()));
            assert!(week_titles.contains(&"Today task".to_string()));
            assert!(week_titles.contains(&"Tomorrow task".to_string()));
            assert!(week_titles.contains(&"This week task".to_string()));
            assert!(!week_titles.contains(&"Future task".to_string()));

            // Query "overdue" view -> overdue task (1 task)
            let overdue_tasks = get_tasks_impl(
                &conn,
                None,
                Some(false),
                Some("overdue".to_string()),
                None,
                None,
                None,
                None,
            )
            .await
            .expect("get overdue tasks");
            assert_eq!(overdue_tasks.len(), 1);
            assert_eq!(overdue_tasks[0].title, "Overdue task");

            let _ = std::fs::remove_dir_all(temp_dir);
        });
    }

    #[test]
    fn test_smart_views_with_completed_tasks() {
        tauri::async_runtime::block_on(async {
            let (conn, temp_dir) = setup_test_conn().await;

            let lists = get_lists_impl(&conn).await.expect("get lists");
            let inbox_id = lists[0].id.clone();

            // Incomplete tasks
            create_task_impl(
                &conn,
                inbox_id.clone(),
                "Overdue incomplete".to_string(),
                Some(
                    chrono::Local::now()
                        .checked_sub_signed(chrono::Duration::days(3))
                        .unwrap()
                        .format("%Y-%m-%d")
                        .to_string(),
                ),
                None,
                None,
            )
            .await
            .unwrap();

            create_task_impl(
                &conn,
                inbox_id.clone(),
                "Today incomplete".to_string(),
                Some(chrono::Local::now().format("%Y-%m-%d").to_string()),
                None,
                None,
            )
            .await
            .unwrap();

            create_task_impl(
                &conn,
                inbox_id.clone(),
                "Week incomplete".to_string(),
                Some(
                    chrono::Local::now()
                        .checked_add_signed(chrono::Duration::days(3))
                        .unwrap()
                        .format("%Y-%m-%d")
                        .to_string(),
                ),
                None,
                None,
            )
            .await
            .unwrap();

            // Completed tasks
            let t_overdue_comp = create_task_impl(
                &conn,
                inbox_id.clone(),
                "Overdue completed".to_string(),
                Some(
                    chrono::Local::now()
                        .checked_sub_signed(chrono::Duration::days(3))
                        .unwrap()
                        .format("%Y-%m-%d")
                        .to_string(),
                ),
                None,
                None,
            )
            .await
            .unwrap();
            toggle_task_complete_impl(&conn, t_overdue_comp.id, true)
                .await
                .unwrap();

            let t_today_comp = create_task_impl(
                &conn,
                inbox_id.clone(),
                "Today completed".to_string(),
                Some(chrono::Local::now().format("%Y-%m-%d").to_string()),
                None,
                None,
            )
            .await
            .unwrap();
            toggle_task_complete_impl(&conn, t_today_comp.id, true)
                .await
                .unwrap();

            let t_week_comp = create_task_impl(
                &conn,
                inbox_id.clone(),
                "Week completed".to_string(),
                Some(
                    chrono::Local::now()
                        .checked_add_signed(chrono::Duration::days(3))
                        .unwrap()
                        .format("%Y-%m-%d")
                        .to_string(),
                ),
                None,
                None,
            )
            .await
            .unwrap();
            toggle_task_complete_impl(&conn, t_week_comp.id, true)
                .await
                .unwrap();

            let t_overdue_comp_past = create_task_impl(
                &conn,
                inbox_id.clone(),
                "Overdue completed past".to_string(),
                Some(
                    chrono::Local::now()
                        .checked_sub_signed(chrono::Duration::days(5))
                        .unwrap()
                        .format("%Y-%m-%d")
                        .to_string(),
                ),
                None,
                None,
            )
            .await
            .unwrap();
            conn.execute(
                "UPDATE tasks SET completed = 1, completed_at = datetime('now', 'localtime', '-3 days') WHERE id = ?1",
                params![t_overdue_comp_past.id],
            )
            .await
            .unwrap();
            // 1. Today view with include_completed = true
            let today_with_comp = get_tasks_impl(
                &conn,
                None,
                Some(true),
                Some("today".to_string()),
                None,
                None,
                None,
                None,
            )
            .await
            .expect("get today tasks with completed");
            let today_titles: Vec<String> = today_with_comp.into_iter().map(|t| t.title).collect();
            assert!(today_titles.contains(&"Overdue incomplete".to_string()));
            assert!(today_titles.contains(&"Today incomplete".to_string()));
            assert!(today_titles.contains(&"Today completed".to_string()));
            // Completed overdue task completed today MUST be in Today
            assert!(today_titles.contains(&"Overdue completed".to_string()));
            // Old completed task completed in the past must NOT be in Today
            assert!(!today_titles.contains(&"Overdue completed past".to_string()));
            assert!(!today_titles.contains(&"Week completed".to_string()));
            assert!(!today_titles.contains(&"Week incomplete".to_string()));
            // 2. Today view with include_completed = false
            let today_no_comp = get_tasks_impl(
                &conn,
                None,
                Some(false),
                Some("today".to_string()),
                None,
                None,
                None,
                None,
            )
            .await
            .expect("get today tasks without completed");
            let today_no_comp_titles: Vec<String> =
                today_no_comp.into_iter().map(|t| t.title).collect();
            assert_eq!(today_no_comp_titles.len(), 2);
            assert!(today_no_comp_titles.contains(&"Overdue incomplete".to_string()));
            assert!(today_no_comp_titles.contains(&"Today incomplete".to_string()));

            // 3. This Week view with include_completed = true
            let week_with_comp = get_tasks_impl(
                &conn,
                None,
                Some(true),
                Some("this_week".to_string()),
                None,
                None,
                None,
                None,
            )
            .await
            .expect("get this_week tasks with completed");
            let week_titles: Vec<String> = week_with_comp.into_iter().map(|t| t.title).collect();
            assert!(week_titles.contains(&"Overdue incomplete".to_string()));
            assert!(week_titles.contains(&"Today incomplete".to_string()));
            assert!(week_titles.contains(&"Week incomplete".to_string()));
            assert!(week_titles.contains(&"Today completed".to_string()));
            assert!(week_titles.contains(&"Week completed".to_string()));
            // Overdue completed must NOT be in this_week
            assert!(!week_titles.contains(&"Overdue completed".to_string()));

            // 4. This Week view with include_completed = false
            let week_no_comp = get_tasks_impl(
                &conn,
                None,
                Some(false),
                Some("this_week".to_string()),
                None,
                None,
                None,
                None,
            )
            .await
            .expect("get this_week tasks without completed");
            let week_no_comp_titles: Vec<String> =
                week_no_comp.into_iter().map(|t| t.title).collect();
            assert_eq!(week_no_comp_titles.len(), 3);
            assert!(week_no_comp_titles.contains(&"Overdue incomplete".to_string()));
            assert!(week_no_comp_titles.contains(&"Today incomplete".to_string()));
            assert!(week_no_comp_titles.contains(&"Week incomplete".to_string()));

            let _ = std::fs::remove_dir_all(temp_dir);
        });
    }

    #[test]
    fn test_phase2_crud_operations() {
        tauri::async_runtime::block_on(async {
            let (conn, temp_dir) = setup_test_conn().await;

            // 1. List updates
            let list = create_list_impl(
                &conn,
                "Old List Name".to_string(),
                Some("#000000".to_string()),
                Some("List".to_string()),
            )
            .await
            .expect("create list");
            let updated_list = update_list_impl(
                &conn,
                list.id.clone(),
                Some("New List Name".to_string()),
                Some(Some("#123456".to_string())),
                Some(5),
                Some(Some("Folder".to_string())),
            )
            .await
            .expect("update list");
            assert_eq!(updated_list.name, "New List Name");
            assert_eq!(updated_list.color, Some("#123456".to_string()));
            assert_eq!(updated_list.position, 5);
            assert_eq!(updated_list.icon, Some("Folder".to_string()));

            // Cannot rename Inbox
            let lists = get_lists_impl(&conn).await.unwrap();
            let inbox = lists
                .iter()
                .find(|l| l.name.to_lowercase() == "inbox")
                .unwrap();
            let rename_inbox_err = update_list_impl(
                &conn,
                inbox.id.clone(),
                Some("Renamed Inbox".to_string()),
                None,
                None,
                None,
            )
            .await;
            assert!(rename_inbox_err.is_err(), "Renaming inbox must fail");

            // 2. Task creation and tag assignment/removal
            let task = create_task_impl(
                &conn,
                list.id.clone(),
                "Parent Task".to_string(),
                Some("2026-06-15T12:00:00.000Z".to_string()),
                Some(2),
                None,
            )
            .await
            .expect("create parent task");

            let tag1 = create_tag_impl(&conn, "feature".to_string(), Some("#00ff00".to_string()))
                .await
                .expect("create tag1");
            let _tag2 = create_tag_impl(&conn, "backend".to_string(), None)
                .await
                .expect("create tag2");

            assign_tag_impl(&conn, task.id.clone(), tag1.id.clone())
                .await
                .expect("assign tag1 by id");
            assign_tag_impl(&conn, task.id.clone(), "backend".to_string())
                .await
                .expect("assign tag2 by name");

            // Subtask
            let subtask = create_task_impl(
                &conn,
                list.id.clone(),
                "Child Subtask".to_string(),
                Some("2026-06-16T12:00:00.000Z".to_string()),
                Some(3),
                Some(task.id.clone()),
            )
            .await
            .expect("create subtask");

            // Notes
            let note1 = add_note_impl(
                &conn,
                task.id.clone(),
                "First note".to_string(),
                Some("Title 1".to_string()),
            )
            .await
            .expect("add note 1");
            let updated_note = update_note_impl(
                &conn,
                note1.id.clone(),
                Some("Updated note content".to_string()),
                Some(Some("Updated Title".to_string())),
            )
            .await
            .expect("update note");
            assert_eq!(updated_note.content, "Updated note content");
            assert_eq!(updated_note.title, Some("Updated Title".to_string()));

            // 3. get_task_detail
            let detail = get_task_detail_impl(&conn, task.id.clone())
                .await
                .expect("get task detail")
                .expect("task detail exists");
            assert_eq!(detail.task.id, task.id);
            assert_eq!(detail.tags.len(), 2);
            assert_eq!(detail.notes.len(), 1);
            assert_eq!(detail.notes[0].content, "Updated note content");
            assert_eq!(detail.subtasks.len(), 1);
            assert_eq!(detail.subtasks[0].id, subtask.id);

            // Test remove_tag
            remove_tag_impl(&conn, task.id.clone(), tag1.id.clone())
                .await
                .expect("remove tag1");
            let detail_after_tag_remove = get_task_detail_impl(&conn, task.id.clone())
                .await
                .unwrap()
                .unwrap();
            assert_eq!(detail_after_tag_remove.tags.len(), 1);
            assert_eq!(detail_after_tag_remove.tags[0].name, "backend");

            // Test delete_note
            delete_note_impl(&conn, note1.id.clone())
                .await
                .expect("delete note");
            let notes_after_delete = get_notes_impl(&conn, task.id.clone()).await.unwrap();
            assert_eq!(notes_after_delete.len(), 0);

            // 4. Test get_tasks filters
            // Filter by tag
            let tasks_tagged_backend = get_tasks_impl(
                &conn,
                None,
                Some(true),
                None,
                Some("backend".to_string()),
                None,
                None,
                None,
            )
            .await
            .expect("filter by tag");
            assert_eq!(tasks_tagged_backend.len(), 1);
            assert_eq!(tasks_tagged_backend[0].id, task.id);

            let tasks_tagged_feature = get_tasks_impl(
                &conn,
                None,
                Some(true),
                None,
                Some("feature".to_string()),
                None,
                None,
                None,
            )
            .await
            .expect("filter by removed tag");
            assert_eq!(tasks_tagged_feature.len(), 0);

            // Filter by due date range
            let tasks_due_range = get_tasks_impl(
                &conn,
                None,
                Some(true),
                None,
                None,
                Some("2026-06-15".to_string()),
                Some("2026-06-15".to_string()),
                None,
            )
            .await
            .expect("filter by due date range");
            assert_eq!(tasks_due_range.len(), 1);
            assert_eq!(tasks_due_range[0].id, task.id);

            // Filter by parent_id (root tasks vs child tasks)
            let root_tasks = get_tasks_impl(
                &conn,
                Some(list.id.clone()),
                Some(true),
                None,
                None,
                None,
                None,
                Some(None), // parent_id IS NULL
            )
            .await
            .expect("filter root tasks");
            assert_eq!(root_tasks.len(), 1);
            assert_eq!(root_tasks[0].id, task.id);

            let subtasks_of_parent = get_tasks_impl(
                &conn,
                Some(list.id.clone()),
                Some(true),
                None,
                None,
                None,
                None,
                Some(Some(task.id.clone())),
            )
            .await
            .expect("filter subtasks");
            assert_eq!(subtasks_of_parent.len(), 1);
            assert_eq!(subtasks_of_parent[0].id, subtask.id);

            // 5. Test batch_update_tasks
            let batch_input = BatchUpdateTasksInput {
                task_ids: vec![task.id.clone(), subtask.id.clone()],
                completed: Some(true),
                postpone_days: Some(3),
                due: None,
                list_id: None,
                priority: Some(Some(1)),
            };
            let batch_result = batch_update_tasks_impl(&conn, batch_input)
                .await
                .expect("batch update tasks");
            assert_eq!(batch_result.len(), 2);
            for t in batch_result {
                assert!(t.completed);
                assert_eq!(t.status, "completed");
                assert_eq!(t.priority, Some(1));
                assert!(t.due.is_some());
            }

            // 6. Test JSON deserialization and batch update with priority: null (Priority None) and date-only postpone
            let task_with_due = create_task_impl(
                &conn,
                list.id.clone(),
                "Task with date-only due".to_string(),
                Some("2026-09-10".to_string()),
                Some(2),
                None,
            )
            .await
            .expect("create task with due");
            assert_eq!(task_with_due.due, Some("2026-09-10".to_string()));
            assert_eq!(task_with_due.priority, Some(2));

            let json_payload = serde_json::json!({
                "task_ids": [task_with_due.id.clone()],
                "priority": null,
                "postpone_days": 2
            });
            let parsed_input: BatchUpdateTasksInput =
                serde_json::from_value(json_payload).expect("deserialize json with priority null");
            assert_eq!(parsed_input.priority, Some(None));

            let res = batch_update_tasks_impl(&conn, parsed_input)
                .await
                .expect("batch update with priority null");
            assert_eq!(res.len(), 1);
            assert_eq!(res[0].priority, None, "Priority should be cleared to None");
            assert_eq!(
                res[0].due,
                Some("2026-09-12".to_string()),
                "Date-only due should be postponed to 2026-09-12"
            );

            // 7. Test postpone on unscheduled all-day task -> formats as YYYY-MM-DD
            let unscheduled_all_day = create_task_impl(
                &conn,
                list.id.clone(),
                "Unscheduled all-day task".to_string(),
                None,
                None,
                None,
            )
            .await
            .expect("create unscheduled task");
            conn.execute(
                "UPDATE tasks SET is_all_day = 1 WHERE id = ?1",
                libsql::params![unscheduled_all_day.id.clone()],
            )
            .await
            .unwrap();

            let postpone_unscheduled = batch_update_tasks_impl(
                &conn,
                BatchUpdateTasksInput {
                    task_ids: vec![unscheduled_all_day.id.clone()],
                    completed: None,
                    due: None,
                    postpone_days: Some(1),
                    priority: None,
                    list_id: None,
                },
            )
            .await
            .expect("postpone unscheduled all day task");
            assert_eq!(postpone_unscheduled.len(), 1);
            let expected_due = (chrono::Utc::now() + chrono::Duration::days(1))
                .format("%Y-%m-%d")
                .to_string();
            assert_eq!(
                postpone_unscheduled[0].due,
                Some(expected_due),
                "Unscheduled all-day task should format as YYYY-MM-DD on postpone"
            );

            // 8. Test postpone on timed task (is_all_day == false) with RFC3339 due -> remains RFC3339
            let timed_task = create_task_impl(
                &conn,
                list.id.clone(),
                "Timed task".to_string(),
                Some("2026-09-10T14:30:00Z".to_string()),
                None,
                None,
            )
            .await
            .expect("create timed task");

            let postpone_timed = batch_update_tasks_impl(
                &conn,
                BatchUpdateTasksInput {
                    task_ids: vec![timed_task.id.clone()],
                    completed: None,
                    due: None,
                    postpone_days: Some(1),
                    priority: None,
                    list_id: None,
                },
            )
            .await
            .expect("postpone timed task");
            assert_eq!(postpone_timed.len(), 1);
            let timed_due = postpone_timed[0].due.as_ref().expect("due date present");
            assert!(
                timed_due.contains("2026-09-11T14:30:00"),
                "Timed task must retain RFC3339 timestamp format: got {}",
                timed_due
            );

            let _ = std::fs::remove_dir_all(temp_dir);
        });
    }

    #[test]
    fn test_update_task_clearing_fields() {
        tauri::async_runtime::block_on(async {
            let temp_dir = std::env::temp_dir().join(format!("tudu_test_{}", Uuid::new_v4()));
            let db_path = temp_dir.join("test.db");
            let state = init_db(&db_path).await.expect("init db");
            let conn = state.conn;

            let list = create_list_impl(&conn, "Work".to_string(), None, None)
                .await
                .expect("create list");

            let created = create_task_impl(
                &conn,
                list.id.clone(),
                "Task with due and priority".to_string(),
                Some("2026-10-01".to_string()),
                Some(1),
                None,
            )
            .await
            .expect("create task");

            assert_eq!(created.due, Some("2026-10-01".to_string()));
            assert_eq!(created.priority, Some(1));

            // Explicitly pass null for due and priority to clear them
            let update_payload: UpdateTaskInput = serde_json::from_value(serde_json::json!({
                "id": created.id,
                "due": null,
                "priority": null,
                "title": "Task with cleared due and priority"
            }))
            .expect("parse update input");

            let updated = update_task_impl(&conn, update_payload)
                .await
                .expect("update task");

            assert_eq!(updated.title, "Task with cleared due and priority");
            assert_eq!(updated.due, None);
            assert_eq!(updated.priority, None);

            let _ = std::fs::remove_dir_all(temp_dir);
        });
    }

    #[test]
    fn test_get_tasks_includes_tags() {
        tauri::async_runtime::block_on(async {
            let temp_dir = std::env::temp_dir().join(format!("tudu_test_{}", Uuid::new_v4()));
            let db_path = temp_dir.join("test.db");
            let state = init_db(&db_path).await.expect("init db");
            let conn = state.conn;

            let list = create_list_impl(&conn, "Dev".to_string(), None, None)
                .await
                .expect("create list");

            let task = create_task_impl(
                &conn,
                list.id.clone(),
                "Implement features".to_string(),
                None,
                None,
                None,
            )
            .await
            .expect("create task");

            let tag1 = create_tag_impl(&conn, "urgent".to_string(), None)
                .await
                .expect("create tag1");
            let tag2 = create_tag_impl(&conn, "backend".to_string(), None)
                .await
                .expect("create tag2");

            assign_tag_impl(&conn, task.id.clone(), tag1.id.clone())
                .await
                .expect("assign tag1");
            assign_tag_impl(&conn, task.id.clone(), tag2.id.clone())
                .await
                .expect("assign tag2");

            // Fetch via get_tasks_impl
            let tasks = get_tasks_impl(
                &conn,
                Some(list.id.clone()),
                Some(true),
                None,
                None,
                None,
                None,
                None,
            )
            .await
            .expect("get tasks");

            assert_eq!(tasks.len(), 1);
            let fetched_task = &tasks[0];
            assert_eq!(fetched_task.tags.len(), 2);
            let tag_names: Vec<String> = fetched_task.tags.iter().map(|t| t.name.clone()).collect();
            assert_eq!(tag_names, vec!["backend", "urgent"]);

            let _ = std::fs::remove_dir_all(temp_dir);
        });
    }
}
