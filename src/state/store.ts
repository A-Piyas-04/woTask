import { create } from 'zustand';
import type { QualityTier } from '../contracts/events';
import type { DataRepository } from '../contracts/repository';
import { PALETTE } from '../contracts/tokens';
import type { Priority, Space, SpaceKind, SpacePatch, Task, TaskPatch } from '../contracts/task';
import { BROWSER_STORAGE_KEY, createRepository } from '../data/repository';
import { FIXTURES } from '../mocks/tasks';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error';
  actionLabel?: string;
  action?: () => void;
}

interface UndoEntry {
  label: string;
  run: () => Promise<void>;
}

/** Inline explanation shown next to the space it concerns (e.g. "cannot delete the last space"). */
export interface SpaceNotice {
  spaceId: string;
  message: string;
}

export interface NewSpace {
  name: string;
  kind: SpaceKind;
  description?: string | null;
  colorIndex?: number;
  targetDate?: number | null;
}

export interface AppState {
  ready: boolean;
  loadError: string | null;
  repoKind: 'tauri' | 'browser';
  dataPath: string;

  /** All spaces, including archived ones. Use `visibleSpaces()` for display. */
  spaces: Space[];
  tasks: Task[];
  activeSpaceId: string | null;
  selectedId: string | null;
  editingId: string | null;
  /** Space whose settings panel is open. */
  editingSpaceId: string | null;
  /** The space panel is open in create mode. */
  creatingSpace: boolean;
  spaceNotice: SpaceNotice | null;
  paletteOpen: boolean;
  settingsOpen: boolean;
  shortcutsOpen: boolean;
  showCompleted: boolean;
  quality: QualityTier;
  /** Spheres float and the background drifts while the window is focused. */
  ambientMotion: boolean;
  /** True until the first-run hints have been shown once. */
  firstRun: boolean;
  /** Incremented to ask the task input to take focus. */
  inputFocusToken: number;
  /** Bumped whenever a space is chosen, so the camera flies to it even if it was already active. */
  spaceFocusToken: number;
  toasts: Toast[];
  undoStack: UndoEntry[];

  init(): Promise<void>;
  addTask(raw: string): Promise<void>;
  updateTask(id: string, patch: TaskPatch): Promise<void>;
  toggleComplete(id: string): Promise<void>;
  deleteTask(id: string): Promise<void>;
  moveTask(id: string, direction: -1 | 1): Promise<void>;
  cyclePriority(id: string): Promise<void>;
  createSpace(input: NewSpace): Promise<string | null>;
  updateSpace(id: string, patch: SpacePatch): Promise<void>;
  archiveSpace(id: string): Promise<void>;
  unarchiveSpace(id: string): Promise<void>;
  deleteSpace(id: string): Promise<void>;
  undo(): Promise<void>;

  select(id: string | null): void;
  selectRelative(delta: -1 | 1): void;
  setActiveSpace(id: string): void;
  cycleSpace(delta: -1 | 1): void;
  openEditor(id: string | null): void;
  openSpaceEditor(id: string | null): void;
  setCreatingSpace(open: boolean): void;
  clearSpaceNotice(): void;
  setPaletteOpen(open: boolean): void;
  setSettingsOpen(open: boolean): void;
  setShortcutsOpen(open: boolean): void;
  toggleShowCompleted(): void;
  setQuality(q: QualityTier): void;
  toggleAmbientMotion(): void;
  markFirstRunSeen(): void;
  focusInput(): void;
  pushToast(t: Omit<Toast, 'id'>): void;
  dismissToast(id: number): void;
}

const UNDO_LIMIT = 50;
const QUALITY_KEY = 'wotask:quality';
const SHOW_COMPLETED_KEY = 'wotask:showCompleted';
const AMBIENT_KEY = 'wotask:ambientMotion';
const FIRST_RUN_KEY = 'wotask:firstRunSeen';
const NOTICE_MS = 6000;

let repo: DataRepository = createRepository();
let toastSeq = 1;
let noticeTimer: number | undefined;

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const KIND_ORDER: Record<SpaceKind, number> = { project: 0, goal: 1, category: 2 };

/** Non-archived spaces in display order: grouped by kind, then by position. Drives sidebar, shortcuts and layout. */
export function visibleSpaces(spaces: Space[]): Space[] {
  return spaces
    .filter((g) => g.archivedAt === null)
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.position - b.position || a.createdAt - b.createdAt);
}

