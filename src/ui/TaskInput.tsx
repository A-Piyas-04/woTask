import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useStore } from '../state/store';

export function TaskInput() {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const addTask = useStore((s) => s.addTask);
  const focusToken = useStore((s) => s.inputFocusToken);
  const listName = useStore((s) => s.lists.find((l) => l.id === s.activeListId)?.name ?? '');

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
    <div className="task-input">
      <span className="task-input-plus" aria-hidden="true">
        +
      </span>
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={`Add a task to ${listName || 'this list'}…   !1–!3 priority · #tag`}
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
