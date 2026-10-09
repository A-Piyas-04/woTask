import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { COMMANDS } from '../contracts/events';
import { useStore, visibleSpaces } from '../state/store';
import { runCommand } from './shortcuts';

interface Item {
  key: string;
  kind: 'command' | 'task' | 'space';
  title: string;
  hint?: string;
  run(): void;
}

/** Subsequence fuzzy match. Higher is better; -1 means no match. */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  const direct = t.indexOf(q);
  if (direct >= 0) return 1000 - direct;
  let score = 0;
  let ti = 0;
  let streak = 0;
  let first = -1;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return -1;
    if (first < 0) first = found;
    streak = found === ti ? streak + 1 : 0;
    score += 10 + streak * 5 - (found - ti);
    ti = found + 1;
  }
  // Letters scattered across a long title are not a meaningful match.
  if (ti - first > q.length * 3) return -1;
  return score;
}

export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const setOpen = useStore((s) => s.setPaletteOpen);
  const tasks = useStore((s) => s.tasks);
  const spaces = useStore((s) => s.spaces);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setQuery('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      restoreFocus.current?.focus?.();
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const spaceName = new Map(spaces.map((g) => [g.id, g.name]));
    const all: Item[] = [
      ...COMMANDS.filter((c) => c.id !== 'palette.open').map<Item>((c) => ({
        key: `c:${c.id}`,
        kind: 'command',
        title: c.title,
        hint: c.shortcut,
        run: () => runCommand(c.id),
      })),
      ...visibleSpaces(spaces).map<Item>((g) => ({
        key: `g:${g.id}`,
        kind: 'space',
        title: `Go to ${g.name}`,
        run: () => useStore.getState().setActiveSpace(g.id),
      })),
      ...tasks.map<Item>((t) => ({
        key: `t:${t.id}`,
        kind: 'task',
        title: t.title,
        hint: `${spaceName.get(t.spaceId) ?? ''}${t.completedAt !== null ? ' · done' : ''}`,
        run: () => {
          const s = useStore.getState();
          s.setActiveSpace(t.spaceId);
          if (t.completedAt !== null && !s.showCompleted) s.toggleShowCompleted();
          s.select(t.id);
        },
      })),
    ];
    const q = query.trim();
    if (!q) return all.filter((i) => i.kind !== 'task').slice(0, 30);
    return all
      .map((item) => ({ item, score: fuzzyScore(q, item.title) + (item.kind === 'task' ? 5 : 0) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map((x) => x.item);
  }, [query, tasks, spaces]);

  if (!open) return null;

  const choose = (item: Item | undefined) => {
    if (!item) return;
    setOpen(false);
    item.run();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(items[active]);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="palette" role="dialog" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          autoFocus
          className="palette-input"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search tasks, spaces and commands…"
          aria-label="Search"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-options"
          aria-activedescendant={items[active] ? `pi-${items[active].key}` : undefined}
          lang="bn-BD en"
        />
        <ul className="palette-options" id="palette-options" role="listbox">
          {items.length === 0 && (
            <li className="palette-empty">
              <b>Nothing matches that</b>
              Search looks at task titles, space names and command names.
            </li>
          )}
          {items.map((item, i) => (
            <li
              key={item.key}
              id={`pi-${item.key}`}
              role="option"
              aria-selected={i === active}
              className={`palette-item${i === active ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(item)}
            >
              <span className={`palette-kind kind-${item.kind}`}>{item.kind === 'command' ? '›' : item.kind === 'space' ? '◆' : '○'}</span>
              <span className="palette-title">{item.title}</span>
              {item.hint && <span className="palette-hint">{item.hint}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