/** Lowest palette slot not used by a visible space; cycles once all are taken. */
export function nextColorIndex(spaces: Space[]): number {
  const n = PALETTE.spaceHues.length;
  const used = new Set(spaces.filter((g) => g.archivedAt === null).map((g) => g.colorIndex));
  for (let i = 0; i < n; i++) if (!used.has(i)) return i;
  return spaces.length % n;
}

/** Active tasks by position, then completed tasks most-recent first. */
export function orderTasks(tasks: Task[], spaceId: string | null, showCompleted: boolean): Task[] {
  const inSpace = tasks.filter((t) => t.spaceId === spaceId);
  const active = inSpace.filter((t) => t.completedAt === null).sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
  if (!showCompleted) return active;
  const done = inSpace.filter((t) => t.completedAt !== null).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  return [...active, ...done];
}

/** Quick-add syntax: `!1`..`!3` (or !low/!med/!high) sets priority, `#tag` adds a tag. */
export function parseQuickAdd(raw: string): { title: string; priority: Priority; tags: string[] } {
  let priority: Priority = 0;
  const tags: string[] = [];
  const words = raw.split(/\s+/).filter((w) => {
    const p = /^!(1|2|3|low|med|medium|high)$/i.exec(w);
    if (p) {
      const v = p[1].toLowerCase();
      priority = v === '1' || v === 'low' ? 1 : v === '2' || v.startsWith('med') ? 2 : 3;
      return false;
    }
    const t = /^#([^\s#]{1,40})$/u.exec(w);
    if (t) {
      if (!tags.includes(t[1])) tags.push(t[1]);
      return false;
    }
    return true;
  });
  return { title: words.join(' ').trim(), priority, tags };
}

const readPref = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
};

const writePref = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* preference is best-effort */
  }
};

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Dev-only `?seed=<fixture>`: an isolated, freshly seeded storage slot per fixture. */
function devFixture(): string | null {
  if (!import.meta.env.DEV || typeof location === 'undefined') return null;
  const name = new URLSearchParams(location.search).get('seed');
  return name && name in FIXTURES ? name : null;
}

