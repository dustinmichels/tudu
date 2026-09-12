use libsql::{params, Connection};
use tauri::State;
use uuid::Uuid;

use crate::db::DbState;
use crate::models::Reminder;
use super::common::{now_iso, row_to_reminder, REMINDER_SELECT_COLS};

// ---------------------------------------------------------------------------
// Reminder Commands
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::common::setup_test_conn;
    use crate::commands::lists::create_list_impl;
    use crate::commands::tasks::create_task_impl;

    #[test]
    fn test_reminders() {
        tauri::async_runtime::block_on(async {
            let (conn, temp_dir) = setup_test_conn().await;

            let list = create_list_impl(&conn, "Reminders List".to_string(), None, None)
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
}
