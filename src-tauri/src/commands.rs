use tauri::{State, WebviewWindow};

use crate::db::{self, Db, List, Task};
use crate::paths::DataDir;

type CmdResult<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

macro_rules! lock {
    ($db:expr) => {
        $db.0.lock().map_err(|_| "database lock poisoned".to_string())?
    };
}

#[tauri::command]
pub fn list_lists(db: State<'_, Db>) -> CmdResult<Vec<List>> {
    db::list_lists(&lock!(db)).map_err(err)
}

#[tauri::command]
pub fn save_list(db: State<'_, Db>, list: List) -> CmdResult<List> {
    db::save_list(&lock!(db), &list).map_err(err)?;
    Ok(list)
}

#[tauri::command]
pub fn delete_list(db: State<'_, Db>, id: String) -> CmdResult<()> {
    db::delete_list(&lock!(db), &id).map_err(err)
}

#[tauri::command]
pub fn list_tasks(db: State<'_, Db>) -> CmdResult<Vec<Task>> {
    db::list_tasks(&lock!(db)).map_err(err)
}

#[tauri::command]
pub fn save_task(db: State<'_, Db>, task: Task) -> CmdResult<Task> {
    db::save_task(&mut lock!(db), &task).map_err(err)?;
    Ok(task)
}

#[tauri::command]
pub fn delete_task(db: State<'_, Db>, id: String) -> CmdResult<()> {
    db::delete_task(&lock!(db), &id).map_err(err)
}

#[tauri::command]
pub fn reorder_tasks(db: State<'_, Db>, list_id: String, ordered_ids: Vec<String>) -> CmdResult<()> {
    db::reorder_tasks(&mut lock!(db), &list_id, &ordered_ids).map_err(err)
}

#[tauri::command]
pub fn seed(db: State<'_, Db>, lists: Vec<List>, tasks: Vec<Task>) -> CmdResult<()> {
    db::seed(&mut lock!(db), &lists, &tasks).map_err(err)
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