export const useStore = create<AppState>()((set, get) => {
  /**
   * Optimistic mutation: apply locally, persist, roll back on failure.
   * `inverse` (if given) is pushed onto the undo stack after a successful persist.
   */
  const commit = async (
    next: Partial<Pick<AppState, 'tasks' | 'spaces'>>,
    persist: () => Promise<unknown>,
    undo?: UndoEntry,
  ): Promise<boolean> => {
    const prev = { tasks: get().tasks, spaces: get().spaces };
    set(next);
    try {
      await persist();
      if (undo) set((s) => ({ undoStack: [...s.undoStack, undo].slice(-UNDO_LIMIT) }));
      return true;
    } catch (e) {
      set(prev);
      get().pushToast({ kind: 'error', message: `Could not save: ${errorMessage(e)}` });
      return false;
    }
  };

  const restoreTask = (task: Task) => async () => {
    await commit({ tasks: [...get().tasks.filter((t) => t.id !== task.id), task] }, () => repo.saveTask(task));
  };

  const spaceOrder = (spaceId: string): Task[] => orderTasks(get().tasks, spaceId, true);

  const visible = (): Task[] => orderTasks(get().tasks, get().activeSpaceId, get().showCompleted);

  const notice = (spaceId: string, message: string) => {
    window.clearTimeout(noticeTimer);
    set({ spaceNotice: { spaceId, message } });
    noticeTimer = window.setTimeout(() => get().clearSpaceNotice(), NOTICE_MS);
  };

  /** The app always keeps at least one visible space. Returns false (and explains) when `id` is the last one. */
  const guardLast = (id: string, verb: 'delete' | 'archive'): boolean => {
    const space = get().spaces.find((g) => g.id === id);
    if (!space) return false;
    const shown = visibleSpaces(get().spaces);
    const isLastShown = space.archivedAt === null && shown.length <= 1;
    if (get().spaces.length <= 1 || isLastShown) {
      notice(id, `Can't ${verb} “${space.name}”: woTask always needs at least one space. Create another space first.`);
      return false;
    }
    return true;
  };

  const putSpace = async (prev: Space, next: Space, label: string) => {
    await commit({ spaces: get().spaces.map((g) => (g.id === prev.id ? next : g)) }, () => repo.updateSpace(next), {
      label,
      run: async () => {
        await commit({ spaces: get().spaces.map((g) => (g.id === prev.id ? prev : g)) }, () => repo.updateSpace(prev));
      },
    });
  };

  const fallbackActive = (excluding: string): string | null =>
    visibleSpaces(get().spaces).find((g) => g.id !== excluding)?.id ?? null;

  return {
    ready: false,
    loadError: null,
    repoKind: repo.kind,
    dataPath: '',
    spaces: [],
    tasks: [],
    activeSpaceId: null,
    selectedId: null,
    editingId: null,
    editingSpaceId: null,
    creatingSpace: false,
    spaceNotice: null,
    paletteOpen: false,
    settingsOpen: false,
    shortcutsOpen: false,
    showCompleted: readPref(SHOW_COMPLETED_KEY, ['true', 'false'], 'true') === 'true',
    quality: readPref<QualityTier>(QUALITY_KEY, ['high', 'medium', 'low'], 'high'),
    ambientMotion: readPref(AMBIENT_KEY, ['true', 'false'], 'true') === 'true',
    firstRun: readPref(FIRST_RUN_KEY, ['true', 'false'], 'false') !== 'true',
    inputFocusToken: 0,
    spaceFocusToken: 0,
    toasts: [],
    undoStack: [],

    async init() {
      try {
        const fixture = devFixture();
        if (fixture) {
          const key = `${BROWSER_STORAGE_KEY}:fixture:${fixture}`;
          localStorage.removeItem(key);
          repo = createRepository(key);
          const data = FIXTURES[fixture](Date.now());
          if (data.spaces.length) await repo.seed(data.spaces, data.tasks);
        } else {
          repo = createRepository();
          if (import.meta.env.DEV && (await repo.getSpaces()).length === 0) {
            const data = FIXTURES.demo(Date.now());
            await repo.seed(data.spaces, data.tasks);
          }
        }
        const [spaces, tasks, dataPath] = await Promise.all([repo.getSpaces(), repo.getTasks(), repo.dataPath()]);
        set({
          spaces,
          tasks,
          dataPath,
          repoKind: repo.kind,
          activeSpaceId: visibleSpaces(spaces)[0]?.id ?? spaces[0]?.id ?? null,
          ready: true,
          loadError: null,
        });
      } catch (e) {
        set({ ready: true, loadError: errorMessage(e) });
      }
    },

    async addTask(raw) {
      const { title, priority, tags } = parseQuickAdd(raw);
      const spaceId = get().activeSpaceId;
      if (!title || !spaceId) return;
      const now = Date.now();
      const siblings = get().tasks.filter((t) => t.spaceId === spaceId);
      const position = siblings.length ? Math.min(...siblings.map((t) => t.position)) - 1 : 0;
      const task: Task = {
        id: newId(),
        spaceId,
        title: title.slice(0, 500),
        notes: '',
        priority,
        dueAt: null,
        completedAt: null,
        position,
        createdAt: now,
        updatedAt: now,
        tags,
      };
      const ok = await commit({ tasks: [...get().tasks, task] }, () => repo.saveTask(task), {
        label: 'Add task',
        run: async () => {
          await commit({ tasks: get().tasks.filter((t) => t.id !== task.id) }, () => repo.deleteTask(task.id));
        },
      });
      if (ok) set({ selectedId: task.id });
    },

    async updateTask(id, patch) {
      const prev = get().tasks.find((t) => t.id === id);
      if (!prev) return;
      const next: Task = { ...prev, ...patch, updatedAt: Date.now() };
      if (!next.title.trim()) return;
      await commit({ tasks: get().tasks.map((t) => (t.id === id ? next : t)) }, () => repo.saveTask(next), {
        label: 'Edit task',
        run: restoreTask(prev),
      });
    },

    async toggleComplete(id) {
      const t = get().tasks.find((x) => x.id === id);
      if (!t) return;
      await get().updateTask(id, { completedAt: t.completedAt === null ? Date.now() : null });
    },

    async deleteTask(id) {
      const task = get().tasks.find((t) => t.id === id);
      if (!task) return;
      const order = visible();
      const idx = order.findIndex((t) => t.id === id);
      const neighbour = order[idx + 1] ?? order[idx - 1] ?? null;
      set({
        selectedId: get().selectedId === id ? (neighbour?.id ?? null) : get().selectedId,
        editingId: get().editingId === id ? null : get().editingId,
      });
      const ok = await commit({ tasks: get().tasks.filter((t) => t.id !== id) }, () => repo.deleteTask(id), {
        label: 'Delete task',
        run: restoreTask(task),
      });
      if (ok) {
        get().pushToast({
          kind: 'info',
          message: `Deleted “${task.title.length > 40 ? `${task.title.slice(0, 40)}…` : task.title}”`,
          actionLabel: 'Undo',
          action: () => void get().undo(),
        });
      }
    },

    async moveTask(id, direction) {
      const task = get().tasks.find((t) => t.id === id);
      if (!task || task.completedAt !== null) return;
      const before = spaceOrder(task.spaceId);
      const active = before.filter((t) => t.completedAt === null);
      const i = active.findIndex((t) => t.id === id);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= active.length) return;
      const reordered = [...active];
      [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
      const done = before.filter((t) => t.completedAt !== null);
      const ids = [...reordered, ...done].map((t) => t.id);
      const prevIds = before.map((t) => t.id);
      const apply = (order: string[]) => {
        const pos = new Map(order.map((tid, k) => [tid, k]));
        return get().tasks.map((t) => (pos.has(t.id) ? { ...t, position: pos.get(t.id) ?? t.position } : t));
      };
      await commit({ tasks: apply(ids) }, () => repo.reorderTasks(task.spaceId, ids), {
        label: 'Move task',
        run: async () => {
          await commit({ tasks: apply(prevIds) }, () => repo.reorderTasks(task.spaceId, prevIds));
        },
      });
    },

    async cyclePriority(id) {
      const t = get().tasks.find((x) => x.id === id);
      if (!t) return;
      await get().updateTask(id, { priority: ((t.priority + 1) % 4) as Priority });
    },

    async createSpace(input) {
      const name = input.name.trim().slice(0, 80);
      if (!name) return null;
      const spaces = get().spaces;
      const space: Space = {
        id: newId(),
        name,
        kind: input.kind,
        description: input.description?.trim().slice(0, 200) || null,
        colorIndex: input.colorIndex ?? nextColorIndex(spaces),
        position: spaces.length ? Math.max(...spaces.map((g) => g.position)) + 1 : 0,
        targetDate: input.kind === 'goal' ? (input.targetDate ?? null) : null,
        createdAt: Date.now(),
        archivedAt: null,
      };
      const ok = await commit({ spaces: [...spaces, space] }, () => repo.createSpace(space), {
        label: 'Create space',
        run: async () => {
          await commit({ spaces: get().spaces.filter((g) => g.id !== space.id) }, () => repo.deleteSpace(space.id));
          if (get().activeSpaceId === space.id) set({ activeSpaceId: fallbackActive(space.id) });
        },
      });
      if (!ok) return null;
      set({ activeSpaceId: space.id, selectedId: null });
      return space.id;
    },

    async updateSpace(id, patch) {
      const prev = get().spaces.find((g) => g.id === id);
      if (!prev) return;
      const next: Space = { ...prev, ...patch };
      next.name = next.name.trim().slice(0, 80);
      if (!next.name) return;
      if (next.kind !== 'goal') next.targetDate = null;
      await putSpace(prev, next, 'Edit space');
    },

    async archiveSpace(id) {
      const prev = get().spaces.find((g) => g.id === id);
      if (!prev || prev.archivedAt !== null || !guardLast(id, 'archive')) return;
      if (get().activeSpaceId === id) set({ activeSpaceId: fallbackActive(id), selectedId: null, editingId: null });
      await putSpace(prev, { ...prev, archivedAt: Date.now() }, 'Archive space');
    },

    async unarchiveSpace(id) {
      const prev = get().spaces.find((g) => g.id === id);
      if (!prev || prev.archivedAt === null) return;
      await putSpace(prev, { ...prev, archivedAt: null }, 'Restore space');
      set({ activeSpaceId: id, selectedId: null });
    },

    async deleteSpace(id) {
      const space = get().spaces.find((g) => g.id === id);
      if (!space || !guardLast(id, 'delete')) return;
      const removedTasks = get().tasks.filter((t) => t.spaceId === id);
      const remaining = get().spaces.filter((g) => g.id !== id);
      if (get().activeSpaceId === id) set({ activeSpaceId: fallbackActive(id), selectedId: null, editingId: null });
      if (get().editingSpaceId === id) set({ editingSpaceId: null });
      const ok = await commit(
        { spaces: remaining, tasks: get().tasks.filter((t) => t.spaceId !== id) },
        () => repo.deleteSpace(id),
        {
          label: 'Delete space',
          run: async () => {
            await commit(
              { spaces: [...get().spaces, space].sort((a, b) => a.position - b.position), tasks: [...get().tasks, ...removedTasks] },
              async () => {
                await repo.createSpace(space);
                for (const t of removedTasks) await repo.saveTask(t);
              },
            );
          },
        },
      );
      if (ok) {
        get().pushToast({ kind: 'info', message: `Deleted space “${space.name}”`, actionLabel: 'Undo', action: () => void get().undo() });
      }
    },

    async undo() {
      const stack = get().undoStack;
      const entry = stack[stack.length - 1];
      if (!entry) {
        get().pushToast({ kind: 'info', message: 'Nothing to undo' });
        return;
      }
      set({ undoStack: stack.slice(0, -1) });
      await entry.run();
    },

    select(id) {
      set({ selectedId: id });
    },

    selectRelative(delta) {
      const order = visible();
      if (order.length === 0) return;
      const i = order.findIndex((t) => t.id === get().selectedId);
      const next = i < 0 ? (delta > 0 ? 0 : order.length - 1) : Math.min(order.length - 1, Math.max(0, i + delta));
      set({ selectedId: order[next].id });
    },

    setActiveSpace(id) {
      // Choosing the space that is already active re-centres the camera on it.
      if (id === get().activeSpaceId) {
        set((s) => ({ selectedId: null, spaceFocusToken: s.spaceFocusToken + 1 }));
        return;
      }
      set((s) => ({ activeSpaceId: id, selectedId: null, editingId: null, spaceFocusToken: s.spaceFocusToken + 1 }));
    },

    cycleSpace(delta) {
      const shown = visibleSpaces(get().spaces);
      if (shown.length === 0) return;
      const i = shown.findIndex((g) => g.id === get().activeSpaceId);
      const next = (i + delta + shown.length) % shown.length;
      get().setActiveSpace(shown[next].id);
    },

    openEditor(id) {
      set({ editingId: id, selectedId: id ?? get().selectedId, editingSpaceId: id ? null : get().editingSpaceId });
    },
    openSpaceEditor(id) {
      set({ editingSpaceId: id, creatingSpace: false, editingId: id ? null : get().editingId });
    },
    setCreatingSpace(open) {
      set({ creatingSpace: open, editingSpaceId: open ? null : get().editingSpaceId, editingId: open ? null : get().editingId });
    },
    clearSpaceNotice() {
      window.clearTimeout(noticeTimer);
      set({ spaceNotice: null });
    },
    setPaletteOpen(open) {
      set({ paletteOpen: open });
    },
    setSettingsOpen(open) {
      set({ settingsOpen: open });
    },
    setShortcutsOpen(open) {
      set({ shortcutsOpen: open });
    },
    toggleShowCompleted() {
      const showCompleted = !get().showCompleted;
      writePref(SHOW_COMPLETED_KEY, String(showCompleted));
      set({ showCompleted });
    },
    setQuality(quality) {
      writePref(QUALITY_KEY, quality);
      set({ quality });
    },
    toggleAmbientMotion() {
      const ambientMotion = !get().ambientMotion;
      writePref(AMBIENT_KEY, String(ambientMotion));
      set({ ambientMotion });
    },
    markFirstRunSeen() {
      writePref(FIRST_RUN_KEY, 'true');
      set({ firstRun: false });
    },
    focusInput() {
      set((s) => ({ inputFocusToken: s.inputFocusToken + 1 }));
    },
    pushToast(t) {
      const id = toastSeq++;
      set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
      window.setTimeout(() => get().dismissToast(id), t.kind === 'error' ? 7000 : 5000);
    },
    dismissToast(id) {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    },
  };
});
