import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useStore } from '../state/store';
import { NEW_LIST_EVENT } from './shortcuts';

export function Sidebar() {
  const lists = useStore((s) => s.lists);
  const tasks = useStore((s) => s.tasks);
  const activeListId = useStore((s) => s.activeListId);
  const setActiveList = useStore((s) => s.setActiveList);
  const createList = useStore((s) => s.createList);
  const renameList = useStore((s) => s.renameList);
  const deleteList = useStore((s) => s.deleteList);
  const showCompleted = useStore((s) => s.showCompleted);
  const toggleShowCompleted = useStore((s) => s.toggleShowCompleted);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const newRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onNew = () => setCreating(true);
    window.addEventListener(NEW_LIST_EVENT, onNew);
    return () => window.removeEventListener(NEW_LIST_EVENT, onNew);
  }, []);
  useEffect(() => {
    if (creating) newRef.current?.focus();
  }, [creating]);

  const counts = new Map<string, number>();
  for (const t of tasks) if (t.completedAt === null) counts.set(t.listId, (counts.get(t.listId) ?? 0) + 1);

  const submitNew = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      void createList(newName);
      setNewName('');
      setCreating(false);
    } else if (e.key === 'Escape') {
      setNewName('');
      setCreating(false);
    }
  };

  const submitRename = (e: KeyboardEvent<HTMLInputElement>, id: string) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      void renameList(id, renameValue);
      setRenamingId(null);
    } else if (e.key === 'Escape') {
      setRenamingId(null);
    }
  };

  return (
    <nav className="sidebar" aria-label="Lists">
      <div className="sidebar-heading">Lists</div>
      <ul className="list-nav">
        {lists.map((l, i) => (
          <li key={l.id}>
            {renamingId === l.id ? (
              <input
                className="list-rename"
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => submitRename(e, l.id)}
                onBlur={() => setRenamingId(null)}
                maxLength={80}
                aria-label="Rename list"
              />
            ) : (
              <button
                className={`list-item${l.id === activeListId ? ' is-active' : ''}`}
                onClick={() => setActiveList(l.id)}
                onDoubleClick={() => {
                  setRenamingId(l.id);
                  setRenameValue(l.name);
                }}
                title={i < 9 ? `Ctrl+${i + 1} · double-click to rename` : 'Double-click to rename'}
                aria-current={l.id === activeListId ? 'page' : undefined}
              >
                <span className="list-dot" style={{ background: l.color, boxShadow: `0 0 10px ${l.color}` }} />
                <span className="list-name">{l.name}</span>
                <span className="list-count">{counts.get(l.id) ?? 0}</span>
              </button>
            )}
            {lists.length > 1 && renamingId !== l.id && (
              <button className="list-delete" onClick={() => void deleteList(l.id)} aria-label={`Delete list ${l.name}`} title="Delete list">
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {creating ? (
        <input
          ref={newRef}
          className="list-rename"
          placeholder="List name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={submitNew}
          onBlur={() => setCreating(false)}
          maxLength={80}
          aria-label="New list name"
        />
      ) : (
        <button className="list-add" onClick={() => setCreating(true)} title="Ctrl+Shift+N">
          + New list
        </button>
      )}

      <div className="sidebar-footer">
        <label className="toggle">
          <input type="checkbox" checked={showCompleted} onChange={toggleShowCompleted} />
          <span>Show completed</span>
          <kbd>H</kbd>
        </label>
      </div>
    </nav>
  );
}
