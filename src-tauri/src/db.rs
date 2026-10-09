use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};

pub struct Db(pub Mutex<Connection>);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct List {
    pub id: String,
    pub name: String,
    pub color: String,
    pub position: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub list_id: String,
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
];

pub fn init(dir: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(dir.join(crate::paths::DB_FILE_NAME))?;
    conn.busy_timeout(std::time::Duration::from_secs(3))?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    migrate(&conn)?;
    Ok(conn)
}

/// Idempotent: applies only migrations newer than `user_version`.
fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    let current: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    for (i, sql) in MIGRATIONS.iter().enumerate() {
        let version = i as i64 + 1;
        if version > current {
            conn.execute_batch(&format!("BEGIN; {sql} PRAGMA user_version = {version}; COMMIT;"))?;
        }
    }
    Ok(())
}

pub fn list_lists(conn: &Connection) -> rusqlite::Result<Vec<List>> {
    let mut stmt = conn.prepare("SELECT id, name, color, position, created_at FROM lists ORDER BY position, created_at")?;
    let rows = stmt.query_map([], |r| {
        Ok(List { id: r.get(0)?, name: r.get(1)?, color: r.get(2)?, position: r.get(3)?, created_at: r.get(4)? })
    })?;
    rows.collect()
}

pub fn save_list(conn: &Connection, l: &List) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO lists (id, name, color, position, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color, position = excluded.position",
        params![l.id, l.name, l.color, l.position, l.created_at],
    )?;
    Ok(())
}

pub fn delete_list(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM lists WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn list_tasks(conn: &Connection) -> rusqlite::Result<Vec<Task>> {
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
        "SELECT id, list_id, title, notes, priority, due_at, completed_at, position, created_at, updated_at
         FROM tasks ORDER BY list_id, position, created_at",
    )?;
    let rows = stmt.query_map([], |r| {
        let id: String = r.get(0)?;
        Ok(Task {
            tags: Vec::new(),
            list_id: r.get(1)?,
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
        "INSERT INTO tasks (id, list_id, title, notes, priority, due_at, completed_at, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(id) DO UPDATE SET
            list_id = excluded.list_id, title = excluded.title, notes = excluded.notes,
            priority = excluded.priority, due_at = excluded.due_at, completed_at = excluded.completed_at,
            position = excluded.position, updated_at = excluded.updated_at",
        params![
            t.id, t.list_id, t.title, t.notes, t.priority, t.due_at, t.completed_at, t.position, t.created_at,
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

pub fn reorder_tasks(conn: &mut Connection, list_id: &str, ids: &[String]) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare("UPDATE tasks SET position = ?1 WHERE id = ?2 AND list_id = ?3")?;
        for (i, id) in ids.iter().enumerate() {
            stmt.execute(params![i as i64, id, list_id])?;
        }
    }
    tx.commit()
}

pub fn is_empty(conn: &Connection) -> rusqlite::Result<bool> {
    let any: Option<i64> = conn.query_row("SELECT 1 FROM lists LIMIT 1", [], |r| r.get(0)).optional()?;
    Ok(any.is_none())
}

pub fn seed(conn: &mut Connection, lists: &[List], tasks: &[Task]) -> rusqlite::Result<()> {
    if !is_empty(conn)? {
        return Ok(());
    }
    let tx = conn.transaction()?;
    for l in lists {
        tx.execute(
            "INSERT INTO lists (id, name, color, position, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![l.id, l.name, l.color, l.position, l.created_at],
        )?;
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
        migrate(&conn).unwrap();
        conn
    }

    fn task(id: &str, pos: i64) -> Task {
        Task {
            id: id.into(),
            list_id: "l".into(),
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
        migrate(&conn).unwrap(); // idempotent
        let list = List { id: "l".into(), name: "L".into(), color: "#ffffff".into(), position: 0, created_at: 1 };
        seed(&mut conn, &[list], &[task("1", 0), task("2", 1)]).unwrap();
        assert!(!is_empty(&conn).unwrap());

        let mut t = task("3", 2);
        t.title = "বাংলা".into();
        save_task(&mut conn, &t).unwrap();
        t.tags = vec!["c".into()];
        t.completed_at = Some(5);
        save_task(&mut conn, &t).unwrap();

        reorder_tasks(&mut conn, "l", &["3".into(), "1".into(), "2".into()]).unwrap();
        let tasks = list_tasks(&conn).unwrap();
        assert_eq!(tasks.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(), vec!["3", "1", "2"]);
        assert_eq!(tasks[0].title, "বাংলা");
        assert_eq!(tasks[0].tags, vec!["c".to_string()]);
        assert_eq!(tasks[0].completed_at, Some(5));
        assert_eq!(tasks[1].tags, vec!["a".to_string(), "b".to_string()]);

        delete_task(&conn, "1").unwrap();
        assert_eq!(list_tasks(&conn).unwrap().len(), 2);
        delete_list(&conn, "l").unwrap();
        assert_eq!(list_tasks(&conn).unwrap().len(), 0);
    }
}
