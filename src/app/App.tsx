import { useCallback, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Task } from '../contracts/task';
import { Scene } from '../scene/Scene';
import type { RegionStats } from '../scene/objects/Constellation';
import { orderTasks, useStore, visibleRegions } from '../state/store';
import { CommandPalette } from '../ui/CommandPalette';
import { DetailPanel } from '../ui/DetailPanel';
import { Onboarding } from '../ui/Onboarding';
import { RegionPanel } from '../ui/RegionPanel';
import { SettingsPanel } from '../ui/SettingsPanel';
import { ShortcutsOverlay } from '../ui/ShortcutsOverlay';
import { Sidebar } from '../ui/Sidebar';
import { TaskInput } from '../ui/TaskInput';
import { TitleBar } from '../ui/TitleBar';
import { Toasts } from '../ui/Toasts';
import { useGlobalShortcuts } from '../ui/shortcuts';
import { useReducedMotion } from '../ui/useReducedMotion';

const FIRST_RUN_HINT_MS = 12_000;
/** Dev-only `?labels=off`: visual tests sample WebGL pixels without DOM text on top. */
const HIDE_LABELS = import.meta.env.DEV && new URLSearchParams(location.search).get('labels') === 'off';

export function App() {
  const ready = useStore((s) => s.ready);
  const loadError = useStore((s) => s.loadError);
  const init = useStore((s) => s.init);
  const hasRegions = useStore((s) => s.regions.length > 0);

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
  if (!hasRegions)
    return (
      <div className="app">
        <TitleBar />
        <Onboarding />
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
      <ShortcutsOverlay />
      <Toasts />
    </div>
  );
}

function HintLine() {
  const firstRun = useStore((s) => s.firstRun);
  const markSeen = useStore((s) => s.markFirstRunSeen);
  const openShortcuts = useStore((s) => s.setShortcutsOpen);

  useEffect(() => {
    if (!firstRun) return;
    const t = window.setTimeout(markSeen, FIRST_RUN_HINT_MS);
    return () => window.clearTimeout(t);
  }, [firstRun, markSeen]);

  return (
    <div className="hint-line">
      {firstRun && (
        <span className="first-run-hints" aria-hidden="true">
          <span>
            <kbd>N</kbd> new task
          </span>
          <span>
            <kbd>Drag</kbd> explore
          </span>
          <span>
            <kbd>Click</kbd> twice to complete
          </span>
        </span>
      )}
      <button className="hint-shortcuts" onClick={() => openShortcuts(true)}>
        <kbd>?</kbd> shortcuts
      </button>
    </div>
  );
}

function Main() {
  const { regions, tasks, showCompleted, activeRegionId, selectedId, quality, ambientMotion } = useStore(
    useShallow((s) => ({
      regions: s.regions,
      tasks: s.tasks,
      showCompleted: s.showCompleted,
      activeRegionId: s.activeRegionId,
      selectedId: s.selectedId,
      quality: s.quality,
      ambientMotion: s.ambientMotion,
    })),
  );
  const reducedMotion = useReducedMotion();
  const shown = useMemo(() => visibleRegions(regions), [regions]);

  const tasksByRegion = useMemo(() => {
    const out: Record<string, Task[]> = {};
    for (const g of shown) out[g.id] = orderTasks(tasks, g.id, showCompleted);
    return out;
  }, [shown, tasks, showCompleted]);

  const regionStats = useMemo(() => {
    const out: Record<string, RegionStats> = {};
    for (const t of tasks) {
      const s = (out[t.regionId] ??= { open: 0, done: 0 });
      if (t.completedAt === null) s.open++;
      else s.done++;
    }
    return out;
  }, [tasks]);

  const onSelect = useCallback((id: string | null) => {
    const s = useStore.getState();
    const task = id ? s.tasks.find((t) => t.id === id) : undefined;
    if (task && task.regionId !== s.activeRegionId) s.setActiveRegion(task.regionId);
    s.select(id);
  }, []);
  const onSelectRegion = useCallback((id: string) => useStore.getState().setActiveRegion(id), []);
  const onOpen = useCallback((id: string) => {
    const s = useStore.getState();
    const task = s.tasks.find((t) => t.id === id);
    if (task && task.regionId !== s.activeRegionId) s.setActiveRegion(task.regionId);
    s.openEditor(id);
  }, []);
  const onToggle = useCallback((id: string) => void useStore.getState().toggleComplete(id), []);

  return (
    <main className="main">
      <Scene
        regions={shown}
        tasksByRegion={tasksByRegion}
        regionStats={regionStats}
        hideLabels={HIDE_LABELS}
        activeRegionId={activeRegionId}
        selectedId={selectedId}
        quality={quality}
        ambient={ambientMotion}
        reducedMotion={reducedMotion}
        onSelect={onSelect}
        onSelectRegion={onSelectRegion}
        onOpen={onOpen}
        onToggle={onToggle}
      />
      <div className="overlay">
        <TaskInput />
      </div>
      <HintLine />
      <DetailPanel />
      <RegionPanel />
    </main>
  );
}
