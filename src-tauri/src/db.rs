use std::collections::HashSet;
use std::path::Path;
use std::sync::Arc;
use libsql::{params, Builder, Connection, Database};

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

pub const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "0001_initial_schema",
        sql: include_str!("../migrations/0001_initial_schema.sql"),
    },
    Migration {
        version: 2,
        name: "0002_opentask_alignment",
        sql: include_str!("../migrations/0002_opentask_alignment.sql"),
    },
];

pub async fn run_migrations(conn: &Connection) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _migrations (
            version INTEGER PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );"
    ).await?;

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
            ).await?;
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

    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;").await?;

    run_migrations(&conn).await?;

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
            let mut rows = state.conn.query(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name ASC",
                (),
            ).await.expect("query failed");

            let mut tables = Vec::new();
            while let Some(row) = rows.next().await.unwrap() {
                let name: String = row.get(0).unwrap();
                tables.push(name);
            }

            assert!(tables.contains(&"_migrations".to_string()), "_migrations missing");
            assert!(tables.contains(&"lists".to_string()), "lists missing");
            assert!(tables.contains(&"tasks".to_string()), "tasks missing");
            assert!(tables.contains(&"tags".to_string()), "tags missing");
            assert!(tables.contains(&"task_tags".to_string()), "task_tags missing");
            assert!(tables.contains(&"notes".to_string()), "notes missing");

            // Verify idempotence: running init_db / migrations a second time succeeds
            run_migrations(&state.conn).await.expect("idempotent migration run failed");

            // Clean up
            let _ = std::fs::remove_dir_all(temp_dir);
        });
    }
}
