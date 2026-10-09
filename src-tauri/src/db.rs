use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};

pub struct Db(pub Mutex<Connection>);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Region {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub description: Option<String>,
    pub color_index: i64,
    pub position: i64,
    pub target_date: Option<i64>,
    pub created_at: i64,
    pub archived_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub region_id: String,
    pub title: String,
    pub notes: String,
    pub priority: i64,
    pub due_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub position: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub tags: Vec<String>,
}

/// Must match `PALETTE.regionHues.length` in `src/contracts/tokens.ts`.
const REGION_HUE_COUNT: i64 = 8;

const MIGRATIONS: &[&str] = &[
    // v1
    "
    CREATE TABLE lists (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        color       TEXT NOT NULL,
        position    INTEGER NOT NULL,
        created_at  INTEGER NOT NULL
    );
    CREATE TABLE tasks (
        id            TEXT PRIMARY KEY,
        list_id       TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
        title         TEXT NOT NULL,
        notes         TEXT NOT NULL DEFAULT '',
        priority      INTEGER NOT NULL DEFAULT 0,
        due_at        INTEGER,
        completed_at  INTEGER,
        position      INTEGER NOT NULL,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
    );
    CREATE TABLE tags (
        id    INTEGER PRIMARY KEY AUTOINCREMENT,
        name  TEXT NOT NULL UNIQUE
    );
    CREATE TABLE task_tags (
        task_id  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (task_id, tag_id)
    );
    CREATE INDEX idx_tasks_list ON tasks(list_id, position);
    CREATE INDEX idx_tasks_due ON tasks(due_at);
    ",
    // v2: lists become regions. Full table rebuild (no in-place ALTER); the old `color` hex is not carried forward.
    "
    CREATE TABLE regions (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        kind         TEXT NOT NULL DEFAULT 'category' CHECK (kind IN ('category', 'project', 'goal')),
        description  TEXT,
        color_index  INTEGER NOT NULL DEFAULT 0,
        position     INTEGER NOT NULL,
        target_date  INTEGER,
        created_at   INTEGER NOT NULL,
        archived_at  INTEGER
    );
    INSERT INTO regions (id, name, kind, description, color_index, position, target_date, created_at, archived_at)
        SELECT id, name, 'category', NULL, ((position % 8) + 8) % 8, position, NULL, created_at, NULL FROM lists;
    CREATE TABLE tasks_v2 (
        id            TEXT PRIMARY KEY,
        region_id     TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
        title         TEXT NOT NULL,
        notes         TEXT NOT NULL DEFAULT '',
        priority      INTEGER NOT NULL DEFAULT 0,
        due_at        INTEGER,
        completed_at  INTEGER,
        position      INTEGER NOT NULL,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
    );
    INSERT INTO tasks_v2 (id, region_id, title, notes, priority, due_at, completed_at, position, created_at, updated_at)
        SELECT id, list_id, title, notes, priority, due_at, completed_at, position, created_at, updated_at FROM tasks;
    DROP TABLE tasks;
    ALTER TABLE tasks_v2 RENAME TO tasks;
    DROP TABLE lists;
    CREATE INDEX idx_tasks_region ON tasks(region_id, position);
    CREATE INDEX idx_tasks_due ON tasks(due_at);
    ",
];

pub fn init(dir: &Path) -> rusqlite::Result<Connection> {
    let db_path = dir.join(crate::paths::DB_FILE_NAME);
    let conn = Connection::open(&db_path)?;
    conn.busy_timeout(std::time::Duration::from_secs(3))?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    migrate(&conn, Some(&db_path))?;
    Ok(conn)
}

fn set_foreign_keys(conn: &Connection, on: bool) -> rusqlite::Result<()> {
    conn.pragma_update(None, "foreign_keys", if on { "ON" } else { "OFF" })?;
    let actual: i64 = conn.pragma_query_value(None, "foreign_keys", |r| r.get(0))?;
    if actual != i64::from(on) {
        return Err(rusqlite::Error::InvalidQuery);
    }
    Ok(())
}

