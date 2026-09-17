use libsql::{params, Connection};
use tauri::State;
use uuid::Uuid;

use crate::db::DbState;
use crate::models::List;
use super::common::{now_iso, row_to_list, LIST_SELECT_COLS};

// ---------------------------------------------------------------------------
// List Commands
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
    icon: Option<String>,
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
        "INSERT INTO lists (id, name, color, position, is_archived, icon, extra, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 0, ?5, NULL, ?6, ?6)",
        params![id.clone(), name.clone(), color.clone(), position, icon.clone(), now.clone()],
    )
    .await
    .map_err(|e| format!("Failed to insert list: {}", e))?;

    Ok(List {
        id,
        name,
        color,
        position,
        is_archived: false,
        icon,
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
    icon: Option<String>,
) -> Result<List, String> {
    create_list_impl(&state.conn, name, color, icon).await
}

pub async fn update_list_impl(
    conn: &Connection,
    id: String,
    name: Option<String>,
    color: Option<Option<String>>,
    position: Option<i64>,
    icon: Option<Option<String>>,
) -> Result<List, String> {
    let mut rows = conn
        .query(
            "SELECT name FROM lists WHERE id = ?1 AND deleted_at IS NULL",
            params![id.clone()],
        )
        .await
        .map_err(|e| format!("Failed to query list: {}", e))?;

    let current_name = if let Some(row) = rows
        .next()
        .await
        .map_err(|e| format!("Failed to read list row: {}", e))?
    {
        row.get::<String>(0).map_err(|e| format!("Failed to read list name: {}", e))?
    } else {
        return Err(format!("List with ID '{}' not found", id));
    };

    let mut sets = Vec::new();
    let mut query_params: Vec<libsql::Value> = vec![libsql::Value::Text(id.clone())];

    if let Some(new_name) = name {
        let trimmed = new_name.trim().to_string();
        if trimmed.is_empty() {
            return Err("List name cannot be empty".to_string());
        }
        if current_name.eq_ignore_ascii_case("inbox") && !trimmed.eq_ignore_ascii_case("inbox") {
            return Err("Cannot rename the default Inbox list".to_string());
        }
        query_params.push(libsql::Value::Text(trimmed));
        sets.push(format!("name = ?{}", query_params.len()));
    }

    if let Some(new_color) = color {
        match new_color {
            Some(c) => query_params.push(libsql::Value::Text(c)),
            None => query_params.push(libsql::Value::Null),
        }
        sets.push(format!("color = ?{}", query_params.len()));
    }

    if let Some(new_pos) = position {
        query_params.push(libsql::Value::Integer(new_pos));
        sets.push(format!("position = ?{}", query_params.len()));
    }

    if let Some(new_icon) = icon {
        match new_icon {
            Some(i) => query_params.push(libsql::Value::Text(i)),
            None => query_params.push(libsql::Value::Null),
        }
        sets.push(format!("icon = ?{}", query_params.len()));
    }

    let now = now_iso();
    query_params.push(libsql::Value::Text(now.clone()));
    sets.push(format!("updated_at = ?{}", query_params.len()));

    let query_str = format!(
        "UPDATE lists SET {} WHERE id = ?1 AND deleted_at IS NULL",
        sets.join(", ")
    );

    conn.execute(&query_str, query_params)
        .await
        .map_err(|e| format!("Failed to update list: {}", e))?;

    let fetch_query = format!(
        "SELECT {} FROM lists WHERE id = ?1 AND deleted_at IS NULL",
        LIST_SELECT_COLS
    );
    let mut fetch_rows = conn
        .query(&fetch_query, params![id.clone()])
        .await
        .map_err(|e| format!("Failed to fetch updated list: {}", e))?;

    if let Some(row) = fetch_rows
        .next()
        .await
        .map_err(|e| format!("Failed to read list row: {}", e))?
    {
        row_to_list(&row).map_err(|e| format!("Failed to parse list: {}", e))
    } else {
        Err(format!("List with ID '{}' not found after update", id))
    }
}

#[tauri::command]
pub async fn update_list(
    state: State<'_, DbState>,
    id: String,
    name: Option<String>,
    color: Option<Option<String>>,
    position: Option<i64>,
    icon: Option<Option<String>>,
) -> Result<List, String> {
    update_list_impl(&state.conn, id, name, color, position, icon).await
}

pub async fn delete_list_impl(conn: &Connection, id: String) -> Result<(), String> {
    let mut rows = conn
        .query(
            "SELECT name FROM lists WHERE id = ?1 AND deleted_at IS NULL",
            params![id.clone()],
        )
        .await
        .map_err(|e| format!("Failed to query list: {}", e))?;

    if let Some(row) = rows
        .next()
        .await
        .map_err(|e| format!("Failed to read list row: {}", e))?
    {
        let name: String = row
            .get(0)
            .map_err(|e| format!("Failed to read list name: {}", e))?;
        if name.eq_ignore_ascii_case("inbox") {
            return Err("Cannot delete the default Inbox list".to_string());
        }
    }

    let now = now_iso();
    // Cascade soft-delete active tasks belonging to this list
    conn.execute(
        "UPDATE tasks SET deleted_at = ?2, updated_at = ?2 WHERE list_id = ?1 AND deleted_at IS NULL",
        params![id.clone(), now.clone()],
    )
    .await
    .map_err(|e| format!("Failed to cascade delete tasks for list: {}", e))?;

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::common::setup_test_conn;
    use crate::commands::tasks::{create_task_impl, get_tasks_impl};

    #[test]
    fn test_list_crud() {
        tauri::async_runtime::block_on(async {
            let (conn, temp_dir) = setup_test_conn().await;

            // Verify default Inbox list exists
            let initial_lists = get_lists_impl(&conn).await.expect("get initial lists");
            assert_eq!(initial_lists.len(), 4);
            assert!(initial_lists.iter().any(|l| l.name == "Inbox"));
            let inbox_id = initial_lists[0].id.clone();

            // Attempting to delete the default Inbox list must fail
            let delete_inbox_res = delete_list_impl(&conn, inbox_id.clone()).await;
            assert!(delete_inbox_res.is_err(), "Deleting Inbox list must fail");

            // Create custom lists
            let list1 = create_list_impl(&conn, "Work".to_string(), Some("#ff0000".to_string()), None)
                .await
                .expect("create list 1");
            assert_eq!(list1.name, "Work");
            assert_eq!(list1.color, Some("#ff0000".to_string()));
            assert_eq!(list1.position, 4);
            assert!(!list1.is_archived);

            let list2 = create_list_impl(&conn, "Personal".to_string(), None, None)
                .await
                .expect("create list 2");
            assert_eq!(list2.name, "Personal");
            assert_eq!(list2.position, 5);
            assert!(!list2.is_archived);

            // Get lists -> should be 6 (4 default + Work + Personal)
            let lists = get_lists_impl(&conn).await.expect("get lists");
            assert_eq!(lists.len(), 6);
            assert_eq!(lists[0].id, inbox_id);
            assert_eq!(lists[4].id, list1.id);
            assert_eq!(lists[5].id, list2.id);
            // Delete custom list (soft delete)
            delete_list_impl(&conn, list1.id.clone())
                .await
                .expect("delete list");

            let remaining = get_lists_impl(&conn).await.expect("get lists after delete");
            assert_eq!(remaining.len(), 5);
            assert_eq!(remaining[0].id, inbox_id);
            assert_eq!(remaining[4].id, list2.id);
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
    fn test_delete_list_cascades_and_hides_tasks() {
        tauri::async_runtime::block_on(async {
            let (conn, temp_dir) = setup_test_conn().await;

            // 1. Create a custom list
            let list = create_list_impl(&conn, "Project Alpha".to_string(), None, None)
                .await
                .expect("create list");

            // 2. Create tasks in that list: one due today, one future
            let today_str = chrono::Local::now().format("%Y-%m-%d").to_string();
            let future_str = chrono::Local::now()
                .checked_add_signed(chrono::Duration::days(5))
                .unwrap()
                .format("%Y-%m-%d")
                .to_string();

            let task1 = create_task_impl(
                &conn,
                list.id.clone(),
                "Task Alpha Today".to_string(),
                Some(today_str),
                Some(1),
                None,
            )
            .await
            .expect("create task 1");

            let task2 = create_task_impl(
                &conn,
                list.id.clone(),
                "Task Alpha Future".to_string(),
                Some(future_str),
                Some(2),
                None,
            )
            .await
            .expect("create task 2");

            // 3. Verify tasks appear in "today", "all", and list-specific views before list deletion
            let today_before = get_tasks_impl(
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
            .expect("query today before");
            assert!(today_before.iter().any(|t| t.id == task1.id));

            let all_before = get_tasks_impl(
                &conn,
                None,
                Some(false),
                Some("all".to_string()),
                None,
                None,
                None,
                None,
            )
            .await
            .expect("query all before");
            assert!(all_before.iter().any(|t| t.id == task1.id));
            assert!(all_before.iter().any(|t| t.id == task2.id));

            let list_tasks_before = get_tasks_impl(
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
            .expect("query list tasks before");
            assert_eq!(list_tasks_before.len(), 2);

            // 4. Soft-delete the list
            delete_list_impl(&conn, list.id.clone())
                .await
                .expect("delete list");

            // 5. Verify list is soft-deleted
            let mut list_rows = conn
                .query(
                    "SELECT deleted_at FROM lists WHERE id = ?1",
                    params![list.id.clone()],
                )
                .await
                .unwrap();
            let row = list_rows.next().await.unwrap().unwrap();
            let list_deleted_at: Option<String> = row.get(0).unwrap();
            assert!(list_deleted_at.is_some(), "List deleted_at must be set");

            // 6. Verify cascade soft-deletion of tasks in SQLite directly
            let mut task_rows = conn
                .query(
                    "SELECT id, deleted_at FROM tasks WHERE list_id = ?1",
                    params![list.id.clone()],
                )
                .await
                .unwrap();
            while let Some(r) = task_rows.next().await.unwrap() {
                let task_deleted_at: Option<String> = r.get(1).unwrap();
                assert!(
                    task_deleted_at.is_some(),
                    "Cascade soft-deletion must set deleted_at on task"
                );
            }

            // 7. Verify tasks are hidden from "today", "all", and list queries
            let today_after = get_tasks_impl(
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
            .expect("query today after");
            assert!(!today_after.iter().any(|t| t.id == task1.id));

            let all_after = get_tasks_impl(
                &conn,
                None,
                Some(false),
                Some("all".to_string()),
                None,
                None,
                None,
                None,
            )
            .await
            .expect("query all after");
            assert!(!all_after.iter().any(|t| t.id == task1.id || t.id == task2.id));

            let list_tasks_after = get_tasks_impl(
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
            .expect("query list tasks after");
            assert_eq!(list_tasks_after.len(), 0);

            // 8. Defense-in-depth: Manually clear deleted_at on task1 (simulating legacy orphaned task)
            conn.execute(
                "UPDATE tasks SET deleted_at = NULL WHERE id = ?1",
                params![task1.id.clone()],
            )
            .await
            .expect("simulate legacy orphaned task");

            // Even with task.deleted_at = NULL, because its list is deleted, active list filter must hide it
            let all_after_orphan = get_tasks_impl(
                &conn,
                None,
                Some(false),
                Some("all".to_string()),
                None,
                None,
                None,
                None,
            )
            .await
            .expect("query all after orphan");
            assert!(
                !all_after_orphan.iter().any(|t| t.id == task1.id),
                "Active list validation filter must exclude orphaned task from deleted list"
            );

            let today_after_orphan = get_tasks_impl(
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
            .expect("query today after orphan");
            assert!(
                !today_after_orphan.iter().any(|t| t.id == task1.id),
                "Active list validation filter must exclude orphaned task from today view"
            );

            let _ = std::fs::remove_dir_all(temp_dir);
        });
    }
}
