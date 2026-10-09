import { useRef } from 'react';
import type { Region } from '../contracts/task';
import { nextColorIndex, useStore } from '../state/store';
import { RegionForm, type RegionDraft } from './RegionForm';

const toDraft = (g: Region): RegionDraft => ({
  name: g.name,
  kind: g.kind,
  description: g.description ?? '',
  colorIndex: g.colorIndex,
  targetDate: g.targetDate,
});

function EditRegion({ region }: { region: Region }) {
  const updateRegion = useStore((s) => s.updateRegion);
  const archiveRegion = useStore((s) => s.archiveRegion);
  const deleteRegion = useStore((s) => s.deleteRegion);
  const close = useStore((s) => s.openRegionEditor);
  const notice = useStore((s) => (s.regionNotice?.regionId === region.id ? s.regionNotice.message : null));
  const saveTimer = useRef<number | undefined>(undefined);

  const save = (d: RegionDraft) => {
    if (!d.name.trim()) return;
    void updateRegion(region.id, {
      name: d.name,
      kind: d.kind,
      description: d.description.trim() || null,
      colorIndex: d.colorIndex,
      targetDate: d.targetDate,
    });
  };

  return (
    <aside className="detail-panel" aria-label="Region settings">
      <div className="detail-header">
        <span>Region</span>
        <button className="icon-btn" onClick={() => close(null)} aria-label="Close region settings" title="Close (Esc)">
          ×
        </button>
      </div>
      <RegionForm
        initial={toDraft(region)}
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
        <button className="btn" onClick={() => void archiveRegion(region.id)}>
          Archive
        </button>
        <button className="btn btn-danger" onClick={() => void deleteRegion(region.id)}>
          Delete region
        </button>
      </div>
      <div className="detail-meta">Archiving hides the region but keeps its tasks. Deleting removes its tasks too (Ctrl+Z undoes).</div>
    </aside>
  );
}

function CreateRegion() {
  const createRegion = useStore((s) => s.createRegion);
  const setCreating = useStore((s) => s.setCreatingRegion);
  const regions = useStore((s) => s.regions);
  return (
    <aside className="detail-panel" aria-label="New region">
      <div className="detail-header">
        <span>New region</span>
        <button className="icon-btn" onClick={() => setCreating(false)} aria-label="Cancel" title="Cancel (Esc)">
          ×
        </button>
      </div>
      <RegionForm
        autoFocus
        initial={{ name: '', kind: 'category', description: '', colorIndex: nextColorIndex(regions), targetDate: null }}
        submitLabel="Create region"
        onSubmit={(d) => {
          void createRegion({ ...d, description: d.description || null }).then(() => setCreating(false));
        }}
      />
    </aside>
  );
}

export function RegionPanel() {
  const creating = useStore((s) => s.creatingRegion);
  const region = useStore((s) => (s.editingRegionId ? s.regions.find((g) => g.id === s.editingRegionId) : undefined));
  if (creating) return <CreateRegion />;
  if (!region) return null;
  return <EditRegion key={region.id} region={region} />;
}
