import { useState, type FormEvent } from 'react';
import { REGION_KIND_LABELS, type RegionKind } from '../contracts/task';
import { PALETTE } from '../contracts/tokens';
import { fromDateInput, toDateInput } from './dates';

export interface RegionDraft {
  name: string;
  kind: RegionKind;
  description: string;
  colorIndex: number;
  targetDate: number | null;
}

const KINDS: RegionKind[] = ['category', 'project', 'goal'];

interface Props {
  initial: RegionDraft;
  submitLabel: string;
  onSubmit(draft: RegionDraft): void;
  /** Called on every change, for forms that save live. */
  onChange?(draft: RegionDraft): void;
  autoFocus?: boolean;
}

/** Name, kind, colour, description and (for goals) target date. Shared by onboarding and the region panel. */
export function RegionForm({ initial, submitLabel, onSubmit, onChange, autoFocus }: Props) {
  const [draft, setDraft] = useState(initial);
  const update = (patch: Partial<RegionDraft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onChange?.(next);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (draft.name.trim()) onSubmit(draft);
  };

  return (
    <form className="region-form" onSubmit={submit}>
      <label className="field">
        <span>Name</span>
        <input
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          maxLength={80}
          placeholder="e.g. Thesis, Kitchen renovation, Run a 10K"
          autoFocus={autoFocus}
          lang="bn-BD en"
          aria-label="Region name"
        />
      </label>

      <div className="field">
        <span>Kind</span>
        <div className="segmented" role="radiogroup" aria-label="Region kind">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={draft.kind === k}
              className={draft.kind === k ? 'is-on' : ''}
              onClick={() => update({ kind: k })}
            >
              {REGION_KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>Colour</span>
        <div className="swatches" role="radiogroup" aria-label="Region colour">
          {PALETTE.regionHues.map((hex, i) => (
            <button
              key={hex}
              type="button"
              role="radio"
              aria-checked={draft.colorIndex === i}
              aria-label={`Colour ${i + 1}`}
              className={`swatch${draft.colorIndex === i ? ' is-on' : ''}`}
              style={{ ['--swatch' as string]: hex }}
              onClick={() => update({ colorIndex: i })}
            />
          ))}
        </div>
      </div>

      <label className="field">
        <span>Purpose (optional)</span>
        <input
          value={draft.description}
          onChange={(e) => update({ description: e.target.value })}
          maxLength={200}
          placeholder="One line on why this exists"
          lang="bn-BD en"
        />
      </label>

      {draft.kind === 'goal' && (
        <label className="field">
          <span>Target date</span>
          <input type="date" value={toDateInput(draft.targetDate)} onChange={(e) => update({ targetDate: fromDateInput(e.target.value) })} />
        </label>
      )}

      <button className="btn btn-primary" type="submit" disabled={!draft.name.trim()}>
        {submitLabel}
      </button>
    </form>
  );
}
