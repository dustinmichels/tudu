use libsql::{params, Builder, Connection, Database};
use std::collections::HashSet;
use std::path::Path;
use std::sync::Arc;

#[derive(Clone)]
pub struct DbConnection(pub Connection);

#[derive(Clone)]
pub struct DbState {
    pub db: Arc<Database>,
    pub conn: Connection,
}

pub struct Migration {
    pub version: i64,
    pub name: &'static str,
    pub sql: &'static str,
}

pub const MIGRATIONS: &[Migration] = &[Migration {
    version: 1,
    name: "0001_initial_schema",
    sql: include_str!("../migrations/0001_initial_schema.sql"),
}];

pub async fn ensure_default_inbox(
    conn: &Connection,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let mut rows = conn
        .query(
            "SELECT id FROM lists WHERE lower(name) = 'inbox' AND deleted_at IS NULL LIMIT 1",
            (),
        )
        .await?;
    if let Some(row) = rows.next().await? {
        let id: String = row.get(0)?;
        return Ok(id);
    }

    let id = "00000000-0000-0000-0000-000000000001".to_string();
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    conn.execute(
        "INSERT OR IGNORE INTO lists (id, name, color, position, created_at, updated_at) VALUES (?1, 'Inbox', '#3b82f6', 0, ?2, ?2)",
        params![id.clone(), now],
    ).await?;
    Ok(id)
}

pub async fn ensure_default_gtd_lists(
    conn: &Connection,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let defaults = [
        (
            "00000000-0000-0000-0000-000000000002",
            "Next actions",
            "#f59e0b",
            1,
        ),
        (
            "00000000-0000-0000-0000-000000000003",
            "Waiting on",
            "#f97316",
            2,
        ),
        (
            "00000000-0000-0000-0000-000000000004",
            "Someday/Maybe",
            "#eab308",
            3,
        ),
    ];

    for (id, name, color, pos) in defaults {
        let mut rows = conn
            .query(
                "SELECT id FROM lists WHERE lower(name) = ?1 AND deleted_at IS NULL LIMIT 1",
                params![name.to_lowercase()],
            )
            .await?;
        if rows.next().await?.is_none() {
            conn.execute(
                "INSERT OR IGNORE INTO lists (id, name, color, position, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
                params![id, name, color, pos, now.clone()],
            )
            .await?;
        }
    }

    Ok(())
}

pub async fn ensure_default_gtd_tags(
    conn: &Connection,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let default_tags = [
        ("00000000-0000-0000-0001-000000000001", "@home", "#22c55e"),
        ("00000000-0000-0000-0001-000000000002", "@work", "#3b82f6"),
        ("00000000-0000-0000-0001-000000000003", "@school", "#a855f7"),
        ("00000000-0000-0000-0001-000000000004", "@errands", "#eab308"),
        ("00000000-0000-0000-0001-000000000005", "@computer", "#06b6d4"),
        ("00000000-0000-0000-0001-000000000006", "@calls", "#f43f5e"),
    ];

    for (id, name, color) in default_tags {
        let mut rows = conn
            .query(
                "SELECT id FROM tags WHERE lower(name) = ?1 AND deleted_at IS NULL LIMIT 1",
                params![name.to_lowercase()],
            )
            .await?;
        if rows.next().await?.is_none() {
            conn.execute(
                "INSERT OR IGNORE INTO tags (id, name, color, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
                params![id, name, color, now.clone()],
            )
            .await?;
        }
    }

    Ok(())
}

pub async fn run_migrations(
    conn: &Connection,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _migrations (
            version INTEGER PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );",
    )
    .await?;

    let mut rows = conn
        .query("SELECT version FROM _migrations ORDER BY version ASC", ())
        .await?;
    let mut applied = HashSet::new();
    while let Some(row) = rows.next().await? {
        let v: i64 = row.get(0)?;
        applied.insert(v);
    }

    for migration in MIGRATIONS {
        if !applied.contains(&migration.version) {
            conn.execute_batch(migration.sql).await?;
            conn.execute(
                "INSERT INTO _migrations (version, name) VALUES (?1, ?2)",
                params![migration.version, migration.name],
            )
            .await?;
        }
    }

    Ok(())
}