/// Consistent snapshot of the live database (includes un-checkpointed WAL pages).
fn backup(conn: &Connection, db_path: &Path, from_version: i64) -> rusqlite::Result<()> {
    let mut name = db_path.as_os_str().to_owned();
    name.push(format!(".v{from_version}.bak"));
    let target = std::path::PathBuf::from(name);
    if target.exists() {
        std::fs::remove_file(&target).map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    }
    conn.execute("VACUUM INTO ?1", params![target.to_string_lossy()])?;
    Ok(())
}

/// Idempotent: applies only migrations newer than `user_version`.
/// Each step runs in its own transaction with foreign keys switched off (the pragma is a no-op inside a
/// transaction), and is only committed if `foreign_key_check` finds no dangling references.
fn migrate(conn: &Connection, db_path: Option<&Path>) -> rusqlite::Result<()> {
    let current: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    for (i, sql) in MIGRATIONS.iter().enumerate() {
        let version = i as i64 + 1;
        if version <= current {
            continue;
        }
        if current > 0 {
            if let Some(path) = db_path {
                backup(conn, path, version - 1)?;
            }
        }
        set_foreign_keys(conn, false)?;
        let result = (|| {
            conn.execute_batch("BEGIN IMMEDIATE;")?;
            conn.execute_batch(sql)?;
            let dangling: Option<String> =
                conn.query_row("PRAGMA foreign_key_check", [], |r| r.get(0)).optional()?;
            if let Some(table) = dangling {
                return Err(rusqlite::Error::SqliteFailure(
                    rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CONSTRAINT_FOREIGNKEY),
                    Some(format!("migration v{version}: dangling reference in {table}")),
                ));
            }
            conn.execute_batch(&format!("PRAGMA user_version = {version}; COMMIT;"))
        })();
        if result.is_err() {
            let _ = conn.execute_batch("ROLLBACK;");
        }
        set_foreign_keys(conn, true)?;
        result?;
    }
    Ok(())
}

pub fn get_regions(conn: &Connection) -> rusqlite::Result<Vec<Region>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, kind, description, color_index, position, target_date, created_at, archived_at
         FROM regions ORDER BY position, created_at",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(Region {
            id: r.get(0)?,
            name: r.get(1)?,
            kind: r.get(2)?,
            description: r.get(3)?,
            color_index: r.get(4)?,
            position: r.get(5)?,
            target_date: r.get(6)?,
            created_at: r.get(7)?,
            archived_at: r.get(8)?,
        })
    })?;
    rows.collect()
}

fn save_region_on(conn: &Connection, g: &Region) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO regions (id, name, kind, description, color_index, position, target_date, created_at, archived_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name, kind = excluded.kind, description = excluded.description,
            color_index = excluded.color_index, position = excluded.position,
            target_date = excluded.target_date, archived_at = excluded.archived_at",
        params![
            g.id,
            g.name,
            g.kind,
            g.description,
            g.color_index.rem_euclid(REGION_HUE_COUNT),
            g.position,
            g.target_date,
            g.created_at,
            g.archived_at
        ],
    )?;
    Ok(())
}

pub fn save_region(conn: &Connection, g: &Region) -> rusqlite::Result<()> {
    save_region_on(conn, g)
}

