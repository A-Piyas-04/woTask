import { useRef } from 'react';
import { useExitTransition, type PanelState } from './useExitTransition';
import type { Space } from '../contracts/task';
import { nextColorIndex, useStore } from '../state/store';
import { SpaceForm, type SpaceDraft } from './SpaceForm';

const toDraft = (g: Space): SpaceDraft => ({
  name: g.name,
  kind: g.kind,
  description: g.description ?? '',
  colorIndex: g.colorIndex,
  targetDate: g.targetDate,
});

function EditSpace({ space, state }: { space: Space; state: PanelState }) {
  const updateSpace = useStore((s) => s.updateSpace);
  const archiveSpace = useStore((s) => s.archiveSpace);
  const requestDeleteSpace = useStore((s) => s.requestDeleteSpace);
  const close = useStore((s) => s.openSpaceEditor);
  const notice = useStore((s) => (s.spaceNotice?.spaceId === space.id ? s.spaceNotice.message : null));
  const saveTimer = useRef<number | undefined>(undefined);

  const save = (d: SpaceDraft) => {
    if (!d.name.trim()) return;
    void updateSpace(space.id, {
      name: d.name,
      kind: d.kind,
      description: d.description.trim() || null,
      colorIndex: d.colorIndex,
      targetDate: d.targetDate,
    });
  };

  return (
    <aside className="detail-panel" aria-label="Space settings" data-state={state}>
      <div className="detail-header">
        <span>Space</span>
        <button className="icon-btn" onClick={() => close(null)} aria-label="Close space settings" title="Close (Esc)">
          ×
        </button>
      </div>
      <SpaceForm
        initial={toDraft(space)}
        submitLabel="Done"
        onChange={(d) => {
          window.clearTimeout(saveTimer.current);
          saveTimer.current = window.setTimeout(() => save(d), 300);
        }}
        onSubmit={(d) => {
          window.clearTimeout(saveTimer.current);
          save(d);
          close(null);
        }}
      />
      {notice && (
        <p className="inline-notice" role="alert">
          {notice}
        </p>
      )}
      <div className="detail-actions">
        <button className="btn" onClick={() => void archiveSpace(space.id)}>
          Archive
        </button>
        <button className="btn btn-danger" onClick={() => requestDeleteSpace(space.id)}>
          Delete space
        </button>
      </div>
      <div className="detail-meta">Archiving hides the space but keeps its tasks. Deleting removes its tasks too (Ctrl+Z undoes).</div>
    </aside>
  );
}

function CreateSpace({ state }: { state: PanelState }) {
  const createSpace = useStore((s) => s.createSpace);
  const setCreating = useStore((s) => s.setCreatingSpace);
  const spaces = useStore((s) => s.spaces);
  return (
    <aside className="detail-panel" aria-label="New space" data-state={state}>
      <div className="detail-header">
        <span>New space</span>
        <button className="icon-btn" onClick={() => setCreating(false)} aria-label="Cancel" title="Cancel (Esc)">
          ×
        </button>
      </div>
      <SpaceForm
        autoFocus
        initial={{ name: '', kind: 'category', description: '', colorIndex: nextColorIndex(spaces), targetDate: null }}
        submitLabel="Create space"
        onSubmit={(d) => {
          void createSpace({ ...d, description: d.description || null }).then(() => setCreating(false));
        }}
      />
    </aside>
  );
}

export function SpacePanel() {
  const creating = useStore((s) => s.creatingSpace);
  const openSpace = useStore((s) => (s.editingSpaceId ? s.spaces.find((g) => g.id === s.editingSpaceId) : undefined));
  const create = useExitTransition(creating || undefined);
  const edit = useExitTransition(openSpace);
  if (create.value) return <CreateSpace state={create.state} />;
  if (!edit.value) return null;
  return <EditSpace key={edit.value.id} space={edit.value} state={edit.state} />;
}
