import { create } from 'zustand';
import type { QualityTier } from '../contracts/events';
import type { TaskRepository } from '../contracts/repository';
import { PALETTE } from '../contracts/tokens';
import type { List, Priority, Task, TaskPatch } from '../contracts/task';
import { createRepository } from '../data/repository';
import { MOCK_LISTS, MOCK_TASKS, buildWelcomeData } from '../mocks/tasks';

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

export interface AppState {
  ready: boolean;
  loadError: string | null;
  repoKind: 'tauri' | 'browser';
  dataPath: string;

  lists: List[];
  tasks: Task[];
  activeListId: string | null;
  selectedId: string | null;
  editingId: string | null;
  paletteOpen: boolean;
  settingsOpen: boolean;
  showCompleted: boolean;
  quality: QualityTier;
  /** Spheres float and the background drifts while the window is focused. */
  ambientMotion: boolean;
  /** Incremented to ask the task input to take focus. */
  inputFocusToken: number;
  toasts: Toast[];
  undoStack: UndoEntry[];

  init(): Promise<void>;
  addTask(raw: string): Promise<void>;
  updateTask(id: string, patch: TaskPatch): Promise<void>;
  toggleComplete(id: string): Promise<void>;
  deleteTask(id: string): Promise<void>;
  moveTask(id: string, direction: -1 | 1): Promise<void>;
  cyclePriority(id: string): Promise<void>;
  createList(name: string): Promise<void>;
  renameList(id: string, name: string): Promise<void>;
  deleteList(id: string): Promise<void>;
  undo(): Promise<void>;

  select(id: string | null): void;
  selectRelative(delta: -1 | 1): void;
  setActiveList(id: string): void;
  cycleList(delta: -1 | 1): void;
  openEditor(id: string | null): void;
  setPaletteOpen(open: boolean): void;
  setSettingsOpen(open: boolean): void;
  toggleShowCompleted(): void;
  setQuality(q: QualityTier): void;
  toggleAmbientMotion(): void;
  focusInput(): void;
  pushToast(t: Omit<Toast, 'id'>): void;
  dismissToast(id: number): void;
}

const UNDO_LIMIT = 50;
const QUALITY_KEY = 'wotask:quality';
const SHOW_COMPLETED_KEY = 'wotask:showCompleted';
const AMBIENT_KEY = 'wotask:ambientMotion';

