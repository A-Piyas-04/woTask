import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { regionHue } from '../contracts/tokens';
import { useStore } from '../state/store';

export function TaskInput() {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const addTask = useStore((s) => s.addTask);
  const focusToken = useStore((s) => s.inputFocusToken);
  const region = useStore((s) => s.regions.find((g) => g.id === s.activeRegionId));
  const regionName = region?.name ?? '';

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
    <div className="task-input" style={region ? { ['--region' as string]: regionHue(region.colorIndex) } : undefined}>
      <span className="task-input-plus" aria-hidden="true">
        +
      </span>
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={`Add a task to ${regionName || 'this region'}…`}
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
