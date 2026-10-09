import { useCallback, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { PALETTE } from '../contracts/tokens';
import { Scene } from '../scene/Scene';
import { orderTasks, useStore } from '../state/store';
import { CommandPalette } from '../ui/CommandPalette';
import { DetailPanel } from '../ui/DetailPanel';
import { SettingsPanel } from '../ui/SettingsPanel';
import { Sidebar } from '../ui/Sidebar';
import { TaskInput } from '../ui/TaskInput';
import { TitleBar } from '../ui/TitleBar';
import { Toasts } from '../ui/Toasts';
import { useGlobalShortcuts } from '../ui/shortcuts';
import { useReducedMotion } from '../ui/useReducedMotion';

export function App() {
  const ready = useStore((s) => s.ready);
  const loadError = useStore((s) => s.loadError);
  const init = useStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);
  useGlobalShortcuts();

  if (!ready) return <div className="boot">Loading…</div>;
  if (loadError)
    return (
      <div className="app">
        <TitleBar />
        <div className="boot">
          <div>
            <h2>woTask could not load its data</h2>
            <pre>{loadError}</pre>
          </div>
        </div>
      </div>
    );

  return (
    <div className="app">
      <TitleBar />
      <div className="app-body">
        <Sidebar />
        <Main />
      </div>
      <CommandPalette />
      <SettingsPanel />
      <Toasts />
    </div>
  );
}

function Main() {
  const tasks = useStore(useShallow((s) => orderTasks(s.tasks, s.activeListId, s.showCompleted)));
  const selectedId = useStore((s) => s.selectedId);
  const quality = useStore((s) => s.quality);
  const accent = useStore((s) => s.lists.find((l) => l.id === s.activeListId)?.color ?? PALETTE.accent);
  const totalInList = useStore((s) => s.tasks.filter((t) => t.listId === s.activeListId).length);
  const reducedMotion = useReducedMotion();

  const onSelect = useCallback((id: string | null) => useStore.getState().select(id), []);
  const onOpen = useCallback((id: string) => useStore.getState().openEditor(id), []);
  const onToggle = useCallback((id: string) => void useStore.getState().toggleComplete(id), []);

  const hints = useMemo(
    () => [
      ['N', 'new'],
      ['↑↓', 'select'],
      ['Space', 'complete'],
      ['Enter', 'edit'],
      ['Del', 'delete'],
      ['Ctrl Z', 'undo'],
      ['Ctrl K', 'commands'],
    ],
    [],
  );

  return (
    <main className="main">
      <Scene
        tasks={tasks}
        selectedId={selectedId}
        accent={accent}
        quality={quality}
        reducedMotion={reducedMotion}
        onSelect={onSelect}
        onOpen={onOpen}
        onToggle={onToggle}
      />
      <div className="overlay">
        <TaskInput />
        {tasks.length === 0 && (
          <div className="empty-state">
            <h2>{totalInList === 0 ? 'Nothing here yet' : 'All done ✨'}</h2>
            <p>{totalInList === 0 ? 'Type above or press N to add your first task.' : 'Every task in this list is complete. Press H to show them.'}</p>
          </div>
        )}
        <div className="hint-bar" aria-hidden="true">
          {hints.map(([k, label]) => (
            <span key={k}>
              <kbd>{k}</kbd>
              {label}
            </span>
          ))}
        </div>
      </div>
      <DetailPanel />
    </main>
  );
}
