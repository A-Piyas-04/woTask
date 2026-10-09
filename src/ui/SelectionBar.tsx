import { useShallow } from 'zustand/react/shallow';
import { indexById, isLocked, isOutOfOrder, useStore } from '../state/store';
import { DueChip, KindMark, PriorityRail } from './TaskMeta';

/**
 * What is selected, and what you can do to it, in the DOM.
 *
 * The selection used to live only in WebGL. If the chosen orb was off-screen or its label had been
 * culled, Space, Delete and P all acted on something the user could not see - and Delete is an
 * unmodified key. This strip is the answer to "what am I about to act on", and it is also where
 * completing a task now lives: clicking an orb only ever selects it.
 */
export function SelectionBar() {
  const { task, space, locked, outOfOrder, blocker } = useStore(
    useShallow((s) => {
      const task = s.selectedId ? s.tasks.find((t) => t.id === s.selectedId) : undefined;
      if (!task) return { task: undefined, space: undefined, locked: false, outOfOrder: false, blocker: undefined };
      const byId = indexById(s.tasks);
      return {
        task,
        space: s.spaces.find((g) => g.id === task.spaceId),
        locked: isLocked(task, byId),
        outOfOrder: isOutOfOrder(task, byId),
        blocker: task.blockedBy === null ? undefined : byId.get(task.blockedBy),
      };
    }),
  );
  const toggleComplete = useStore((s) => s.toggleComplete);
  const openEditor = useStore((s) => s.openEditor);
  const deleteTask = useStore((s) => s.deleteTask);
  const select = useStore((s) => s.select);

  if (!task) return null;
  const done = task.completedAt !== null;

  return (
    <div className="selection-bar" role="status" aria-live="polite">
      <button
        className="sel-check"
        onClick={() => void toggleComplete(task.id)}
        aria-pressed={done}
        title={done ? 'Reopen (Space)' : locked ? 'Blocked — completing needs a confirmation' : 'Complete (Space)'}
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        data-locked={locked || undefined}
      >
        {done ? '↺' : '✓'}
      </button>

      <PriorityRail value={task.priority} />

      <button className={`sel-title${done ? ' is-done' : ''}`} onClick={() => openEditor(task.id)} title="Open details (Enter)" lang="bn-BD en">
        {task.title}
      </button>

      <div className="sel-meta">
        {locked && !done && blocker && (
          <button className="sel-blocked" onClick={() => select(blocker.id)} title={`Go to “${blocker.title}”`} lang="bn-BD en">
            Blocked by {blocker.title}
          </button>
        )}
        {outOfOrder && blocker && <span className="sel-warn">Completed out of order</span>}
        <DueChip dueAt={task.dueAt} completed={done} />
        {space && (
          <span className="sel-space">
            <KindMark space={space} />
            {space.name}
          </span>
        )}
      </div>

      <button className="sel-action" onClick={() => openEditor(task.id)} title="Open details (Enter)" aria-label="Open details">
        Details
      </button>
      <button className="sel-action is-danger" onClick={() => void deleteTask(task.id)} title="Delete (Del) — undo with Ctrl+Z" aria-label="Delete task">
        Delete
      </button>
    </div>
  );
}
