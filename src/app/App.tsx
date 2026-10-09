import { useCallback, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Task } from '../contracts/task';
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
  const { lists, tasks, showCompleted, activeListId, selectedId, quality, ambientMotion } = useStore(
    useShallow((s) => ({
      lists: s.lists,
      tasks: s.tasks,
      showCompleted: s.showCompleted,
      activeListId: s.activeListId,
      selectedId: s.selectedId,
      quality: s.quality,
      ambientMotion: s.ambientMotion,
    })),
  );
  const reducedMotion = useReducedMotion();

  const tasksByList = useMemo(() => {
    const out: Record<string, Task[]> = {};
    for (const l of lists) out[l.id] = orderTasks(tasks, l.id, showCompleted);
    return out;
  }, [lists, tasks, showCompleted]);

  const onSelect = useCallback((id: string | null) => {
    const s = useStore.getState();
    const task = id ? s.tasks.find((t) => t.id === id) : undefined;
    if (task && task.listId !== s.activeListId) s.setActiveList(task.listId);
    s.select(id);
  }, []);
  const onSelectList = useCallback((id: string) => useStore.getState().setActiveList(id), []);
  const onOpen = useCallback((id: string) => {
    const s = useStore.getState();
    const task = s.tasks.find((t) => t.id === id);
    if (task && task.listId !== s.activeListId) s.setActiveList(task.listId);
    s.openEditor(id);
  }, []);
  const onToggle = useCallback((id: string) => void useStore.getState().toggleComplete(id), []);

  const hints = useMemo(
    () => [
      ['Drag', 'explore'],
      ['Scroll', 'zoom'],
      ['N', 'new'],
      ['↑↓', 'select'],
      ['Space / click again', 'complete'],
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
        lists={lists}
        tasksByList={tasksByList}
        activeListId={activeListId}
        selectedId={selectedId}
        quality={quality}
        ambient={ambientMotion}
        reducedMotion={reducedMotion}
        onSelect={onSelect}
        onSelectList={onSelectList}
        onOpen={onOpen}
        onToggle={onToggle}
      />
      <div className="overlay">
        <TaskInput />
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
