import { create } from 'zustand';
import type { QualityTier } from '../contracts/events';
import type { DataRepository } from '../contracts/repository';
import { PALETTE } from '../contracts/tokens';
import type { ChainIndex, ChainMeta, Priority, Space, SpaceKind, SpacePatch, Task, TaskPatch } from '../contracts/task';
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
  /**
   * A locked task the user tried to complete. The DOM shows the "Complete anyway" confirm; the lock
   * is soft, so this is a speed bump, not a refusal.
   */
  confirmCompleteId: string | null;
  /** Chain-link picker: the task waiting to be told what it comes after. */
  linkingFrom: string | null;
  /** Space awaiting delete confirmation. Deleting a space takes its tasks with it. */
  confirmDeleteSpaceId: string | null;
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
  /** Sets or clears `blockedBy`. Validates existence, same-space and cycles, explaining refusals. */
  linkTask(id: string, blockerId: string | null): Promise<void>;
  /** Completes a task despite its lock. The only path that does. */
  completeAnyway(id: string): Promise<void>;
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
  beginLinking(id: string | null): void;
  dismissCompleteConfirm(): void;
  /** Opens the delete confirmation, or explains inline when this is the last space. */
  requestDeleteSpace(id: string | null): void;
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

/* ------------------------------------------------------------------------------------------------
 * Chains.
 *
 * A task's `blockedBy` names the one task that must be finished first. Being *locked* is never
 * stored - it is derived from whether that blocker is still open, which is what makes reopening a
 * blocker re-lock its successors for free, without retracting any work the user did.
 *
 * Every traversal below is cycle-safe. `linkTask` refuses to create a cycle, but a hand-edited
 * database, a torn write or a future bug must degrade, not hang the render loop.
 * ---------------------------------------------------------------------------------------------- */

export type TaskIndex = ReadonlyMap<string, Task>;

export const indexById = (tasks: Task[]): TaskIndex => new Map(tasks.map((t) => [t.id, t]));

/** A task is locked while its blocker exists and is still open. A missing blocker never locks. */
export function isLocked(task: Task, byId: TaskIndex): boolean {
  if (task.blockedBy === null) return false;
  const blocker = byId.get(task.blockedBy);
  return blocker !== undefined && blocker.completedAt === null;
}

/** Completed while still blocked: either "Complete anyway", or the blocker was reopened afterwards. */
export const isOutOfOrder = (task: Task, byId: TaskIndex): boolean => task.completedAt !== null && isLocked(task, byId);

/** Would putting `taskId` after `blockerId` close a loop? Tolerant of data that is already cyclic. */
export function wouldCycle(taskId: string, blockerId: string, byId: TaskIndex): boolean {
  let cursor: string | null = blockerId;
  for (let hops = 0; cursor !== null && hops <= byId.size; hops++) {
    if (cursor === taskId) return true;
    cursor = byId.get(cursor)?.blockedBy ?? null;
  }
  // Ran out of hops without reaching a root: the existing links are cyclic, so refuse to add more.
  return cursor !== null;
}

const bySortKey = (a: Task, b: Task): number => a.position - b.position || a.createdAt - b.createdAt;

/** Successor ids keyed by blocker id, each list in display order. */
export function successorIndex(tasks: Task[]): Map<string, string[]> {
  const grouped = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.blockedBy === null) continue;
    const list = grouped.get(t.blockedBy);
    if (list) list.push(t);
    else grouped.set(t.blockedBy, [t]);
  }
  return new Map([...grouped].map(([k, v]) => [k, v.sort(bySortKey).map((t) => t.id)]));
}

/**
 * Chain metadata for every task that is part of a chain; loose tasks are absent.
 *
 * Must be built from the full, unfiltered task list. Built from one space's *visible* tasks instead,
 * a completed blocker that is currently hidden would vanish and `locked` would be right only by
 * accident. `App.tsx` memoises this on `tasks`.
 */
