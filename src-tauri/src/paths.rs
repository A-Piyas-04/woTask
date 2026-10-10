use std::fs;
use std::path::{Path, PathBuf};

pub const DATA_DIR_NAME: &str = "woTask-data";
pub const DB_FILE_NAME: &str = "wotask.db";

/// Written beside the exe by the NSIS installer. Its presence means this copy is
/// managed by the installer, so its directory is removed on upgrade and uninstall.
const UNINSTALLER_NAME: &str = "uninstall.exe";

pub struct DataDir(pub PathBuf);

/// Portable first: keep data next to the exe when that directory is writable
/// (Desktop, USB drive). An installed copy is never portable - its folder is
/// deleted on upgrade and uninstall - so it uses `%APPDATA%\woTask`, as does a
/// read-only location such as `C:\Program Files`.
pub fn resolve_data_dir() -> PathBuf {
    if let Some(exe_dir) = std::env::current_exe().ok().and_then(|exe| exe.parent().map(PathBuf::from)) {
        if !is_installed(&exe_dir) {
            let dir = exe_dir.join(DATA_DIR_NAME);
            if is_writable(&dir) {
                return dir;
            }
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

fn is_installed(exe_dir: &Path) -> bool {
    exe_dir.join(UNINSTALLER_NAME).is_file()
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

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("wotask-paths-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn a_writable_folder_without_an_uninstaller_is_portable() {
        let dir = temp_dir("portable");
        assert!(!is_installed(&dir));
        assert!(is_writable(&dir.join(DATA_DIR_NAME)));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_uninstaller_beside_the_exe_marks_the_copy_as_installed() {
        let dir = temp_dir("installed");
        fs::write(dir.join(UNINSTALLER_NAME), b"stub").expect("write uninstaller stub");
        assert!(is_installed(&dir));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_uninstaller_directory_does_not_mark_the_copy_as_installed() {
        let dir = temp_dir("dir-not-file");
        fs::create_dir_all(dir.join(UNINSTALLER_NAME)).expect("create uninstaller dir");
        assert!(!is_installed(&dir));
        let _ = fs::remove_dir_all(&dir);
    }
}
