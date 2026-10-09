use std::fs;
use std::path::{Path, PathBuf};

pub const DATA_DIR_NAME: &str = "woTask-data";
pub const DB_FILE_NAME: &str = "wotask.db";

pub struct DataDir(pub PathBuf);

/// Portable first: keep data next to the exe when that directory is writable
/// (Desktop, USB drive). Otherwise (e.g. `C:\Program Files`) fall back to
/// `%APPDATA%\woTask`.
pub fn resolve_data_dir() -> PathBuf {
    if let Some(dir) = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|p| p.join(DATA_DIR_NAME)))
    {
        if is_writable(&dir) {
            return dir;
        }
    }

    let fallback = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("LOCALAPPDATA").map(PathBuf::from))
        .unwrap_or_else(std::env::temp_dir)
        .join("woTask");
    let _ = fs::create_dir_all(&fallback);
    fallback
}

fn is_writable(dir: &Path) -> bool {
    if fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(".write-probe");
    let ok = fs::write(&probe, b"ok").is_ok();
    let _ = fs::remove_file(&probe);
    ok
}
