pub mod commands;
pub mod db;
pub mod models;

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
            commands::get_lists,
            commands::create_list,
            commands::update_list,
            commands::delete_list,
            commands::get_tasks,
            commands::get_task_detail,
            commands::create_task,
            commands::update_task,
            commands::delete_task,
            commands::batch_delete_tasks,
            commands::toggle_task_complete,
            commands::batch_update_tasks,
            commands::get_tags,
            commands::get_tags_with_counts,
            commands::create_tag,
            commands::assign_tag,
            commands::remove_tag,
            commands::batch_assign_tag,
            commands::batch_remove_tag,
            commands::get_notes,
            commands::add_note,
            commands::update_note,
            commands::delete_note,
            commands::get_reminders,
            commands::add_reminder,
            commands::delete_reminder,
            commands::export_backup,
            commands::import_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
