use libsql::{params, Connection};
use tauri::State;
use uuid::Uuid;

use crate::db::DbState;
use crate::models::{Tag, TagWithCount};
use super::common::{now_iso, row_to_tag, row_to_tag_with_count};

// ---------------------------------------------------------------------------
// Tag Commands
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

pub async fn get_tags_with_counts_impl(conn: &Connection) -> Result<Vec<TagWithCount>, String> {
    let mut rows = conn
        .query(
            "SELECT tg.id, tg.name, tg.color, tg.created_at, tg.updated_at, tg.deleted_at,
                    COUNT(t.id) as task_count
             FROM tags tg
             LEFT JOIN task_tags tt ON tg.id = tt.tag_id AND tt.deleted_at IS NULL
             LEFT JOIN tasks t ON tt.task_id = t.id 
                 AND t.deleted_at IS NULL 
                 AND t.completed = 0
                 AND t.list_id IN (SELECT id FROM lists WHERE deleted_at IS NULL)
             WHERE tg.deleted_at IS NULL
             GROUP BY tg.id
             ORDER BY tg.name ASC",
            (),
        )
        .await
        .map_err(|e| format!("Failed to query tags with counts: {}", e))?;

    let mut tags = Vec::new();
    while let Some(row) = rows
        .next()
        .await
        .map_err(|e| format!("Failed to read tag with count row: {}", e))?
    {
        tags.push(
            row_to_tag_with_count(&row).map_err(|e| format!("Failed to parse tag with count: {}", e))?,
        );
    }

    Ok(tags)
}

