import { useRef } from 'react';
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

function EditSpace({ space }: { space: Space }) {
  const updateSpace = useStore((s) => s.updateSpace);
  const archiveSpace = useStore((s) => s.archiveSpace);
  const deleteSpace = useStore((s) => s.deleteSpace);
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
    <aside className="detail-panel" aria-label="Space settings">
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
        <button className="btn btn-danger" onClick={() => void deleteSpace(space.id)}>
          Delete space
        </button>
      </div>
      <div className="detail-meta">Archiving hides the space but keeps its tasks. Deleting removes its tasks too (Ctrl+Z undoes).</div>
    </aside>
  );
}

function CreateSpace() {
  const createSpace = useStore((s) => s.createSpace);
  const setCreating = useStore((s) => s.setCreatingSpace);
  const spaces = useStore((s) => s.spaces);
  return (
    <aside className="detail-panel" aria-label="New space">
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
  const space = useStore((s) => (s.editingSpaceId ? s.spaces.find((g) => g.id === s.editingSpaceId) : undefined));
  if (creating) return <CreateSpace />;
  if (!space) return null;
  return <EditSpace key={space.id} space={space} />;
}