pub async fn init_db(db_path: &Path) -> Result<DbState, Box<dyn std::error::Error + Send + Sync>> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let db = Builder::new_local(db_path).build().await?;
    let conn = db.connect()?;

    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")
        .await?;

    run_migrations(&conn).await?;
    ensure_default_inbox(&conn).await?;
    ensure_default_gtd_lists(&conn).await?;
    ensure_default_gtd_tags(&conn).await?;
    if let Err(e) = crate::commands::tasks::purge_old_deleted_tasks_impl(&conn, 30).await {
        eprintln!("Purge of old deleted tasks failed: {e}");
    }

    Ok(DbState {
        db: Arc::new(db),
        conn,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_init_db_and_migrations() {
        tauri::async_runtime::block_on(async {
            let temp_dir = std::env::temp_dir().join(format!("tudu_test_{}", uuid::Uuid::new_v4()));
            let db_path = temp_dir.join("test.db");

            let state = init_db(&db_path).await.expect("init_db failed");

            // Verify tables exist
            let mut rows = state
                .conn
                .query(
                    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name ASC",
                    (),
                )
                .await
                .expect("query failed");

            let mut tables = Vec::new();
            while let Some(row) = rows.next().await.unwrap() {
                let name: String = row.get(0).unwrap();
                tables.push(name);
            }

            assert!(
                tables.contains(&"_migrations".to_string()),
                "_migrations missing"
            );
            assert!(tables.contains(&"lists".to_string()), "lists missing");
            assert!(tables.contains(&"tasks".to_string()), "tasks missing");
            assert!(tables.contains(&"tags".to_string()), "tags missing");
            assert!(
                tables.contains(&"task_tags".to_string()),
                "task_tags missing"
            );
            assert!(tables.contains(&"notes".to_string()), "notes missing");


            // Verify default GTD context tags
            let expected_tags = ["@calls", "@computer", "@errands", "@home", "@school", "@work"];
            let mut tag_rows = state
                .conn
                .query("SELECT name FROM tags WHERE deleted_at IS NULL ORDER BY name ASC", ())
                .await
                .expect("query tags failed");
            let mut actual_tags = Vec::new();
            while let Some(row) = tag_rows.next().await.unwrap() {
                let name: String = row.get(0).unwrap();
                actual_tags.push(name);
            }
            assert_eq!(actual_tags, expected_tags);

            // Verify default tasks and links
            let mut task_rows = state
                .conn
                .query("SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL", ())
                .await
                .expect("query tasks failed");
            let task_count: i64 = task_rows.next().await.unwrap().unwrap().get(0).unwrap();
            assert_eq!(task_count, 6);

            let mut tt_rows = state
                .conn
                .query("SELECT COUNT(*) FROM task_tags WHERE deleted_at IS NULL", ())
                .await
                .expect("query task_tags failed");
            let tt_count: i64 = tt_rows.next().await.unwrap().unwrap().get(0).unwrap();
            assert_eq!(tt_count, 6);
            // Soft-delete one demo task to verify ensure_default_gtd_tags doesn't resurrect it
            state
                .conn
                .execute(
                    "UPDATE tasks SET deleted_at = datetime('now') WHERE id = '00000000-0000-0000-0002-000000000001'",
                    (),
                )
                .await
                .expect("soft delete demo task");

            // Re-running ensure_default_gtd_tags (simulating app restart) must not resurrect tasks
            ensure_default_gtd_tags(&state.conn)
                .await
                .expect("ensure_default_gtd_tags rerun");
            run_migrations(&state.conn)
                .await
                .expect("idempotent migration run failed");

            let mut active_task_rows = state
                .conn
                .query("SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL", ())
                .await
                .expect("query active tasks count");
            let active_task_count: i64 = active_task_rows.next().await.unwrap().unwrap().get(0).unwrap();
            assert_eq!(active_task_count, 5);
            // Clean up
            let _ = std::fs::remove_dir_all(temp_dir);
        });
    }
}
