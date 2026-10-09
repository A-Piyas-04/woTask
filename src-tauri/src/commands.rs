use std::sync::MutexGuard;

use rusqlite::Connection;
use tauri::{State, WebviewWindow};

use crate::db::{self, Db, Region, Task};
use crate::paths::DataDir;

type CmdResult<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn conn<'a>(db: &'a Db) -> CmdResult<MutexGuard<'a, Connection>> {
    db.0.lock().map_err(|_| "database lock poisoned".to_string())
}

#[tauri::command]
pub fn get_regions(db: State<'_, Db>) -> CmdResult<Vec<Region>> {
    let c = conn(&db)?;
    db::get_regions(&c).map_err(err)
}

#[tauri::command]
pub fn save_region(db: State<'_, Db>, region: Region) -> CmdResult<Region> {
    let c = conn(&db)?;
    db::save_region(&c, &region).map_err(err)?;
    Ok(region)
}

#[tauri::command]
pub fn delete_region(db: State<'_, Db>, id: String) -> CmdResult<()> {
    let c = conn(&db)?;
    db::delete_region(&c, &id).map_err(err)
}

#[tauri::command]
pub fn get_tasks(db: State<'_, Db>) -> CmdResult<Vec<Task>> {
    let c = conn(&db)?;
    db::get_tasks(&c).map_err(err)
}

#[tauri::command]
pub fn save_task(db: State<'_, Db>, task: Task) -> CmdResult<Task> {
    let mut c = conn(&db)?;
    db::save_task(&mut c, &task).map_err(err)?;
    Ok(task)
}

#[tauri::command]
pub fn delete_task(db: State<'_, Db>, id: String) -> CmdResult<()> {
    let c = conn(&db)?;
    db::delete_task(&c, &id).map_err(err)
}

#[tauri::command]
pub fn reorder_tasks(db: State<'_, Db>, region_id: String, ordered_ids: Vec<String>) -> CmdResult<()> {
    let mut c = conn(&db)?;
    db::reorder_tasks(&mut c, &region_id, &ordered_ids).map_err(err)
}

#[tauri::command]
pub fn seed(db: State<'_, Db>, regions: Vec<Region>, tasks: Vec<Task>) -> CmdResult<()> {
    let mut c = conn(&db)?;
    db::seed(&mut c, &regions, &tasks).map_err(err)
}

#[tauri::command]
pub fn data_path(dir: State<'_, DataDir>) -> String {
    dir.0.display().to_string()
}

#[tauri::command]
pub fn window_minimize(window: WebviewWindow) -> CmdResult<()> {
    window.minimize().map_err(err)
}

#[tauri::command]
pub fn window_toggle_maximize(window: WebviewWindow) -> CmdResult<bool> {
    if window.is_maximized().map_err(err)? {
        window.unmaximize().map_err(err)?;
        Ok(false)
    } else {
        window.maximize().map_err(err)?;
        Ok(true)
    }
}

#[tauri::command]
pub fn window_close(window: WebviewWindow) -> CmdResult<()> {
    window.close().map_err(err)
}
