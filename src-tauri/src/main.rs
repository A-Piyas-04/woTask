#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod paths;

use std::sync::Mutex;

use tauri::Manager;

fn main() {
    std::panic::set_hook(Box::new(|info| {
        fatal(&format!("woTask crashed unexpectedly.\n\n{info}"));
    }));

    if let Err(e) = tauri::webview_version() {
        fatal(&format!(
            "woTask needs the Microsoft Edge WebView2 Runtime, which was not found on this PC.\n\n\
             Install \"WebView2 Runtime\" from Microsoft, then start woTask again.\n\nDetails: {e}"
        ));
        return;
    }

    let data_dir = paths::resolve_data_dir();
    let conn = match db::init(&data_dir) {
        Ok(c) => c,
        Err(e) => {
            fatal(&format!("woTask could not open its database in\n{}\n\n{e}", data_dir.display()));
            return;
        }
    };

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .manage(db::Db(Mutex::new(conn)))
        .manage(paths::DataDir(data_dir))
        .invoke_handler(tauri::generate_handler![
            commands::list_lists,
            commands::save_list,
            commands::delete_list,
            commands::list_tasks,
            commands::save_task,
            commands::delete_task,
            commands::reorder_tasks,
            commands::seed,
            commands::data_path,
            commands::window_minimize,
            commands::window_toggle_maximize,
            commands::window_close,
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        fatal(&format!("woTask could not start its window.\n\n{e}"));
    }
}

#[cfg(windows)]
fn fatal(message: &str) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};
    let wide = |s: &str| s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let text = wide(message);
    let title = wide("woTask");
    unsafe {
        MessageBoxW(std::ptr::null_mut(), text.as_ptr(), title.as_ptr(), MB_OK | MB_ICONERROR);
    }
}

#[cfg(not(windows))]
fn fatal(message: &str) {
    eprintln!("{message}");
}
