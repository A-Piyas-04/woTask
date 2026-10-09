import { windowControls } from '../data/repository';
import { useStore } from '../state/store';

export function TitleBar() {
  const regionName = useStore((s) => s.regions.find((g) => g.id === s.activeRegionId)?.name ?? '');
  const openSettings = useStore((s) => s.setSettingsOpen);
  const openPalette = useStore((s) => s.setPaletteOpen);

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-brand" data-tauri-drag-region>
        <span className="brand-mark" aria-hidden="true" />
        <span data-tauri-drag-region>woTask</span>
        {regionName && (
          <span className="titlebar-region" data-tauri-drag-region>
            / {regionName}
          </span>
        )}
      </div>
      <div className="titlebar-actions">
        <button className="tb-btn tb-search" onClick={() => openPalette(true)} title="Command palette (Ctrl+K)">
          <span>Search or run a command…</span>
          <kbd>Ctrl K</kbd>
        </button>
        <button className="tb-btn" onClick={() => openSettings(true)} title="Settings (Ctrl+,)" aria-label="Settings">
          ⚙
        </button>
      </div>
      <div className="window-controls">
        <button className="wc-btn" onClick={() => void windowControls.minimize()} aria-label="Minimise" title="Minimise">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button className="wc-btn" onClick={() => void windowControls.toggleMaximize()} aria-label="Maximise" title="Maximise">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button className="wc-btn wc-close" onClick={() => void windowControls.close()} aria-label="Close" title="Close">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
      </div>
    </header>
  );
}
