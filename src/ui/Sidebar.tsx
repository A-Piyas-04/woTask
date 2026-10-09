import { Fragment, useEffect, useMemo, useState } from 'react';
import { SPACE_KIND_PLURALS } from '../contracts/task';
import { spaceHue } from '../contracts/tokens';
import { useStore, visibleSpaces } from '../state/store';
import { NEW_SPACE_EVENT } from './shortcuts';

export function Sidebar() {
  const spaces = useStore((s) => s.spaces);
  const tasks = useStore((s) => s.tasks);
  const activeSpaceId = useStore((s) => s.activeSpaceId);
  const setActiveSpace = useStore((s) => s.setActiveSpace);
  const openSpaceEditor = useStore((s) => s.openSpaceEditor);
  const setCreatingSpace = useStore((s) => s.setCreatingSpace);
  const requestDeleteSpace = useStore((s) => s.requestDeleteSpace);
  const unarchiveSpace = useStore((s) => s.unarchiveSpace);
  const notice = useStore((s) => s.spaceNotice);
  const showCompleted = useStore((s) => s.showCompleted);
  const toggleShowCompleted = useStore((s) => s.toggleShowCompleted);
  const [archiveOpen, setArchiveOpen] = useState(false);

  useEffect(() => {
    const onNew = () => setCreatingSpace(true);
    window.addEventListener(NEW_SPACE_EVENT, onNew);
    return () => window.removeEventListener(NEW_SPACE_EVENT, onNew);
  }, [setCreatingSpace]);

  const shown = useMemo(() => visibleSpaces(spaces), [spaces]);
  const archived = useMemo(() => spaces.filter((g) => g.archivedAt !== null), [spaces]);
  const grouped = new Set(shown.map((g) => g.kind)).size > 1;

  const counts = new Map<string, number>();
  for (const t of tasks) if (t.completedAt === null) counts.set(t.spaceId, (counts.get(t.spaceId) ?? 0) + 1);

  return (
    <nav className="sidebar" aria-label="Spaces">
      <div className="sidebar-heading">Spaces</div>
      <ul className="space-nav">
        {shown.map((g, i) => (
          <Fragment key={g.id}>
            {grouped && (i === 0 || shown[i - 1].kind !== g.kind) && (
              <li className="space-group" aria-hidden="true">
                {SPACE_KIND_PLURALS[g.kind]}
              </li>
            )}
            <li className="space-row-wrap" style={{ ['--row-index' as string]: String(i) }}>
              <button
                className={`space-row${g.id === activeSpaceId ? ' is-active' : ''}`}
                style={{ ['--space' as string]: spaceHue(g.colorIndex) }}
                onClick={() => setActiveSpace(g.id)}
                onDoubleClick={() => openSpaceEditor(g.id)}
                title={i < 9 ? `Ctrl+${i + 1} · double-click for settings` : 'Double-click for settings'}
                aria-current={g.id === activeSpaceId ? 'page' : undefined}
              >
                <span className="space-dot" data-kind={g.kind} />
                <span className="space-name" lang="bn-BD en">
                  {g.name}
                </span>
                <span className="space-count">{counts.get(g.id) ?? 0}</span>
              </button>
              <span className="space-actions">
                <button className="space-action" onClick={() => openSpaceEditor(g.id)} aria-label={`Settings for ${g.name}`} title="Space settings">
                  ⋯
                </button>
                <button
                  className="space-action is-danger"
                  onClick={() => requestDeleteSpace(g.id)}
                  aria-label={`Delete space ${g.name}`}
                  title="Delete space"
                >
                  ×
                </button>
              </span>
              {notice?.spaceId === g.id && (
                <p className="inline-notice" role="alert">
                  {notice.message}
                </p>
              )}
            </li>
          </Fragment>
        ))}
      </ul>
      <button className="space-add" onClick={() => setCreatingSpace(true)} title="Ctrl+Shift+N">
        + New space
      </button>

      {archived.length > 0 && (
        <div className="space-archive">
          <button className="space-archive-toggle" onClick={() => setArchiveOpen(!archiveOpen)} aria-expanded={archiveOpen}>
            {archiveOpen ? '▾' : '▸'} Archived ({archived.length})
          </button>
          {archiveOpen && (
            <ul className="space-nav">
              {archived.map((g) => (
                <li key={g.id} className="space-row-wrap">
                  <div className="space-row is-archived" style={{ ['--space' as string]: spaceHue(g.colorIndex) }}>
                    <span className="space-dot" data-kind={g.kind} />
                    <span className="space-name" lang="bn-BD en">
                      {g.name}
                    </span>
                    <button className="space-restore" onClick={() => void unarchiveSpace(g.id)}>
                      Restore
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
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