export function chainIndex(tasks: Task[]): ChainIndex {
  const byId = indexById(tasks);
  const kids = successorIndex(tasks);

  /** Distance to the chain root, memoised. Stops at a cycle instead of walking it forever. */
  const resolved = new Map<string, { depth: number; rootId: string }>();
  const resolve = (id: string): { depth: number; rootId: string } => {
    const path: string[] = [];
    const onPath = new Set<string>([id]);
    let cursor = id;
    let base: { depth: number; rootId: string };
    for (;;) {
      const memo = resolved.get(cursor);
      if (memo) {
        base = memo;
        break;
      }
      const parent = byId.get(cursor)?.blockedBy ?? null;
      // A root: no blocker, a blocker that no longer exists, or a link that closes a loop.
      if (parent === null || !byId.has(parent) || onPath.has(parent)) {
        base = { depth: 0, rootId: cursor };
        resolved.set(cursor, base);
        break;
      }
      onPath.add(parent);
      path.push(cursor);
      cursor = parent;
    }
    for (let i = path.length - 1; i >= 0; i--) {
      base = { depth: base.depth + 1, rootId: base.rootId };
      resolved.set(path[i], base);
    }
    return resolved.get(id) ?? base;
  };

  const out: Record<string, ChainMeta> = {};
  for (const t of tasks) {
    const successorIds = kids.get(t.id) ?? [];
    const blocker = t.blockedBy === null ? undefined : byId.get(t.blockedBy);
    if (blocker === undefined && successorIds.length === 0) continue;
    const { depth, rootId } = resolve(t.id);
    const locked = blocker !== undefined && blocker.completedAt === null;
    out[t.id] = {
      blockedBy: t.blockedBy,
      locked,
      outOfOrder: locked && t.completedAt !== null,
      depth,
      rootId,
      successorIds,
      unlockToken: blocker?.completedAt ?? 0,
    };
  }
  return out;
}

export interface ChainNode {
  task: Task;
  depth: number;
  children: ChainNode[];
}

/** The chain forest of one space, roots first. Loose tasks are omitted. Used by the DOM. */
export function chainsOf(tasks: Task[], spaceId: string): ChainNode[] {
  const inSpace = tasks.filter((t) => t.spaceId === spaceId);
  const byId = indexById(inSpace);
  const kids = successorIndex(inSpace);
  const seen = new Set<string>();
  const build = (task: Task, depth: number): ChainNode => {
    seen.add(task.id);
    const children = (kids.get(task.id) ?? [])
      .map((id) => byId.get(id))
      .filter((t): t is Task => t !== undefined && !seen.has(t.id))
      .map((t) => build(t, depth + 1));
    return { task, depth, children };
  };
  return inSpace
    .filter((t) => (t.blockedBy === null || !byId.has(t.blockedBy)) && (kids.get(t.id) ?? []).length > 0)
    .sort(bySortKey)
    .map((t) => build(t, 0));
}

/**
 * Tasks that may be chosen as the blocker of `id`: same space, not itself, and not already
 * downstream of it (which would close a loop). Drives the detail panel picker.
 */
export function linkCandidates(tasks: Task[], id: string): Task[] {
  const byId = indexById(tasks);
  const task = byId.get(id);
  if (!task) return [];
  return tasks.filter((t) => t.spaceId === task.spaceId && t.id !== id && !wouldCycle(id, t.id, byId)).sort(bySortKey);
}

/**
 * Display order for one space: active tasks depth-first so every chain is contiguous (a blocker
 * immediately followed by its subtree), then completed tasks, most recent first.
 *
 * This single order drives the spiral layout, up/down selection, label ranking and Alt+up/down, so
 * chains are laid out here rather than on a separate track - two orderings would mean two different
 * answers to "what comes next".
 */
