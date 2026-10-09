import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { PRIORITY_LABELS, type Priority } from '../contracts/task';
import { spaceHue } from '../contracts/tokens';
import { parseQuickAdd, useStore } from '../state/store';
import { PriorityRail } from './TaskMeta';

const PRIORITY_TOKEN = /(^|\s)!(1|2|3|low|med|medium|high)(?=\s|$)/giu;

/**
 * Rewrites the `!n` token in the raw text rather than holding priority in separate state.
 *
 * The text stays the single source of truth, and the button doubles as a demonstration of the
 * syntax: click it and the token appears in the field, where it can then be typed directly.
 */
function cyclePriorityToken(raw: string): string {
  const next = ((parseQuickAdd(raw).priority + 1) % 4) as Priority;
  const stripped = raw.replace(PRIORITY_TOKEN, '$1').replace(/\s{2,}/g, ' ').trim();
  if (next === 0) return stripped;
  return stripped ? `${stripped} !${next}` : `!${next}`;
}

/**
 * Quick capture.
 *
 * The `!1`-`!3` and `#tag` syntax used to be documented only in a `title` tooltip, which is to say
 * nowhere. Parsing as you type and echoing the result as chips makes it discoverable the first time
 * anyone stumbles into it, and shows exactly what is about to be created.
 */
export function TaskInput() {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const addTask = useStore((s) => s.addTask);
  const focusToken = useStore((s) => s.inputFocusToken);
  const space = useStore((s) => s.spaces.find((g) => g.id === s.activeSpaceId));
  const spaceName = space?.name ?? '';

  const parsed = useMemo(() => parseQuickAdd(value), [value]);
  const showChips = value.trim().length > 0 && (parsed.priority > 0 || parsed.tags.length > 0);

  useEffect(() => {
    if (focusToken > 0) ref.current?.focus();
  }, [focusToken]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter while an IME candidate window is open confirms the composition, not the task.
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    const text = value.trim();
    if (!text) return;
    void addTask(text);
    setValue('');
  };

  return (
    <div className="task-capture" style={space ? { ['--space' as string]: spaceHue(space.colorIndex) } : undefined}>
      <div className="task-input">
        <span className="task-input-plus" aria-hidden="true">
          +
        </span>
        <input
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Add a task to ${spaceName || 'this space'}…`}
          aria-label="New task"
          aria-describedby="capture-hint"
          maxLength={500}
          spellCheck={false}
          autoComplete="off"
          lang="bn-BD en"
        />
        <button
          type="button"
          className="capture-prio"
          onClick={() => {
            setValue(cyclePriorityToken(value));
            ref.current?.focus();
          }}
          title="Cycle priority — or type !1, !2, !3"
          aria-label={`Priority: ${PRIORITY_LABELS[parsed.priority]}. Click to change.`}
        >
          <PriorityRail value={parsed.priority} />
        </button>
        <kbd>N</kbd>
      </div>

      <div className="capture-foot" id="capture-hint">
        {showChips ? (
          <div className="capture-chips">
            {parsed.priority > 0 && <span className="chip chip-prio">{PRIORITY_LABELS[parsed.priority]}</span>}
            {parsed.tags.map((t) => (
              <span key={t} className="chip chip-tag">
                #{t}
              </span>
            ))}
            {parsed.title && (
              <span className="chip-title" lang="bn-BD en">
                {parsed.title}
              </span>
            )}
          </div>
        ) : (
          <span className="capture-hint">
            <kbd>!1</kbd>–<kbd>!3</kbd> priority · <kbd>#tag</kbd> to tag
          </span>
        )}
      </div>
    </div>
  );
}
