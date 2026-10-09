import { Fragment, useEffect, useMemo, useState } from 'react';
import { REGION_KIND_LABELS } from '../contracts/task';
import { regionHue } from '../contracts/tokens';
import { useStore, visibleRegions } from '../state/store';
import { NEW_REGION_EVENT } from './shortcuts';

export function Sidebar() {
  const regions = useStore((s) => s.regions);
  const tasks = useStore((s) => s.tasks);
  const activeRegionId = useStore((s) => s.activeRegionId);
  const setActiveRegion = useStore((s) => s.setActiveRegion);
  const openRegionEditor = useStore((s) => s.openRegionEditor);
  const setCreatingRegion = useStore((s) => s.setCreatingRegion);
  const deleteRegion = useStore((s) => s.deleteRegion);
  const unarchiveRegion = useStore((s) => s.unarchiveRegion);
  const notice = useStore((s) => s.regionNotice);
  const showCompleted = useStore((s) => s.showCompleted);
  const toggleShowCompleted = useStore((s) => s.toggleShowCompleted);
  const [archiveOpen, setArchiveOpen] = useState(false);

  useEffect(() => {
    const onNew = () => setCreatingRegion(true);
    window.addEventListener(NEW_REGION_EVENT, onNew);
    return () => window.removeEventListener(NEW_REGION_EVENT, onNew);
  }, [setCreatingRegion]);

  const shown = useMemo(() => visibleRegions(regions), [regions]);
  const archived = useMemo(() => regions.filter((g) => g.archivedAt !== null), [regions]);
  const grouped = new Set(shown.map((g) => g.kind)).size > 1;

  const counts = new Map<string, number>();
  for (const t of tasks) if (t.completedAt === null) counts.set(t.regionId, (counts.get(t.regionId) ?? 0) + 1);

  return (
    <nav className="sidebar" aria-label="Regions">
      <div className="sidebar-heading">Regions</div>
      <ul className="region-nav">
        {shown.map((g, i) => (
          <Fragment key={g.id}>
            {grouped && (i === 0 || shown[i - 1].kind !== g.kind) && (
              <li className="region-group" aria-hidden="true">
                {REGION_KIND_LABELS[g.kind]}s
              </li>
            )}
            <li className="region-row-wrap">
              <button
                className={`region-row${g.id === activeRegionId ? ' is-active' : ''}`}
                style={{ ['--region' as string]: regionHue(g.colorIndex) }}
                onClick={() => setActiveRegion(g.id)}
                onDoubleClick={() => openRegionEditor(g.id)}
                title={i < 9 ? `Ctrl+${i + 1} · double-click for settings` : 'Double-click for settings'}
                aria-current={g.id === activeRegionId ? 'page' : undefined}
              >
                <span className="region-dot" />
                <span className="region-name" lang="bn-BD en">
                  {g.name}
                </span>
                <span className="region-count">{counts.get(g.id) ?? 0}</span>
              </button>
              <span className="region-actions">
                <button className="region-action" onClick={() => openRegionEditor(g.id)} aria-label={`Settings for ${g.name}`} title="Region settings">
                  ⋯
                </button>
                <button className="region-action" onClick={() => void deleteRegion(g.id)} aria-label={`Delete region ${g.name}`} title="Delete region">
                  ×
                </button>
              </span>
              {notice?.regionId === g.id && (
                <p className="inline-notice" role="alert">
                  {notice.message}
                </p>
              )}
            </li>
          </Fragment>
        ))}
      </ul>
      <button className="region-add" onClick={() => setCreatingRegion(true)} title="Ctrl+Shift+N">
        + New region
      </button>

      {archived.length > 0 && (
        <div className="region-archive">
          <button className="region-archive-toggle" onClick={() => setArchiveOpen(!archiveOpen)} aria-expanded={archiveOpen}>
            {archiveOpen ? '▾' : '▸'} Archived ({archived.length})
          </button>
          {archiveOpen && (
            <ul className="region-nav">
              {archived.map((g) => (
                <li key={g.id} className="region-row-wrap">
                  <div className="region-row is-archived" style={{ ['--region' as string]: regionHue(g.colorIndex) }}>
                    <span className="region-dot" />
                    <span className="region-name" lang="bn-BD en">
                      {g.name}
                    </span>
                    <button className="region-restore" onClick={() => void unarchiveRegion(g.id)}>
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