#[tauri::command]
pub async fn get_tags_with_counts(state: State<'_, DbState>) -> Result<Vec<TagWithCount>, String> {
    get_tags_with_counts_impl(&state.conn).await
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

pub async fn assign_tag_impl(
    conn: &Connection,
    task_id: String,
    tag_id: String,
) -> Result<(), String> {
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

    let mut tag_rows = conn
        .query(
            "SELECT id FROM tags WHERE (id = ?1 OR name = ?1) AND deleted_at IS NULL",
            params![tag_id.clone()],
        )
        .await
        .map_err(|e| format!("Failed to verify tag: {}", e))?;

    let resolved_tag_id = if let Some(row) = tag_rows
        .next()
        .await
        .map_err(|e| format!("Failed to fetch tag row: {}", e))?
    {
        row.get::<String>(0).map_err(|e| format!("Failed to read tag ID: {}", e))?
    } else {
        let new_tag = create_tag_impl(conn, tag_id.clone(), None).await?;
        new_tag.id
    };

    let now = now_iso();
    conn.execute(
        "INSERT INTO task_tags (task_id, tag_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?3)
         ON CONFLICT(task_id, tag_id) DO UPDATE SET deleted_at = NULL, updated_at = ?3",
        params![task_id, resolved_tag_id, now],
    )
    .await
    .map_err(|e| format!("Failed to assign tag: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn assign_tag(
    state: State<'_, DbState>,
    task_id: String,
    tag_id: String,
) -> Result<(), String> {
    assign_tag_impl(&state.conn, task_id, tag_id).await
}

pub async fn remove_tag_impl(
    conn: &Connection,
    task_id: String,
    tag_id: String,
) -> Result<(), String> {
    let mut tag_rows = conn
        .query(
            "SELECT id FROM tags WHERE id = ?1 OR name = ?1",
            params![tag_id.clone()],
        )
        .await
        .map_err(|e| format!("Failed to verify tag: {}", e))?;

    let resolved_tag_id = if let Some(row) = tag_rows
        .next()
        .await
        .map_err(|e| format!("Failed to fetch tag row: {}", e))?
    {
        row.get::<String>(0).map_err(|e| format!("Failed to read tag ID: {}", e))?
    } else {
        tag_id
    };

    let now = now_iso();
    conn.execute(
        "UPDATE task_tags SET deleted_at = ?3, updated_at = ?3
         WHERE task_id = ?1 AND tag_id = ?2 AND deleted_at IS NULL",
        params![task_id, resolved_tag_id, now],
    )
    .await
    .map_err(|e| format!("Failed to remove tag: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn remove_tag(
    state: State<'_, DbState>,
    task_id: String,
    tag_id: String,
) -> Result<(), String> {
    remove_tag_impl(&state.conn, task_id, tag_id).await
}

pub async fn batch_assign_tag_impl(
    conn: &Connection,
    task_ids: Vec<String>,
    tag_id: String,
) -> Result<(), String> {
    if task_ids.is_empty() {
        return Ok(());
    }

    let mut tag_rows = conn
        .query(
            "SELECT id FROM tags WHERE (id = ?1 OR name = ?1) AND deleted_at IS NULL",
            params![tag_id.clone()],
        )
        .await
        .map_err(|e| format!("Failed to verify tag: {}", e))?;

    let resolved_tag_id = if let Some(row) = tag_rows
        .next()
        .await
        .map_err(|e| format!("Failed to fetch tag row: {}", e))?
    {
        row.get::<String>(0).map_err(|e| format!("Failed to read tag ID: {}", e))?
    } else {
        let new_tag = create_tag_impl(conn, tag_id.clone(), None).await?;
        new_tag.id
    };

    let now = now_iso();
    for chunk in task_ids.chunks(500) {
        let placeholders = chunk.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "INSERT INTO task_tags (task_id, tag_id, created_at, updated_at)
             SELECT id, ?, ?, ? FROM tasks WHERE id IN ({}) AND deleted_at IS NULL
             ON CONFLICT(task_id, tag_id) DO UPDATE SET deleted_at = NULL, updated_at = ?",
            placeholders
        );
        let mut params: Vec<libsql::Value> = vec![
            libsql::Value::Text(resolved_tag_id.clone()),
            libsql::Value::Text(now.clone()),
            libsql::Value::Text(now.clone()),
        ];
        for id in chunk {
            params.push(libsql::Value::Text(id.clone()));
        }
        params.push(libsql::Value::Text(now.clone()));

        conn.execute(&sql, params)
            .await
            .map_err(|e| format!("Failed to batch assign tag: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn batch_assign_tag(
    state: State<'_, DbState>,
    task_ids: Vec<String>,
    tag_id: String,
) -> Result<(), String> {
    batch_assign_tag_impl(&state.conn, task_ids, tag_id).await
}

pub async fn batch_remove_tag_impl(
    conn: &Connection,
    task_ids: Vec<String>,
    tag_id: String,
) -> Result<(), String> {
    if task_ids.is_empty() {
        return Ok(());
    }

    let mut tag_rows = conn
        .query(
            "SELECT id FROM tags WHERE id = ?1 OR name = ?1",
            params![tag_id.clone()],
        )
        .await
        .map_err(|e| format!("Failed to verify tag: {}", e))?;

    let resolved_tag_id = if let Some(row) = tag_rows
        .next()
        .await
        .map_err(|e| format!("Failed to fetch tag row: {}", e))?
    {
        row.get::<String>(0).map_err(|e| format!("Failed to read tag ID: {}", e))?
    } else {
        tag_id
    };

    let now = now_iso();
    for chunk in task_ids.chunks(500) {
        let placeholders = chunk.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "UPDATE task_tags SET deleted_at = ?, updated_at = ?
             WHERE tag_id = ? AND task_id IN ({}) AND deleted_at IS NULL",
            placeholders
        );
        let mut params: Vec<libsql::Value> = vec![
            libsql::Value::Text(now.clone()),
            libsql::Value::Text(now.clone()),
            libsql::Value::Text(resolved_tag_id.clone()),
        ];
        for id in chunk {
            params.push(libsql::Value::Text(id.clone()));
        }

        conn.execute(&sql, params)
            .await
            .map_err(|e| format!("Failed to batch remove tag: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn batch_remove_tag(
    state: State<'_, DbState>,
    task_ids: Vec<String>,
    tag_id: String,
) -> Result<(), String> {
    batch_remove_tag_impl(&state.conn, task_ids, tag_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::common::setup_test_conn;
    use crate::commands::lists::{create_list_impl, delete_list_impl};
    use crate::commands::tasks::{
        create_task_impl, delete_task_impl, toggle_task_complete_impl,
    };

    #[test]
    fn test_tag_crud() {
        tauri::async_runtime::block_on(async {
            let (conn, temp_dir) = setup_test_conn().await;

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

            let _ = std::fs::remove_dir_all(temp_dir);
        });
    }

    #[test]
    fn test_get_tags_with_counts() {
        tauri::async_runtime::block_on(async {
            let (conn, temp_dir) = setup_test_conn().await;

            // Create lists
            let work_list = create_list_impl(&conn, "Work".to_string(), None, None)
                .await
                .expect("create work list");
            let personal_list = create_list_impl(&conn, "Personal".to_string(), None, None)
                .await
                .expect("create personal list");

            // Create tags
            let tag_urgent = create_tag_impl(&conn, "urgent".to_string(), Some("#ff0000".to_string()))
                .await
                .expect("create urgent tag");
            let tag_frontend = create_tag_impl(&conn, "frontend".to_string(), None)
                .await
                .expect("create frontend tag");
            let _tag_unused = create_tag_impl(&conn, "unused".to_string(), None)
                .await
                .expect("create unused tag");

            // Initial check: all counts should be 0
            let initial_tags = get_tags_with_counts_impl(&conn)
                .await
                .expect("get initial tags with counts");
            assert_eq!(initial_tags.len(), 3);
            for t in &initial_tags {
                assert_eq!(t.task_count, 0, "tag '{}' should have 0 count", t.name);
            }

            // Task 1: Incomplete in Work -> tagged urgent, frontend
            let task1 = create_task_impl(&conn, work_list.id.clone(), "Task 1".to_string(), None, None, None)
                .await
                .expect("create task 1");
            assign_tag_impl(&conn, task1.id.clone(), tag_urgent.id.clone())
                .await
                .expect("assign urgent to task 1");
            assign_tag_impl(&conn, task1.id.clone(), tag_frontend.id.clone())
                .await
                .expect("assign frontend to task 1");

            // Task 2: Incomplete in Work -> tagged urgent
            let task2 = create_task_impl(&conn, work_list.id.clone(), "Task 2".to_string(), None, None, None)
                .await
                .expect("create task 2");
            assign_tag_impl(&conn, task2.id.clone(), tag_urgent.id.clone())
                .await
                .expect("assign urgent to task 2");

            // Task 3: Completed in Work -> tagged urgent
            let task3 = create_task_impl(&conn, work_list.id.clone(), "Task 3".to_string(), None, None, None)
                .await
                .expect("create task 3");
            assign_tag_impl(&conn, task3.id.clone(), tag_urgent.id.clone())
                .await
                .expect("assign urgent to task 3");
            toggle_task_complete_impl(&conn, task3.id.clone(), true)
                .await
                .expect("complete task 3");

            // Task 4: Incomplete then Deleted in Work -> tagged urgent
            let task4 = create_task_impl(&conn, work_list.id.clone(), "Task 4".to_string(), None, None, None)
                .await
                .expect("create task 4");
            assign_tag_impl(&conn, task4.id.clone(), tag_urgent.id.clone())
                .await
                .expect("assign urgent to task 4");
            delete_task_impl(&conn, task4.id.clone())
                .await
                .expect("delete task 4");

            // Task 5: Incomplete in Personal -> tagged frontend
            let task5 = create_task_impl(&conn, personal_list.id.clone(), "Task 5".to_string(), None, None, None)
                .await
                .expect("create task 5");
            assign_tag_impl(&conn, task5.id.clone(), tag_frontend.id.clone())
                .await
                .expect("assign frontend to task 5");

            // Verify counts:
            // "frontend": task1 + task5 = 2
            // "urgent": task1 + task2 = 2 (task3 is completed, task4 is deleted)
            // "unused": 0
            let tags = get_tags_with_counts_impl(&conn)
                .await
                .expect("get tags with counts");
            let tag_map: std::collections::HashMap<String, i64> = tags
                .iter()
                .map(|t| (t.name.clone(), t.task_count))
                .collect();
            assert_eq!(tag_map.get("frontend"), Some(&2));
            assert_eq!(tag_map.get("urgent"), Some(&2));
            assert_eq!(tag_map.get("unused"), Some(&0));

            // Remove tag "urgent" from task2
            remove_tag_impl(&conn, task2.id.clone(), tag_urgent.id.clone())
                .await
                .expect("remove urgent from task 2");
            let tags = get_tags_with_counts_impl(&conn)
                .await
                .expect("get tags after remove_tag");
            let tag_map: std::collections::HashMap<String, i64> = tags
                .iter()
                .map(|t| (t.name.clone(), t.task_count))
                .collect();
            assert_eq!(tag_map.get("urgent"), Some(&1));

            // Soft-delete personal_list -> task5 belongs to personal_list, so frontend count drops from 2 to 1
            delete_list_impl(&conn, personal_list.id.clone())
                .await
                .expect("delete personal list");
            let tags = get_tags_with_counts_impl(&conn)
                .await
                .expect("get tags after delete list");
            let tag_map: std::collections::HashMap<String, i64> = tags
                .iter()
                .map(|t| (t.name.clone(), t.task_count))
                .collect();
            assert_eq!(tag_map.get("frontend"), Some(&1));

            let _ = std::fs::remove_dir_all(temp_dir);
        });
    }
    #[test]
    fn test_assign_tag_auto_creates_tag() {
        tauri::async_runtime::block_on(async {
            let (conn, temp_dir) = setup_test_conn().await;
            let work_list = create_list_impl(&conn, "Work".to_string(), None, None)
                .await
                .expect("create work list");
            let task = create_task_impl(&conn, work_list.id.clone(), "Task".to_string(), None, None, None)
                .await
                .expect("create task");

            // Assigning a tag by name that doesn't exist yet should automatically create it
            assign_tag_impl(&conn, task.id.clone(), "new_feature".to_string())
                .await
                .expect("assign tag auto creates");

            let tags = get_tags_impl(&conn).await.expect("get tags");
            assert_eq!(tags.len(), 1);
            assert_eq!(tags[0].name, "new_feature");
            let task_tags = conn
                .query(
                    "SELECT tag_id FROM task_tags WHERE task_id = ?1 AND deleted_at IS NULL",
                    params![task.id.clone()],
                )
                .await
                .expect("query task_tags");
            let mut rows = task_tags;
            let row = rows.next().await.unwrap().expect("has row");
            let assigned_tag_id: String = row.get(0).unwrap();
            let new_feature_tag = tags.iter().find(|t| t.name == "new_feature").unwrap();
            assert_eq!(assigned_tag_id, new_feature_tag.id);

            let _ = std::fs::remove_dir_all(temp_dir);
        });
    }

    #[test]
    fn test_batch_assign_and_remove_tag() {
        tauri::async_runtime::block_on(async {
            let (conn, temp_dir) = setup_test_conn().await;
            let list = create_list_impl(&conn, "Work".to_string(), None, None)
                .await
                .expect("create list");
            let t1 = create_task_impl(&conn, list.id.clone(), "Task 1".to_string(), None, None, None)
                .await
                .expect("create t1");
            let t2 = create_task_impl(&conn, list.id.clone(), "Task 2".to_string(), None, None, None)
                .await
                .expect("create t2");

            // Batch assign tag "priority"
            batch_assign_tag_impl(&conn, vec![t1.id.clone(), t2.id.clone()], "priority".to_string())
                .await
                .expect("batch assign");

            let tags = get_tags_with_counts_impl(&conn).await.expect("get tags with counts");
            assert_eq!(tags.len(), 1);
            assert_eq!(tags[0].name, "priority");
            assert_eq!(tags[0].task_count, 2);
            // Batch remove tag "priority"
            batch_remove_tag_impl(&conn, vec![t1.id.clone(), t2.id.clone()], "priority".to_string())
                .await
                .expect("batch remove");

            let tags_after = get_tags_with_counts_impl(&conn).await.expect("get tags after remove");
            assert_eq!(tags_after.len(), 1);
            assert_eq!(tags_after[0].task_count, 0);
            let _ = std::fs::remove_dir_all(temp_dir);
        });
    }
}