let repo: TaskRepository = createRepository();
let toastSeq = 1;

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Active tasks by position, then completed tasks most-recent first. */
export function orderTasks(tasks: Task[], listId: string | null, showCompleted: boolean): Task[] {
  const inList = tasks.filter((t) => t.listId === listId);
  const active = inList.filter((t) => t.completedAt === null).sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
  if (!showCompleted) return active;
  const done = inList.filter((t) => t.completedAt !== null).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
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

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export const useStore = create<AppState>()((set, get) => {
  /**
   * Optimistic mutation: apply locally, persist, roll back on failure.
   * `inverse` (if given) is pushed onto the undo stack after a successful persist.
   */
  const commit = async (
    next: Partial<Pick<AppState, 'tasks' | 'lists'>>,
    persist: () => Promise<unknown>,
    undo?: UndoEntry,
  ): Promise<boolean> => {
    const prev = { tasks: get().tasks, lists: get().lists };
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

  const listOrder = (listId: string): Task[] => orderTasks(get().tasks, listId, true);

  const visible = (): Task[] => orderTasks(get().tasks, get().activeListId, get().showCompleted);

  return {
    ready: false,
    loadError: null,
    repoKind: repo.kind,
    dataPath: '',
    lists: [],
    tasks: [],
    activeListId: null,
    selectedId: null,
    editingId: null,
    paletteOpen: false,
    settingsOpen: false,
    showCompleted: readPref(SHOW_COMPLETED_KEY, ['true', 'false'], 'true') === 'true',
    quality: readPref<QualityTier>(QUALITY_KEY, ['high', 'medium', 'low'], 'high'),
    ambientMotion: readPref(AMBIENT_KEY, ['true', 'false'], 'true') === 'true',
    inputFocusToken: 0,
    toasts: [],
    undoStack: [],

    async init() {
      try {
        repo = createRepository();
        let lists = await repo.listLists();
        if (lists.length === 0) {
          const seed = import.meta.env.DEV ? { lists: MOCK_LISTS, tasks: MOCK_TASKS } : buildWelcomeData(Date.now());
          await repo.seed(seed.lists, seed.tasks);
          lists = await repo.listLists();
        }
        const [tasks, dataPath] = await Promise.all([repo.listTasks(), repo.dataPath()]);
        set({ lists, tasks, dataPath, repoKind: repo.kind, activeListId: lists[0]?.id ?? null, ready: true, loadError: null });
      } catch (e) {
        set({ ready: true, loadError: errorMessage(e) });
      }
    },

    async addTask(raw) {
      const { title, priority, tags } = parseQuickAdd(raw);
      const listId = get().activeListId;
      if (!title || !listId) return;
      const now = Date.now();
      const siblings = get().tasks.filter((t) => t.listId === listId);
      const position = siblings.length ? Math.min(...siblings.map((t) => t.position)) - 1 : 0;
      const task: Task = {
        id: newId(),
        listId,
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
      const before = listOrder(task.listId);
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
      await commit({ tasks: apply(ids) }, () => repo.reorderTasks(task.listId, ids), {
        label: 'Move task',
        run: async () => {
          await commit({ tasks: apply(prevIds) }, () => repo.reorderTasks(task.listId, prevIds));
        },
      });
    },

    async cyclePriority(id) {
      const t = get().tasks.find((x) => x.id === id);
      if (!t) return;
      await get().updateTask(id, { priority: ((t.priority + 1) % 4) as Priority });
    },

    async createList(name) {
      const trimmed = name.trim().slice(0, 80);
      if (!trimmed) return;
      const lists = get().lists;
      const list: List = {
        id: newId(),
        name: trimmed,
        color: PALETTE.listColors[lists.length % PALETTE.listColors.length],
        position: lists.length ? Math.max(...lists.map((l) => l.position)) + 1 : 0,
        createdAt: Date.now(),
      };
      const ok = await commit({ lists: [...lists, list] }, () => repo.createList(list), {
        label: 'Create list',
        run: async () => {
          await commit({ lists: get().lists.filter((l) => l.id !== list.id) }, () => repo.deleteList(list.id));
          if (get().activeListId === list.id) set({ activeListId: get().lists[0]?.id ?? null });
        },
      });
      if (ok) set({ activeListId: list.id, selectedId: null });
    },

    async renameList(id, name) {
      const prev = get().lists.find((l) => l.id === id);
      const trimmed = name.trim().slice(0, 80);
      if (!prev || !trimmed || trimmed === prev.name) return;
      const next = { ...prev, name: trimmed };
      await commit({ lists: get().lists.map((l) => (l.id === id ? next : l)) }, () => repo.updateList(next), {
        label: 'Rename list',
        run: async () => {
          await commit({ lists: get().lists.map((l) => (l.id === id ? prev : l)) }, () => repo.updateList(prev));
        },
      });
    },

    async deleteList(id) {
      const list = get().lists.find((l) => l.id === id);
      if (!list || get().lists.length <= 1) {
        get().pushToast({ kind: 'info', message: 'You need at least one list.' });
        return;
      }
      const removedTasks = get().tasks.filter((t) => t.listId === id);
      const remaining = get().lists.filter((l) => l.id !== id);
      if (get().activeListId === id) set({ activeListId: remaining[0]?.id ?? null, selectedId: null });
      const ok = await commit(
        { lists: remaining, tasks: get().tasks.filter((t) => t.listId !== id) },
        () => repo.deleteList(id),
        {
          label: 'Delete list',
          run: async () => {
            await commit(
              { lists: [...get().lists, list].sort((a, b) => a.position - b.position), tasks: [...get().tasks, ...removedTasks] },
              async () => {
                await repo.createList(list);
                for (const t of removedTasks) await repo.saveTask(t);
              },
            );
          },
        },
      );
      if (ok) {
        get().pushToast({ kind: 'info', message: `Deleted list “${list.name}”`, actionLabel: 'Undo', action: () => void get().undo() });
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

    setActiveList(id) {
      if (id === get().activeListId) return;
      set({ activeListId: id, selectedId: null, editingId: null });
    },

    cycleList(delta) {
      const lists = get().lists;
      if (lists.length === 0) return;
      const i = lists.findIndex((l) => l.id === get().activeListId);
      const next = (i + delta + lists.length) % lists.length;
      get().setActiveList(lists[next].id);
    },

    openEditor(id) {
      set({ editingId: id, selectedId: id ?? get().selectedId });
    },
    setPaletteOpen(open) {
      set({ paletteOpen: open });
    },
    setSettingsOpen(open) {
      set({ settingsOpen: open });
    },
    toggleShowCompleted() {
      const showCompleted = !get().showCompleted;
      try {
        localStorage.setItem(SHOW_COMPLETED_KEY, String(showCompleted));
      } catch {
        /* preference is best-effort */
      }
      set({ showCompleted });
    },
    setQuality(quality) {
      try {
        localStorage.setItem(QUALITY_KEY, quality);
      } catch {
        /* preference is best-effort */
      }
      set({ quality });
    },
    toggleAmbientMotion() {
      const ambientMotion = !get().ambientMotion;
      try {
        localStorage.setItem(AMBIENT_KEY, String(ambientMotion));
      } catch {
        /* preference is best-effort */
      }
      set({ ambientMotion });
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
