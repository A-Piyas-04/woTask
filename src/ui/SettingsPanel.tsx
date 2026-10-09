import type { QualityTier } from '../contracts/events';
import { useStore } from '../state/store';

const TIERS: { id: QualityTier; label: string; hint: string }[] = [
  { id: 'high', label: 'High', hint: 'Bloom, subtle chromatic aberration, anti-aliasing' },
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
  const ambientMotion = useStore((s) => s.ambientMotion);
  const toggleAmbientMotion = useStore((s) => s.toggleAmbientMotion);
  const setShortcutsOpen = useStore((s) => s.setShortcutsOpen);

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
          <div className="tier-options" role="radiogroup" aria-label="Graphics quality">
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
          <label className="toggle">
            <input type="checkbox" checked={ambientMotion} onChange={toggleAmbientMotion} />
            <span>Ambient motion (floating spheres, drifting space). Pauses automatically when the window is in the background.</span>
          </label>
        </section>

        <section>
          <h3>Data location</h3>
          <code className="data-path">{dataPath}</code>
          <p className="muted">Everything is stored locally in a SQLite file. Nothing leaves this computer.</p>
        </section>

        <section>
          <h3>Keyboard shortcuts</h3>
          <button
            className="btn"
            onClick={() => {
              setOpen(false);
              setShortcutsOpen(true);
            }}
          >
            Show all shortcuts <kbd>?</kbd>
          </button>
        </section>
      </div>
    </div>
  );
}
