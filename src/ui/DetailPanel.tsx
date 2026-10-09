import { useEffect, useRef, useState } from 'react';
import { PRIORITY_LABELS, type Priority, type Task } from '../contracts/task';
import { PALETTE } from '../contracts/tokens';
import { useStore } from '../state/store';

const toDateInput = (ms: number | null): string => {
  if (ms === null) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const fromDateInput = (v: string): number | null => {
  if (!v) return null;
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
};

function Editor({ task }: { task: Task }) {
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const toggleComplete = useStore((s) => s.toggleComplete);
  const close = useStore((s) => s.openEditor);
  const lists = useStore((s) => s.lists);

  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [tags, setTags] = useState(task.tags.join(', '));
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.select();
  }, [task.id]);

  const commitTitle = () => {
    const t = title.trim();
    if (t && t !== task.title) void updateTask(task.id, { title: t });
    else setTitle(task.title);
  };
  const commitNotes = () => {
    if (notes !== task.notes) void updateTask(task.id, { notes });
  };
  const commitTags = () => {
    const next = [...new Set(tags.split(/[,\s]+/).map((t) => t.replace(/^#/, '').trim()).filter(Boolean))].slice(0, 20);
    if (next.join(',') !== task.tags.join(',')) void updateTask(task.id, { tags: next });
    setTags(next.join(', '));
  };

  return (
    <aside className="detail-panel" aria-label="Task details">
      <div className="detail-header">
        <span>Task details</span>
        <button className="icon-btn" onClick={() => close(null)} aria-label="Close details" title="Close (Esc)">
          ×
        </button>
      </div>

      <label className="field">
        <span>Title</span>
        <input
          ref={titleRef}
          value={title}
          maxLength={500}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault();
              commitTitle();
            }
          }}
          lang="bn-BD en"
        />
      </label>

      <div className="field">
        <span>Priority</span>
        <div className="segmented" role="radiogroup" aria-label="Priority">
          {([0, 1, 2, 3] as Priority[]).map((p) => (
            <button
              key={p}
              role="radio"
              aria-checked={task.priority === p}
              className={task.priority === p ? 'is-on' : ''}
              style={{ ['--seg-color' as string]: PALETTE.priority[p] }}
              onClick={() => void updateTask(task.id, { priority: p })}
            >
              {PRIORITY_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Due date</span>
          <input type="date" value={toDateInput(task.dueAt)} onChange={(e) => void updateTask(task.id, { dueAt: fromDateInput(e.target.value) })} />
        </label>
        <label className="field">
          <span>List</span>
          <select value={task.listId} onChange={(e) => void updateTask(task.id, { listId: e.target.value })}>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span>Tags</span>
        <input value={tags} onChange={(e) => setTags(e.target.value)} onBlur={commitTags} placeholder="work, urgent" lang="bn-BD en" />
      </label>

      <label className="field field-grow">
        <span>Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={commitNotes} placeholder="Add notes…" lang="bn-BD en" />
      </label>

      <div className="detail-actions">
        <button className="btn" onClick={() => void toggleComplete(task.id)}>
          {task.completedAt === null ? '✓ Mark complete' : '↺ Reopen'}
        </button>
        <button className="btn btn-danger" onClick={() => void deleteTask(task.id)}>
          Delete
        </button>
      </div>
      <div className="detail-meta">Created {new Date(task.createdAt).toLocaleString()}</div>
    </aside>
  );
}

export function DetailPanel() {
  const task = useStore((s) => (s.editingId ? s.tasks.find((t) => t.id === s.editingId) : undefined));
  if (!task) return null;
  return <Editor key={task.id} task={task} />;
}