export function orderTasks(tasks: Task[], spaceId: string | null, showCompleted: boolean): Task[] {
  const inSpace = tasks.filter((t) => t.spaceId === spaceId);
  const active = inSpace.filter((t) => t.completedAt === null);

  const present = new Set(active.map((t) => t.id));
  const kids = new Map<string, Task[]>();
  for (const t of active) {
    if (t.blockedBy === null || !present.has(t.blockedBy)) continue;
    const list = kids.get(t.blockedBy);
    if (list) list.push(t);
    else kids.set(t.blockedBy, [t]);
  }
  for (const list of kids.values()) list.sort(bySortKey);

  // A root here is anything nothing visible is holding back: no blocker, or a blocker that is
  // completed, deleted, or in another space.
  const roots = active.filter((t) => t.blockedBy === null || !present.has(t.blockedBy)).sort(bySortKey);

  const out: Task[] = [];
  const seen = new Set<string>();
  const walk = (task: Task): void => {
    if (seen.has(task.id)) return;
    seen.add(task.id);
    out.push(task);
    for (const child of kids.get(task.id) ?? []) walk(child);
  };
  for (const root of roots) walk(root);
  // Anything the walk never reached is inside a cycle. Append it so no task is ever invisible.
  for (const t of [...active].sort(bySortKey)) if (!seen.has(t.id)) out.push(t);

  if (!showCompleted) return out;
  const done = inSpace.filter((t) => t.completedAt !== null).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  return [...out, ...done];
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

  /**
   * Puts deleted or edited tasks back exactly as they were. Two passes, because `blockedBy` is a
   * self-referencing foreign key: writing a task whose blocker does not exist yet would violate it.
   */
  const restoreTasks = (tasks: Task[]) => async () => {
    const ids = new Set(tasks.map((t) => t.id));
    await commit({ tasks: [...get().tasks.filter((t) => !ids.has(t.id)), ...tasks] }, async () => {
      for (const t of tasks) await repo.saveTask({ ...t, blockedBy: null });
      for (const t of tasks) if (t.blockedBy !== null) await repo.saveTask(t);
    });
  };

  const spaceOrder = (spaceId: string): Task[] => orderTasks(get().tasks, spaceId, true);

  const visible = (): Task[] => orderTasks(get().tasks, get().activeSpaceId, get().showCompleted);

  /**
   * Rewrites `position` across one space from the current depth-first order, so a task that has just
   * been linked moves to its place in the chain immediately instead of on the next reorder.
   */
  const normaliseOrder = async (spaceId: string): Promise<void> => {
    const ids = spaceOrder(spaceId).map((t) => t.id);
    const pos = new Map(ids.map((id, i) => [id, i]));
    await commit(
      { tasks: get().tasks.map((t) => (pos.has(t.id) ? { ...t, position: pos.get(t.id) ?? t.position } : t)) },
      () => repo.reorderTasks(spaceId, ids),
    );
  };

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
    confirmCompleteId: null,
    linkingFrom: null,
    confirmDeleteSpaceId: null,
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
        blockedBy: null,
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
      const now = Date.now();
      const next: Task = { ...prev, ...patch, updatedAt: now };
      if (!next.title.trim()) return;

      // Chains never cross spaces: a link would have to be drawn between two independently placed
      // zones, which the scene cannot express. So moving a task out of its space cuts its links -
      // both the one above it and every one below. The alternative, dragging the whole subtree
      // along, would silently move tasks the user did not pick.
      const leavingSpace = next.spaceId !== prev.spaceId;
      const orphans = leavingSpace ? get().tasks.filter((t) => t.blockedBy === id) : [];
      const cut = leavingSpace && (prev.blockedBy !== null || orphans.length > 0);
      if (cut) next.blockedBy = null;

      const touched = [prev, ...orphans];
      const ok = await commit(
        {
          tasks: get().tasks.map((t) => {
            if (t.id === id) return next;
            return cut && t.blockedBy === id ? { ...t, blockedBy: null, updatedAt: now } : t;
          }),
        },
        async () => {
          await repo.saveTask(next);
          for (const o of orphans) await repo.saveTask({ ...o, blockedBy: null, updatedAt: now });
        },
        { label: 'Edit task', run: restoreTasks(touched) },
      );

      if (ok && cut) {
        const broken = orphans.length + (prev.blockedBy !== null ? 1 : 0);
        const space = get().spaces.find((g) => g.id === next.spaceId);
        get().pushToast({
          kind: 'info',
          message: `Moved to “${space?.name ?? 'another space'}” · ${broken} chain ${broken === 1 ? 'link' : 'links'} removed`,
          actionLabel: 'Undo',
          action: () => void get().undo(),
        });
      }
    },

    async toggleComplete(id) {
      const t = get().tasks.find((x) => x.id === id);
      if (!t) return;
      // Soft lock: refuse the quiet path and hand off to an explicit confirm, so completing a step
      // out of order is always a decision rather than an accident.
      if (t.completedAt === null && isLocked(t, indexById(get().tasks))) {
        set({ confirmCompleteId: id });
        return;
      }
      await get().updateTask(id, { completedAt: t.completedAt === null ? Date.now() : null });
    },

    async completeAnyway(id) {
      set({ confirmCompleteId: null });
      await get().updateTask(id, { completedAt: Date.now() });
    },

    async linkTask(id, blockerId) {
      const byId = indexById(get().tasks);
      const task = byId.get(id);
      if (!task) return;
      if (blockerId !== null) {
        const blocker = byId.get(blockerId);
        if (!blocker) return;
        if (blocker.spaceId !== task.spaceId) {
          notice(task.spaceId, `“${blocker.title}” is in another space. A chain stays inside one space.`);
          return;
        }
        if (blockerId === id || wouldCycle(id, blockerId, byId)) {
          notice(task.spaceId, `That would make a loop: “${blocker.title}” already comes after “${task.title}”.`);
          return;
        }
      }
      if ((task.blockedBy ?? null) === blockerId) {
        set({ linkingFrom: null });
        return;
      }
      await get().updateTask(id, { blockedBy: blockerId });
      set({ linkingFrom: null });
      await normaliseOrder(task.spaceId);
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
      // Deleting a blocker promotes its successors to chain roots rather than taking them with it.
      // SQLite does this through the self-FK's ON DELETE SET NULL; mirror it locally and in the
      // undo entry so the links come back if the delete is undone.
      const now = Date.now();
      const orphans = get().tasks.filter((t) => t.blockedBy === id);
      const ok = await commit(
        {
          tasks: get()
            .tasks.filter((t) => t.id !== id)
            .map((t) => (t.blockedBy === id ? { ...t, blockedBy: null, updatedAt: now } : t)),
        },
        async () => {
          await repo.deleteTask(id);
          for (const o of orphans) await repo.saveTask({ ...o, blockedBy: null, updatedAt: now });
        },
        { label: 'Delete task', run: restoreTasks([task, ...orphans]) },
      );
      if (ok) {
        get().pushToast({
          kind: 'info',
          message: `Deleted “${task.title.length > 40 ? `${task.title.slice(0, 40)}…` : task.title}”`,
          actionLabel: 'Undo',
          action: () => void get().undo(),
        });
      }
    },

    /**
     * Moves a task one place among its siblings, carrying its subtree.
     *
     * Siblings are the active tasks that share its blocker, so a chain root moves among the other
     * roots and a step moves among the steps that fork off the same task. Because `orderTasks`
     * re-derives the display order depth-first, swapping two raw positions would no longer move the
     * visible row by one - the swap has to happen inside the sibling group, and the whole space is
     * then renumbered from the resulting order.
     */
    async moveTask(id, direction) {
      const task = get().tasks.find((t) => t.id === id);
      if (!task || task.completedAt !== null) return;
      const before = spaceOrder(task.spaceId);
      const active = before.filter((t) => t.completedAt === null);
      const present = new Set(active.map((t) => t.id));
      // Match how `orderTasks` decides who is a root, so siblings here are the same group it walked.
      const groupOf = (t: Task): string | null => (t.blockedBy !== null && present.has(t.blockedBy) ? t.blockedBy : null);
      const group = groupOf(task);
      const siblings = active.filter((t) => groupOf(t) === group);

      const i = siblings.findIndex((t) => t.id === id);
      const j = i + direction;
      if (i < 0) return;
      if (j < 0 || j >= siblings.length) {
        get().pushToast({
          kind: 'info',
          message:
            siblings.length === 1 && group !== null
              ? `“${task.title}” is the only step after its blocker. Change what it comes after to move it.`
              : direction < 0
                ? 'Already first'
                : 'Already last',
        });
        return;
      }

      // Swap the two positions within the group, then renumber the space from the new walk order.
      const swap = new Map([
        [siblings[i].id, siblings[j].position],
        [siblings[j].id, siblings[i].position],
      ]);
      const nudged = get().tasks.map((t) => (swap.has(t.id) ? { ...t, position: swap.get(t.id) ?? t.position } : t));
      const ids = orderTasks(nudged, task.spaceId, true).map((t) => t.id);
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

    beginLinking(id) {
      set({ linkingFrom: id, confirmCompleteId: null });
    },
    requestDeleteSpace(id) {
      // The last-space guard explains itself inline; no point raising a dialog only to refuse.
      if (id !== null && !guardLast(id, 'delete')) return;
      set({ confirmDeleteSpaceId: id });
    },
    dismissCompleteConfirm() {
      set({ confirmCompleteId: null });
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
