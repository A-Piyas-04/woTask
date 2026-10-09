import { Fragment } from 'react';
import { COMMANDS, type CommandGroup } from '../contracts/events';
import { useStore } from '../state/store';

const GROUPS: CommandGroup[] = ['Navigation', 'Tasks', 'Spaces', 'View'];

/** Pointer gestures are not commands, so they are listed here rather than in `COMMANDS`. */
const GESTURES: Record<CommandGroup, [keys: string, title: string][]> = {
  Navigation: [
    ['Drag', 'Explore space'],
    ['Scroll', 'Zoom'],
    ['Shift+Scroll', 'Pan sideways'],
  ],
  Tasks: [
    ['Click', 'Select a sphere'],
    ['✓ on the label', 'Complete / reopen'],
    ['Double-click', 'Edit details'],
  ],
  Spaces: [
    ['Ctrl+1…9', 'Jump to space'],
    ['Click hub', 'Make space active'],
  ],
  View: [],
};

function Keys({ combo }: { combo: string }) {
  const parts = combo.split('+');
  return (
    <span className="keys">
      {parts.map((k, i) => (
        <Fragment key={`${k}-${i}`}>
          {i > 0 && <span className="keys-plus">+</span>}
          <kbd>{k}</kbd>
        </Fragment>
      ))}
    </span>
  );
}

export function ShortcutsOverlay() {
  const open = useStore((s) => s.shortcutsOpen);
  const setOpen = useStore((s) => s.setShortcutsOpen);
  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="shortcuts" role="dialog" aria-label="Keyboard shortcuts" onMouseDown={(e) => e.stopPropagation()}>
        <div className="shortcuts-header">
          <span>Keyboard shortcuts</span>
          <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close shortcuts" autoFocus>
            ×
          </button>
        </div>
        <div className="shortcuts-grid">
          {GROUPS.map((group) => (
            <section key={group} className="shortcuts-group">
              <h3>{group}</h3>
              <dl>
                {COMMANDS.filter((c) => c.group === group && c.shortcut).map((c) => (
                  <div key={c.id} className="shortcut-row">
                    <dt>{c.title}</dt>
                    <dd>
                      <Keys combo={c.shortcut ?? ''} />
                    </dd>
                  </div>
                ))}
                {GESTURES[group].map(([keys, title]) => (
                  <div key={title} className="shortcut-row">
                    <dt>{title}</dt>
                    <dd>
                      <Keys combo={keys} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
