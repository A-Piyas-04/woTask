import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { spaceHue } from '../contracts/tokens';
import { useStore } from '../state/store';

export function TaskInput() {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const addTask = useStore((s) => s.addTask);
  const focusToken = useStore((s) => s.inputFocusToken);
  const space = useStore((s) => s.spaces.find((g) => g.id === s.activeSpaceId));
  const spaceName = space?.name ?? '';

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
    <div className="task-input" style={space ? { ['--space' as string]: spaceHue(space.colorIndex) } : undefined}>
      <span className="task-input-plus" aria-hidden="true">
        +
      </span>
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={`Add a task to ${spaceName || 'this space'}…`}
        title="!1–!3 sets priority · #tag adds a tag"
        aria-label="New task"
        maxLength={500}
        spellCheck={false}
        autoComplete="off"
        lang="bn-BD en"
      />
      <kbd>N</kbd>
    </div>
  );
}
