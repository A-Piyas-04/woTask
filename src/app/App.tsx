import { useCallback, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Task } from '../contracts/task';
import { Scene } from '../scene/Scene';
import type { SpaceStats } from '../scene/objects/Constellation';
import { chainIndex, orderTasks, useStore, visibleSpaces } from '../state/store';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { SelectionBar } from '../ui/SelectionBar';
import { CommandPalette } from '../ui/CommandPalette';
import { DetailPanel } from '../ui/DetailPanel';
import { Onboarding } from '../ui/Onboarding';
import { SpacePanel } from '../ui/SpacePanel';
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
  const hasSpaces = useStore((s) => s.spaces.length > 0);

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
  if (!hasSpaces)
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
            <kbd>L</kbd> chain after
          </span>
        </span>
      )}
      <button className="hint-shortcuts" onClick={() => openShortcuts(true)}>
        <kbd>?</kbd> shortcuts
      </button>
    </div>
  );
}

/**
 * The two confirmations the app raises, in one place.
 *
 * Both guard something a plain undo cannot comfortably cover: deleting a space takes every task in
 * it, and completing a blocked task contradicts a sequence the user set up on purpose. Deleting a
 * single task is deliberately absent - it is cheap, reversible, and already has an undo toast.
 */
/** Link mode changes what a click means, so it has to say so. */
function LinkingBanner() {
  const task = useStore((s) => (s.linkingFrom ? s.tasks.find((t) => t.id === s.linkingFrom) : undefined));
  const beginLinking = useStore((s) => s.beginLinking);
  if (!task) return null;
  return (
    <div className="linking-banner" role="status">
      <span lang="bn-BD en">
        Click the task that <b>{task.title}</b> comes after
      </span>
      <button className="sel-action" onClick={() => beginLinking(null)}>
        Cancel
      </button>
    </div>
  );
}

function Dialogs() {
  const { blocked, blocker, space, spaceTaskCount } = useStore(
    useShallow((s) => {
      const blocked = s.confirmCompleteId ? s.tasks.find((t) => t.id === s.confirmCompleteId) : undefined;
      const space = s.confirmDeleteSpaceId ? s.spaces.find((g) => g.id === s.confirmDeleteSpaceId) : undefined;
      return {
        blocked,
        blocker: blocked?.blockedBy ? s.tasks.find((t) => t.id === blocked.blockedBy) : undefined,
        space,
        spaceTaskCount: space ? s.tasks.filter((t) => t.spaceId === space.id).length : 0,
      };
    }),
  );
  const completeAnyway = useStore((s) => s.completeAnyway);
  const dismissCompleteConfirm = useStore((s) => s.dismissCompleteConfirm);
  const requestDeleteSpace = useStore((s) => s.requestDeleteSpace);
  const deleteSpace = useStore((s) => s.deleteSpace);

  if (space) {
    const tasks = spaceTaskCount === 1 ? '1 task' : `${spaceTaskCount} tasks`;
    return (
      <ConfirmDialog
        title={`Delete “${space.name}”?`}
        body={
          spaceTaskCount === 0
            ? 'This space is empty. Ctrl+Z undoes this.'
            : `Its ${tasks} are deleted too. Ctrl+Z undoes this.`
        }
        confirmLabel="Delete space"
        danger
        onConfirm={() => {
          const id = space.id;
          requestDeleteSpace(null);
          void deleteSpace(id);
        }}
        onCancel={() => requestDeleteSpace(null)}
      />
    );
  }

  if (blocked) {
    return (
      <ConfirmDialog
        title="Complete out of order?"
        body={
          blocker
            ? `“${blocked.title}” comes after “${blocker.title}”, which is not done yet.`
            : `“${blocked.title}” is still blocked.`
        }
        confirmLabel="Complete anyway"
        onConfirm={() => void completeAnyway(blocked.id)}
        onCancel={dismissCompleteConfirm}
      />
    );
  }

  return null;
}

function Main() {
  const { spaces, tasks, showCompleted, activeSpaceId, spaceFocusToken, selectedId, quality, ambientMotion } = useStore(
    useShallow((s) => ({
      spaces: s.spaces,
      tasks: s.tasks,
      showCompleted: s.showCompleted,
      activeSpaceId: s.activeSpaceId,
      spaceFocusToken: s.spaceFocusToken,
      selectedId: s.selectedId,
      quality: s.quality,
      ambientMotion: s.ambientMotion,
    })),
  );
  const reducedMotion = useReducedMotion();
  const shown = useMemo(() => visibleSpaces(spaces), [spaces]);

  const tasksBySpace = useMemo(() => {
    const out: Record<string, Task[]> = {};
    for (const g of shown) out[g.id] = orderTasks(tasks, g.id, showCompleted);
    return out;
  }, [shown, tasks, showCompleted]);

  /**
   * Built from the full task list on purpose. Derived per visible space instead, a completed
   * blocker that the show-completed filter is currently hiding would disappear, and a locked task
   * would read as unlocked.
   */
  const chains = useMemo(() => chainIndex(tasks), [tasks]);

  const spaceStats = useMemo(() => {
    const out: Record<string, SpaceStats> = {};
    for (const t of tasks) {
      const s = (out[t.spaceId] ??= { open: 0, done: 0 });
      if (t.completedAt === null) s.open++;
      else s.done++;
    }
    return out;
  }, [tasks]);

  const onSelect = useCallback((id: string | null) => {
    const s = useStore.getState();
    // While picking a blocker, a click answers the question rather than changing the selection.
    if (s.linkingFrom !== null) {
      if (id === null) s.beginLinking(null);
      else void s.linkTask(s.linkingFrom, id);
      return;
    }
    const task = id ? s.tasks.find((t) => t.id === id) : undefined;
    if (task && task.spaceId !== s.activeSpaceId) s.setActiveSpace(task.spaceId);
    s.select(id);
  }, []);
  const onSelectSpace = useCallback((id: string) => useStore.getState().setActiveSpace(id), []);
  const onOpen = useCallback((id: string) => {
    const s = useStore.getState();
    const task = s.tasks.find((t) => t.id === id);
    if (task && task.spaceId !== s.activeSpaceId) s.setActiveSpace(task.spaceId);
    s.openEditor(id);
  }, []);
  const onToggle = useCallback((id: string) => void useStore.getState().toggleComplete(id), []);

  return (
    <main className="main">
      <Scene
        spaces={shown}
        tasksBySpace={tasksBySpace}
        spaceStats={spaceStats}
        chains={chains}
        hideLabels={HIDE_LABELS}
        activeSpaceId={activeSpaceId}
        spaceFocusToken={spaceFocusToken}
        selectedId={selectedId}
        quality={quality}
        ambient={ambientMotion}
        reducedMotion={reducedMotion}
        onSelect={onSelect}
        onSelectSpace={onSelectSpace}
        onOpen={onOpen}
        onToggle={onToggle}
      />
      <div className="overlay">
        <SelectionBar />
        <TaskInput />
      </div>
      <HintLine />
      <LinkingBanner />
      <DetailPanel />
      <SpacePanel />
      <Dialogs />
    </main>
  );
}
