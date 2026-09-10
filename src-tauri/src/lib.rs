pub mod commands;
pub mod db;
pub mod models;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            use tauri::Manager;
            let app_data_dir = app.path().app_data_dir()?;
            let db_path = app_data_dir.join("tudu.db");
            let db_state = tauri::async_runtime::block_on(async {
                db::init_db(&db_path).await
            }).map_err(|e| format!("Failed to initialize database: {}", e))?;
            app.manage(db_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::get_lists,
            commands::create_list,
            commands::delete_list,
            commands::get_tasks,
            commands::create_task,
            commands::update_task,
            commands::delete_task,
            commands::toggle_task_complete,
            commands::get_tags,
            commands::create_tag,
            commands::get_notes,
            commands::add_note,
            commands::get_reminders,
            commands::add_reminder,
            commands::delete_reminder,
            commands::export_backup,
            commands::import_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