pub fn delete_region(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM regions WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn get_tasks(conn: &Connection) -> rusqlite::Result<Vec<Task>> {
    let mut tag_map: HashMap<String, Vec<String>> = HashMap::new();
    {
        let mut stmt = conn.prepare(
            "SELECT tt.task_id, t.name FROM task_tags tt JOIN tags t ON t.id = tt.tag_id ORDER BY t.name",
        )?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        for row in rows {
            let (task_id, name) = row?;
            tag_map.entry(task_id).or_default().push(name);
        }
    }

    let mut stmt = conn.prepare(
        "SELECT id, region_id, title, notes, priority, due_at, completed_at, position, created_at, updated_at
         FROM tasks ORDER BY region_id, position, created_at",
    )?;
    let rows = stmt.query_map([], |r| {
        let id: String = r.get(0)?;
        Ok(Task {
            tags: Vec::new(),
            region_id: r.get(1)?,
            title: r.get(2)?,
            notes: r.get(3)?,
            priority: r.get(4)?,
            due_at: r.get(5)?,
            completed_at: r.get(6)?,
            position: r.get(7)?,
            created_at: r.get(8)?,
            updated_at: r.get(9)?,
            id,
        })
    })?;
    let mut tasks = Vec::new();
    for row in rows {
        let mut t = row?;
        if let Some(tags) = tag_map.remove(&t.id) {
            t.tags = tags;
        }
        tasks.push(t);
    }
    Ok(tasks)
}

fn save_task_tx(tx: &Transaction, t: &Task) -> rusqlite::Result<()> {
    tx.execute(
        "INSERT INTO tasks (id, region_id, title, notes, priority, due_at, completed_at, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(id) DO UPDATE SET
            region_id = excluded.region_id, title = excluded.title, notes = excluded.notes,
            priority = excluded.priority, due_at = excluded.due_at, completed_at = excluded.completed_at,
            position = excluded.position, updated_at = excluded.updated_at",
        params![
            t.id, t.region_id, t.title, t.notes, t.priority, t.due_at, t.completed_at, t.position, t.created_at,
            t.updated_at
        ],
    )?;
    tx.execute("DELETE FROM task_tags WHERE task_id = ?1", params![t.id])?;
    for tag in &t.tags {
        tx.execute("INSERT OR IGNORE INTO tags (name) VALUES (?1)", params![tag])?;
        let tag_id: i64 = tx.query_row("SELECT id FROM tags WHERE name = ?1", params![tag], |r| r.get(0))?;
        tx.execute("INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)", params![t.id, tag_id])?;
    }
    Ok(())
}

pub fn save_task(conn: &mut Connection, t: &Task) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    save_task_tx(&tx, t)?;
    tx.commit()
}

pub fn delete_task(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn reorder_tasks(conn: &mut Connection, region_id: &str, ids: &[String]) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare("UPDATE tasks SET position = ?1 WHERE id = ?2 AND region_id = ?3")?;
        for (i, id) in ids.iter().enumerate() {
            stmt.execute(params![i as i64, id, region_id])?;
        }
    }
    tx.commit()
}

pub fn is_empty(conn: &Connection) -> rusqlite::Result<bool> {
    let any: Option<i64> = conn.query_row("SELECT 1 FROM regions LIMIT 1", [], |r| r.get(0)).optional()?;
    Ok(any.is_none())
}

