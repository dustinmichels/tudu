use libsql::{params, Connection};
use tauri::State;
use uuid::Uuid;

use crate::db::DbState;
use crate::models::Note;
use super::common::{now_iso, row_to_note};

// ---------------------------------------------------------------------------
// Note Commands
// ---------------------------------------------------------------------------

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

pub async fn update_note_impl(
    conn: &Connection,
    id: String,
    content: Option<String>,
    title: Option<Option<String>>,
) -> Result<Note, String> {
    let mut rows = conn
        .query(
            "SELECT id, task_id, title, content, created_at, updated_at, deleted_at
             FROM notes
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id.clone()],
        )
        .await
        .map_err(|e| format!("Failed to query note: {}", e))?;

    let _existing = if let Some(row) = rows
        .next()
        .await
        .map_err(|e| format!("Failed to read note row: {}", e))?
    {
        row_to_note(&row).map_err(|e| format!("Failed to parse note: {}", e))?
    } else {
        return Err(format!("Note with ID '{}' not found", id));
    };

    let mut sets = Vec::new();
    let mut query_params: Vec<libsql::Value> = vec![libsql::Value::Text(id.clone())];

    if let Some(new_content) = content {
        query_params.push(libsql::Value::Text(new_content));
        sets.push(format!("content = ?{}", query_params.len()));
    }

    if let Some(new_title) = title {
        match new_title {
            Some(t) => query_params.push(libsql::Value::Text(t)),
            None => query_params.push(libsql::Value::Null),
        }
        sets.push(format!("title = ?{}", query_params.len()));
    }

    let now = now_iso();
    query_params.push(libsql::Value::Text(now.clone()));
    sets.push(format!("updated_at = ?{}", query_params.len()));

    let query_str = format!(
        "UPDATE notes SET {} WHERE id = ?1 AND deleted_at IS NULL",
        sets.join(", ")
    );

    conn.execute(&query_str, query_params)
        .await
        .map_err(|e| format!("Failed to update note: {}", e))?;

    let mut fetch_rows = conn
        .query(
            "SELECT id, task_id, title, content, created_at, updated_at, deleted_at
             FROM notes WHERE id = ?1 AND deleted_at IS NULL",
            params![id.clone()],
        )
        .await
        .map_err(|e| format!("Failed to fetch updated note: {}", e))?;

    if let Some(row) = fetch_rows
        .next()
        .await
        .map_err(|e| format!("Failed to read note row: {}", e))?
    {
        row_to_note(&row).map_err(|e| format!("Failed to parse note: {}", e))
    } else {
        Err(format!("Note with ID '{}' not found after update", id))
    }
}

#[tauri::command]
pub async fn update_note(
    state: State<'_, DbState>,
    id: String,
    content: Option<String>,
    title: Option<Option<String>>,
) -> Result<Note, String> {
    update_note_impl(&state.conn, id, content, title).await
}

pub async fn delete_note_impl(conn: &Connection, id: String) -> Result<(), String> {
    let now = now_iso();
    let rows_affected = conn
        .execute(
            "UPDATE notes SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1 AND deleted_at IS NULL",
            params![id.clone(), now],
        )
        .await
        .map_err(|e| format!("Failed to delete note: {}", e))?;

    if rows_affected == 0 {
        return Err(format!("Note with ID '{}' not found or already deleted", id));
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_note(state: State<'_, DbState>, id: String) -> Result<(), String> {
    delete_note_impl(&state.conn, id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::common::setup_test_conn;
    use crate::commands::lists::create_list_impl;
    use crate::commands::tasks::create_task_impl;

    #[test]
    fn test_note_crud() {
        tauri::async_runtime::block_on(async {
            let (conn, temp_dir) = setup_test_conn().await;

            let list = create_list_impl(&conn, "Work".to_string(), None, None)
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

            // Update note
            let updated = update_note_impl(
                &conn,
                note1.id.clone(),
                Some("Updated content".to_string()),
                None,
            )
            .await
            .expect("update note");
            assert_eq!(updated.content, "Updated content");

            // Delete note
            delete_note_impl(&conn, note2.id.clone())
                .await
                .expect("delete note");
            let remaining_notes = get_notes_impl(&conn, task.id.clone())
                .await
                .expect("get notes after delete");
            assert_eq!(remaining_notes.len(), 1);
            assert_eq!(remaining_notes[0].id, note1.id);

            let _ = std::fs::remove_dir_all(temp_dir);
        });
    }
}
