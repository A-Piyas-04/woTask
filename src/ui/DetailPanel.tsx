import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { PRIORITY_LABELS, type Priority, type Task } from '../contracts/task';
import { MOTION } from '../contracts/tokens';
import { indexById, isLocked, isOutOfOrder, linkCandidates, useStore, visibleSpaces } from '../state/store';
import { fromDateInput, toDateInput } from './dates';
import { useExitTransition, type PanelState } from './useExitTransition';
import { PriorityRail } from './TaskMeta';

/**
 * Brief inline confirmation that a commit-on-blur edit landed.
 *
 * Without it, typing into a field and clicking away gives no sign anything happened, which reads as
 * the edit having been lost.
 */
function useSavedAck(): [boolean, () => void] {
  const [saved, setSaved] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [
    saved,
    () => {
      window.clearTimeout(timer.current);
      setSaved(true);
      timer.current = window.setTimeout(() => setSaved(false), MOTION.ui.ackMs);
    },
  ];
}

function Editor({ task, state }: { task: Task; state: PanelState }) {
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const toggleComplete = useStore((s) => s.toggleComplete);
  const linkTask = useStore((s) => s.linkTask);
  const select = useStore((s) => s.select);
  const close = useStore((s) => s.openEditor);
  const spaces = useStore(useShallow((s) => visibleSpaces(s.spaces)));
  const tasks = useStore((s) => s.tasks);
  // Derived outside the selector on purpose: `linkCandidates` and the successor filter build new
  // arrays every call, and a selector that never returns a shallow-equal result re-renders forever.
  const chain = useMemo(() => {
    const byId = indexById(tasks);
    return {
      locked: isLocked(task, byId),
      outOfOrder: isOutOfOrder(task, byId),
      blocker: task.blockedBy === null ? undefined : byId.get(task.blockedBy),
      candidates: linkCandidates(tasks, task.id),
      successors: tasks.filter((t) => t.blockedBy === task.id),
    };
  }, [tasks, task]);

  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [tags, setTags] = useState(task.tags.join(', '));
  const titleRef = useRef<HTMLInputElement>(null);
  const [saved, ack] = useSavedAck();

  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.select();
  }, [task.id]);

  const commitTitle = () => {
    const t = title.trim();
    if (t && t !== task.title) {
      void updateTask(task.id, { title: t });
      ack();
    } else setTitle(task.title);
  };
  const commitNotes = () => {
    if (notes !== task.notes) {
      void updateTask(task.id, { notes });
      ack();
    }
  };
  const commitTags = () => {
    const next = [...new Set(tags.split(/[,\s]+/).map((t) => t.replace(/^#/, '').trim()).filter(Boolean))].slice(0, 20);
    if (next.join(',') !== task.tags.join(',')) {
      void updateTask(task.id, { tags: next });
      ack();
    }
    setTags(next.join(', '));
  };

  return (
    <aside className="detail-panel" aria-label="Task details" data-state={state}>
      <div className="detail-header">
        <span>Task details</span>
        <span className={`save-ack${saved ? ' is-on' : ''}`} aria-live="polite">
          {saved ? 'Saved' : ''}
        </span>
        <button className="icon-btn" onClick={() => close(null)} aria-label="Close details" title="Close (Esc)">
          ×
        </button>
      </div>

      {chain.locked && !chain.outOfOrder && chain.blocker && (
        <div className="detail-banner" role="note">
          <span>
            Blocked by{' '}
            <button className="link-btn" onClick={() => select(chain.blocker!.id)} lang="bn-BD en">
              {chain.blocker.title}
            </button>
          </span>
          <span className="detail-banner-note">Finish that first, or complete this one anyway.</span>
        </div>
      )}
      {chain.outOfOrder && chain.blocker && (
        <div className="detail-banner is-warn" role="note">
          <span lang="bn-BD en">Completed out of order — “{chain.blocker.title}” is still open.</span>
        </div>
      )}

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
        <span>
          Priority <PriorityRail value={task.priority} />
        </span>
        <div className="segmented" role="radiogroup" aria-label="Priority">
          {([0, 1, 2, 3] as Priority[]).map((p) => (
            <button
              key={p}
              role="radio"
              aria-checked={task.priority === p}
              className={task.priority === p ? 'is-on' : ''}
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
          <span>Space</span>
          <select value={task.spaceId} onChange={(e) => void updateTask(task.id, { spaceId: e.target.value })}>
            {spaces.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span>Comes after</span>
        <select value={task.blockedBy ?? ''} onChange={(e) => void linkTask(task.id, e.target.value || null)}>
          <option value="">— nothing, start anytime —</option>
          {chain.candidates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </label>

      {chain.successors.length > 0 && (
        <div className="field">
          <span>Unlocks</span>
          <ul className="chain-list">
            {chain.successors.map((t) => (
              <li key={t.id}>
                <button className="link-btn" onClick={() => select(t.id)} lang="bn-BD en">
                  {t.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <label className="field">
        <span>Tags</span>
        <input value={tags} onChange={(e) => setTags(e.target.value)} onBlur={commitTags} placeholder="work, urgent" lang="bn-BD en" />
      </label>

      <label className="field field-grow">
        <span>Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={commitNotes} placeholder="Add notes…" lang="bn-BD en" />
      </label>

      <div className="detail-actions">
        <button className="btn btn-primary" onClick={() => void toggleComplete(task.id)}>
          {task.completedAt === null ? '✓ Mark complete' : '↺ Reopen'}
        </button>
        <button className="btn btn-danger" onClick={() => void deleteTask(task.id)} title="Undo with Ctrl+Z">
          Delete
        </button>
      </div>
      <div className="detail-meta">Created {new Date(task.createdAt).toLocaleString()}</div>
    </aside>
  );
}

export function DetailPanel() {
  const open = useStore((s) => (s.editingId ? s.tasks.find((t) => t.id === s.editingId) : undefined));
  const { value: task, state } = useExitTransition(open);
  if (!task) return null;
  return <Editor key={task.id} task={task} state={state} />;
}
