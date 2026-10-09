import { useState, type FormEvent } from 'react';
import { SPACE_KIND_LABELS, type SpaceKind } from '../contracts/task';
import { PALETTE } from '../contracts/tokens';
import { fromDateInput, toDateInput } from './dates';

export interface SpaceDraft {
  name: string;
  kind: SpaceKind;
  description: string;
  colorIndex: number;
  targetDate: number | null;
}

const KINDS: SpaceKind[] = ['category', 'project', 'goal'];

interface Props {
  initial: SpaceDraft;
  submitLabel: string;
  onSubmit(draft: SpaceDraft): void;
  /** Called on every change, for forms that save live. */
  onChange?(draft: SpaceDraft): void;
  autoFocus?: boolean;
}

/** Name, kind, colour, description and (for goals) target date. Shared by onboarding and the space panel. */
export function SpaceForm({ initial, submitLabel, onSubmit, onChange, autoFocus }: Props) {
  const [draft, setDraft] = useState(initial);
  const update = (patch: Partial<SpaceDraft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onChange?.(next);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (draft.name.trim()) onSubmit(draft);
  };

  return (
    <form className="space-form" onSubmit={submit}>
      <label className="field">
        <span>Name</span>
        <input
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          maxLength={80}
          placeholder="e.g. Thesis, Kitchen renovation, Run a 10K"
          autoFocus={autoFocus}
          lang="bn-BD en"
          aria-label="Space name"
        />
      </label>

      <div className="field">
        <span>Kind</span>
        <div className="segmented" role="radiogroup" aria-label="Space kind">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={draft.kind === k}
              className={draft.kind === k ? 'is-on' : ''}
              onClick={() => update({ kind: k })}
            >
              <span className="kind-mark" data-kind={k} aria-hidden="true" />
              {SPACE_KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>Colour</span>
        <div className="swatches" role="radiogroup" aria-label="Space colour">
          {PALETTE.spaceHues.map((hex, i) => (
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
