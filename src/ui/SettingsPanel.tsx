import { COMMANDS, type QualityTier } from '../contracts/events';
import { useStore } from '../state/store';

const TIERS: { id: QualityTier; label: string; hint: string }[] = [
  { id: 'high', label: 'High', hint: 'Bloom, ambient occlusion, chromatic aberration' },
  { id: 'medium', label: 'Medium', hint: 'Bloom and anti-aliasing' },
  { id: 'low', label: 'Low', hint: 'No post-processing; best for integrated graphics' },
];

export function SettingsPanel() {
  const open = useStore((s) => s.settingsOpen);
  const setOpen = useStore((s) => s.setSettingsOpen);
  const quality = useStore((s) => s.quality);
  const setQuality = useStore((s) => s.setQuality);
  const dataPath = useStore((s) => s.dataPath);
  const showCompleted = useStore((s) => s.showCompleted);
  const toggleShowCompleted = useStore((s) => s.toggleShowCompleted);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="settings" role="dialog" aria-label="Settings" onMouseDown={(e) => e.stopPropagation()}>
        <div className="detail-header">
          <span>Settings</span>
          <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close settings" autoFocus>
            ×
          </button>
        </div>

        <section>
          <h3>Graphics quality</h3>
          <div className="tier-list" role="radiogroup" aria-label="Graphics quality">
            {TIERS.map((t) => (
              <label key={t.id} className={`tier${quality === t.id ? ' is-on' : ''}`}>
                <input type="radio" name="quality" checked={quality === t.id} onChange={() => setQuality(t.id)} />
                <strong>{t.label}</strong>
                <span>{t.hint}</span>
              </label>
            ))}
          </div>
        </section>

        <section>
          <h3>View</h3>
          <label className="toggle">
            <input type="checkbox" checked={showCompleted} onChange={toggleShowCompleted} />
            <span>Show completed tasks</span>
          </label>
        </section>

        <section>
          <h3>Data location</h3>
          <code className="data-path">{dataPath}</code>
          <p className="muted">Everything is stored locally in a SQLite file. Nothing leaves this computer.</p>
        </section>

        <section>
          <h3>Keyboard shortcuts</h3>
          <ul className="shortcut-list">
            {COMMANDS.filter((c) => c.shortcut).map((c) => (
              <li key={c.id}>
                <span>{c.title}</span>
                <kbd>{c.shortcut}</kbd>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
