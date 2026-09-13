use chrono::Utc;
use libsql::{Connection, Row};
use std::collections::HashMap;
#[cfg(test)]
use uuid::Uuid;

use crate::models::{List, Note, Reminder, Tag, TagWithCount, Task};

pub const LIST_SELECT_COLS: &str =
    "id, name, color, position, is_archived, icon, extra, created_at, updated_at, deleted_at";

pub const TASK_SELECT_COLS: &str =
    "id, uid, parent_id, list_id, title, description, due, is_all_day, rrule, priority, location, url, completed, completed_at, status, start, duration, timezone, percent_complete, color, position, freeform_x, freeform_y, geo_latitude, geo_longitude, extra, created_at, updated_at, deleted_at";

pub const REMINDER_SELECT_COLS: &str =
    "id, task_id, trigger, relative_to, action, description, created_at, updated_at, deleted_at";

pub fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

pub async fn fetch_tags_for_task_ids(
    conn: &Connection,
    task_ids: &[String],
) -> Result<HashMap<String, Vec<Tag>>, String> {
    let mut map: HashMap<String, Vec<Tag>> = HashMap::new();
    if task_ids.is_empty() {
        return Ok(map);
    }

    for chunk in task_ids.chunks(500) {
        let placeholders = chunk.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT tt.task_id, tg.id, tg.name, tg.color, tg.created_at, tg.updated_at, tg.deleted_at
             FROM task_tags tt
             JOIN tags tg ON tg.id = tt.tag_id
             WHERE tt.deleted_at IS NULL AND tg.deleted_at IS NULL AND tt.task_id IN ({})
             ORDER BY tg.name ASC",
            placeholders
        );
        let params: Vec<libsql::Value> = chunk
            .iter()
            .map(|id| libsql::Value::Text(id.clone()))
            .collect();
        let mut rows = conn
            .query(&sql, params)
            .await
            .map_err(|e| format!("Failed to query tags for tasks: {}", e))?;
        while let Some(row) = rows
            .next()
            .await
            .map_err(|e| format!("Failed to read tag row: {}", e))?
        {
            let task_id: String = row
                .get(0)
                .map_err(|e| format!("Failed to get task_id: {}", e))?;
            let tag = Tag {
                id: row
                    .get(1)
                    .map_err(|e| format!("Failed to get tag id: {}", e))?,
                name: row
                    .get(2)
                    .map_err(|e| format!("Failed to get tag name: {}", e))?,
                color: row
                    .get(3)
                    .map_err(|e| format!("Failed to get tag color: {}", e))?,
                created_at: row
                    .get(4)
                    .map_err(|e| format!("Failed to get tag created_at: {}", e))?,
                updated_at: row
                    .get(5)
                    .map_err(|e| format!("Failed to get tag updated_at: {}", e))?,
                deleted_at: row
                    .get(6)
                    .map_err(|e| format!("Failed to get tag deleted_at: {}", e))?,
            };
            map.entry(task_id).or_default().push(tag);
        }
    }
    Ok(map)
}

pub fn row_to_list(row: &Row) -> Result<List, libsql::Error> {
    let is_archived_int: i64 = row.get(4).unwrap_or(0);
    let icon: Option<String> = row.get(5)?;
    let extra_str: Option<String> = row.get(6)?;
    let extra = extra_str.and_then(|s| serde_json::from_str(&s).ok());
    Ok(List {
        id: row.get(0)?,
        name: row.get(1)?,
        color: row.get(2)?,
        position: row.get(3)?,
        is_archived: is_archived_int != 0,
        icon,
        extra,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        deleted_at: row.get(9)?,
    })
}

pub fn row_to_task(row: &Row) -> Result<Task, libsql::Error> {
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
    let extra_str: Option<String> = row.get(25)?;
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
        freeform_x: row.get(21)?,
        freeform_y: row.get(22)?,
        geo_latitude: row.get(23)?,
        geo_longitude: row.get(24)?,
        extra,
        tags: Vec::new(),
        created_at: row.get(26)?,
        updated_at: row.get(27)?,
        deleted_at: row.get(28)?,
    })
}

pub fn row_to_reminder(row: &Row) -> Result<Reminder, libsql::Error> {
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

pub fn row_to_tag(row: &Row) -> Result<Tag, libsql::Error> {
    Ok(Tag {
        id: row.get(0)?,
        name: row.get(1)?,
        color: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        deleted_at: row.get(5)?,
    })
}

pub fn row_to_tag_with_count(row: &Row) -> Result<TagWithCount, libsql::Error> {
    Ok(TagWithCount {
        id: row.get(0)?,
        name: row.get(1)?,
        color: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        deleted_at: row.get(5)?,
        task_count: row.get(6)?,
    })
}

pub fn row_to_note(row: &Row) -> Result<Note, libsql::Error> {
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

#[cfg(test)]
pub async fn setup_test_conn() -> (libsql::Connection, std::path::PathBuf) {
    let temp_dir = std::env::temp_dir().join(format!("tudu_cmd_test_{}", Uuid::new_v4()));
    let db_path = temp_dir.join("test.db");
    let state = crate::db::init_db(&db_path).await.expect("init_db failed");
    (state.conn, temp_dir)
}
