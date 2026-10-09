import { PRIORITY_LABELS, SPACE_KIND_LABELS, type Priority, type Space } from '../contracts/task';
import { formatDue } from '../shared/taskFormat';

/**
 * Priority as four ticks, n filled.
 *
 * Neutral by design: hue identifies the space everywhere in this app, so priority cannot borrow a
 * colour without breaking that. The orbs already say priority in size and luminance; this is the
 * same fact in a form that survives being read in a list, and it finally gives the `data-priority`
 * attribute on every orb label something to render.
 */
export function PriorityRail({ value }: { value: Priority }) {
  return (
    <span className="prio-rail" data-priority={value} title={`${PRIORITY_LABELS[value]} priority`} aria-label={`${PRIORITY_LABELS[value]} priority`}>
      {[1, 2, 3].map((tick) => (
        <span key={tick} className={tick <= value ? 'is-on' : ''} />
      ))}
    </span>
  );
}

/** Due date. All four tones are styled - weight and opacity carry three, `--alert` only overdue. */
export function DueChip({ dueAt, completed }: { dueAt: number | null; completed: boolean }) {
  const due = formatDue(dueAt);
  if (!due) return null;
  // A completed task cannot be late, so it never shows the alert tone.
  const tone = completed && due.tone === 'overdue' ? 'later' : due.tone;
  return <span className={`due-chip tone-${tone}`}>{due.text}</span>;
}

/** The shape that identifies a space's kind, matching `SPACE_KIND_STYLE` in the scene. */
export function KindMark({ space }: { space: Space }) {
  return <span className="kind-mark" data-kind={space.kind} title={SPACE_KIND_LABELS[space.kind]} aria-hidden="true" />;
}