pub fn seed(conn: &mut Connection, regions: &[Region], tasks: &[Task]) -> rusqlite::Result<()> {
    if !is_empty(conn)? {
        return Ok(());
    }
    let tx = conn.transaction()?;
    for g in regions {
        save_region_on(&tx, g)?;
    }
    for t in tasks {
        save_task_tx(&tx, t)?;
    }
    tx.commit()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrate(&conn, None).unwrap();
        conn
    }

    fn region(id: &str, position: i64) -> Region {
        Region {
            id: id.into(),
            name: format!("Region {id}"),
            kind: "project".into(),
            description: Some("why".into()),
            color_index: position,
            position,
            target_date: None,
            created_at: 1,
            archived_at: None,
        }
    }

    fn task(id: &str, pos: i64) -> Task {
        Task {
            id: id.into(),
            region_id: "r".into(),
            title: format!("Task {id}"),
            notes: String::new(),
            priority: 1,
            due_at: None,
            completed_at: None,
            position: pos,
            created_at: 1,
            updated_at: 1,
            tags: vec!["a".into(), "b".into()],
        }
    }

    #[test]
    fn crud_reorder_and_cascade() {
        let mut conn = mem();
        migrate(&conn, None).unwrap(); // idempotent
        seed(&mut conn, &[region("r", 0)], &[task("1", 0), task("2", 1)]).unwrap();
        assert!(!is_empty(&conn).unwrap());
        let regions = get_regions(&conn).unwrap();
        assert_eq!(regions[0].kind, "project");
        assert_eq!(regions[0].description.as_deref(), Some("why"));

        let mut t = task("3", 2);
        t.title = "বাংলা".into();
        save_task(&mut conn, &t).unwrap();
        t.tags = vec!["c".into()];
        t.completed_at = Some(5);
        save_task(&mut conn, &t).unwrap();

        reorder_tasks(&mut conn, "r", &["3".into(), "1".into(), "2".into()]).unwrap();
        let tasks = get_tasks(&conn).unwrap();
        assert_eq!(tasks.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(), vec!["3", "1", "2"]);
        assert_eq!(tasks[0].title, "বাংলা");
        assert_eq!(tasks[0].tags, vec!["c".to_string()]);
        assert_eq!(tasks[0].completed_at, Some(5));
        assert_eq!(tasks[1].tags, vec!["a".to_string(), "b".to_string()]);

        delete_task(&conn, "1").unwrap();
        assert_eq!(get_tasks(&conn).unwrap().len(), 2);
        delete_region(&conn, "r").unwrap();
        assert_eq!(get_tasks(&conn).unwrap().len(), 0);
    }

    /// Builds a database exactly as version 1 left it.
    fn v1_db(conn: &Connection) {
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        conn.execute_batch(&format!("BEGIN; {} PRAGMA user_version = 1; COMMIT;", MIGRATIONS[0])).unwrap();
        conn.execute_batch(
            "
            INSERT INTO lists VALUES ('inbox', 'Inbox', '#7c9cff', 0, 10), ('personal', 'Personal', '#4fd1a5', 1, 11),
                                     ('ninth', 'Ninth', '#ffffff', 9, 12);
            INSERT INTO tasks VALUES ('t1', 'inbox', 'One', 'n', 3, 100, NULL, 0, 1, 2),
                                     ('t2', 'inbox', 'Two', '', 0, NULL, 50, 1, 1, 2),
                                     ('t3', 'personal', 'তিন', '', 2, NULL, NULL, 0, 1, 2);
            INSERT INTO tags (name) VALUES ('x'), ('y');
            INSERT INTO task_tags VALUES ('t1', 1), ('t1', 2), ('t3', 2);
            ",
        )
        .unwrap();
    }

    fn version(conn: &Connection) -> i64 {
        conn.pragma_query_value(None, "user_version", |r| r.get(0)).unwrap()
    }

    #[test]
    fn v1_to_v2_keeps_every_row() {
        let conn = Connection::open_in_memory().unwrap();
        v1_db(&conn);
        migrate(&conn, None).unwrap();
        migrate(&conn, None).unwrap(); // second run is a no-op
        assert_eq!(version(&conn), 2);
        let fk: i64 = conn.pragma_query_value(None, "foreign_keys", |r| r.get(0)).unwrap();
        assert_eq!(fk, 1);

        let regions = get_regions(&conn).unwrap();
        assert_eq!(regions.iter().map(|g| g.id.as_str()).collect::<Vec<_>>(), vec!["inbox", "personal", "ninth"]);
        assert!(regions.iter().all(|g| g.kind == "category" && g.archived_at.is_none()));
        assert_eq!(regions.iter().map(|g| g.color_index).collect::<Vec<_>>(), vec![0, 1, 1]);

        let tasks = get_tasks(&conn).unwrap();
        assert_eq!(tasks.len(), 3);
        let t1 = tasks.iter().find(|t| t.id == "t1").unwrap();
        assert_eq!((t1.region_id.as_str(), t1.priority, t1.due_at, t1.notes.as_str()), ("inbox", 3, Some(100), "n"));
        assert_eq!(t1.tags, vec!["x".to_string(), "y".to_string()]);
        assert_eq!(tasks.iter().find(|t| t.id == "t2").unwrap().completed_at, Some(50));
        assert_eq!(tasks.iter().find(|t| t.id == "t3").unwrap().title, "তিন");

        let old: Option<String> = conn
            .query_row("SELECT name FROM sqlite_master WHERE name IN ('lists', 'tasks_v2')", [], |r| r.get(0))
            .optional()
            .unwrap();
        assert_eq!(old, None);

        // Cascades still work on the rebuilt tables.
        delete_region(&conn, "inbox").unwrap();
        assert_eq!(get_tasks(&conn).unwrap().len(), 1);
        let links: i64 = conn.query_row("SELECT COUNT(*) FROM task_tags", [], |r| r.get(0)).unwrap();
        assert_eq!(links, 1);
    }

    #[test]
    fn failed_migration_rolls_back_to_v1() {
        let conn = Connection::open_in_memory().unwrap();
        v1_db(&conn);
        conn.pragma_update(None, "foreign_keys", "OFF").unwrap();
        conn.execute("INSERT INTO tasks VALUES ('orphan', 'missing', 'x', '', 0, NULL, NULL, 0, 1, 1)", []).unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();

        assert!(migrate(&conn, None).is_err());
        assert_eq!(version(&conn), 1);
        let lists: i64 = conn.query_row("SELECT COUNT(*) FROM lists", [], |r| r.get(0)).unwrap();
        let tasks: i64 = conn.query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0)).unwrap();
        assert_eq!((lists, tasks), (3, 4));
        let fk: i64 = conn.pragma_query_value(None, "foreign_keys", |r| r.get(0)).unwrap();
        assert_eq!(fk, 1);
    }

    /// `WOTASK_DB=<copy of a real wotask.db> cargo test -- --ignored real_database`
    #[test]
    #[ignore]
    fn real_database_migrates_without_loss() {
        let path = std::path::PathBuf::from(std::env::var("WOTASK_DB").expect("set WOTASK_DB"));
        let conn = Connection::open(&path).unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        let count = |sql: &str| -> i64 { conn.query_row(sql, [], |r| r.get(0)).unwrap() };
        let v = version(&conn);
        let table = if v < 2 { "lists" } else { "regions" };
        let before = (count(&format!("SELECT COUNT(*) FROM {table}")), count("SELECT COUNT(*) FROM tasks"), count("SELECT COUNT(*) FROM task_tags"));
        migrate(&conn, Some(&path)).unwrap();
        let after = (count("SELECT COUNT(*) FROM regions"), count("SELECT COUNT(*) FROM tasks"), count("SELECT COUNT(*) FROM task_tags"));
        println!("v{v} -> v{}: {before:?} -> {after:?}", version(&conn));
        assert_eq!(before, after);
        assert_eq!(version(&conn), 2);
    }

    #[test]
    fn upgrade_writes_backup_beside_database() {
        let dir = std::env::temp_dir().join(format!("wotask-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("wotask.db");
        let _ = std::fs::remove_file(&path);
        {
            let conn = Connection::open(&path).unwrap();
            conn.pragma_update(None, "journal_mode", "WAL").unwrap();
            v1_db(&conn);
            migrate(&conn, Some(&path)).unwrap();
            assert_eq!(get_tasks(&conn).unwrap().len(), 3);
        }
        let bak = dir.join("wotask.db.v1.bak");
        let backup = Connection::open(&bak).unwrap();
        let rows: i64 = backup.query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0)).unwrap();
        assert_eq!(rows, 3);
        assert_eq!(version(&backup), 1);
        drop(backup);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
