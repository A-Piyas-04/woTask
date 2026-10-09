import { invoke } from '@tauri-apps/api/core';
import type { DataRepository } from '../contracts/repository';
import {
  SpaceArraySchema,
  SpaceSchema,
  TaskObjectSchema,
  type Space,
  type Task,
} from '../contracts/task';
import { z } from 'zod';

export const isTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/* ------------------------------------------------------------------------------------------------
 * The wire format.
 *
 * The domain calls them spaces; the wire — SQLite tables, Tauri command names, the localStorage blob
 * — still says `region`, because renaming those would mean rewriting tables in databases that
 * already hold real data for no behavioural gain. This file is the ONLY place that mapping exists.
 * Nothing above it should ever see the word `region`.
 *
 * A space row is structurally identical to `Space` — only the type name differed — so it needs no
 * mapper. The single real field rename is `Task.spaceId` <-> `regionId`, and the wire schema is
 * derived from `TaskObjectSchema` rather than written out, so a field added to the task contract
 * propagates here automatically and cannot drift.
 * ---------------------------------------------------------------------------------------------- */

const SpaceWireSchema = SpaceSchema;
const SpaceWireArraySchema = SpaceArraySchema;

const TaskWireSchema = TaskObjectSchema.omit({ spaceId: true }).extend({ regionId: z.string().min(1) });
const TaskWireArraySchema = z.array(TaskWireSchema);
type TaskWire = z.infer<typeof TaskWireSchema>;

const toTask = ({ regionId, ...rest }: TaskWire): Task => ({ ...rest, spaceId: regionId });
const toTaskWire = ({ spaceId, ...rest }: Task): TaskWire => ({ ...rest, regionId: spaceId });

/** Zod parses the wire shape in both directions; the mapping sits outside the parse. */
class TauriRepository implements DataRepository {
  readonly kind = 'tauri' as const;

  async getSpaces(): Promise<Space[]> {
    return SpaceWireArraySchema.parse(await invoke('get_regions'));
  }
  async createSpace(space: Space): Promise<Space> {
    return SpaceWireSchema.parse(await invoke('save_region', { region: SpaceWireSchema.parse(space) }));
  }
  async updateSpace(space: Space): Promise<Space> {
    return this.createSpace(space);
  }
  async deleteSpace(id: string): Promise<void> {
    await invoke('delete_region', { id });
  }
  async getTasks(): Promise<Task[]> {
    return TaskWireArraySchema.parse(await invoke('get_tasks')).map(toTask);
  }
  async saveTask(task: Task): Promise<Task> {
    const wire = TaskWireSchema.parse(toTaskWire(task));
    return toTask(TaskWireSchema.parse(await invoke('save_task', { task: wire })));
  }
  async deleteTask(id: string): Promise<void> {
    await invoke('delete_task', { id });
  }
  async reorderTasks(spaceId: string, orderedIds: string[]): Promise<void> {
    await invoke('reorder_tasks', { regionId: spaceId, orderedIds });
  }
  async seed(spaces: Space[], tasks: Task[]): Promise<void> {
    await invoke('seed', {
      regions: SpaceWireArraySchema.parse(spaces),
      tasks: TaskWireArraySchema.parse(tasks.map(toTaskWire)),
    });
  }
  async dataPath(): Promise<string> {
    return String(await invoke('data_path'));
  }
}

export const BROWSER_STORAGE_KEY = 'wotask:v2';
/** Pre-space storage format; converted once, then removed. */
const LEGACY_STORAGE_KEY = 'wotask:v1';
/** v1 shipped eight hues. History: never follow the palette's current length. */
const LEGACY_HUE_COUNT = 8;

/** Wire-shaped, because older builds wrote this blob and must keep loading. */
interface BrowserDb {
  regions: Space[];
  tasks: TaskWire[];
}

function convertLegacy(raw: string): BrowserDb {
  const old = JSON.parse(raw) as {
    lists?: { id: string; name: string; position: number; createdAt: number }[];
    tasks?: (Omit<TaskWire, 'regionId'> & { listId: string })[];
  };
  const regions: Space[] = (old.lists ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    kind: 'category',
    description: null,
    colorIndex: ((g.position % LEGACY_HUE_COUNT) + LEGACY_HUE_COUNT) % LEGACY_HUE_COUNT,
    position: g.position,
    targetDate: null,
    createdAt: g.createdAt,
    archivedAt: null,
  }));
  const tasks: TaskWire[] = (old.tasks ?? []).map(({ listId, ...t }) => ({ ...t, regionId: listId, blockedBy: null }));
  return { regions: SpaceWireArraySchema.parse(regions), tasks: TaskWireArraySchema.parse(tasks) };
}

/** Used when running in a plain browser tab (`npm run dev`). */
class BrowserRepository implements DataRepository {
  readonly kind = 'browser' as const;

  constructor(private readonly key: string) {
    if (key !== BROWSER_STORAGE_KEY) return;
    try {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy && !localStorage.getItem(BROWSER_STORAGE_KEY)) {
        this.write(convertLegacy(legacy));
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    } catch {
      /* unreadable legacy data is left in place untouched */
    }
  }

  /**
   * "Nothing stored" and "stored but unparseable" are different answers and must stay different.
   * Returning an empty database for the second one is a silent data-wipe: the caller would show an
   * empty universe, and the very next mutation would `write()` over data that was merely unreadable.
   * So an unreadable blob throws, and `init()` surfaces it as a load error instead.
   */
  private read(): BrowserDb {
    const raw = localStorage.getItem(this.key);
    if (!raw) return { regions: [], tasks: [] };
    const obj = JSON.parse(raw) as { regions?: unknown; tasks?: unknown };
    return { regions: SpaceWireArraySchema.parse(obj.regions ?? []), tasks: TaskWireArraySchema.parse(obj.tasks ?? []) };
  }
  private write(db: BrowserDb): void {
    localStorage.setItem(this.key, JSON.stringify(db));
  }

  async getSpaces(): Promise<Space[]> {
    return [...this.read().regions].sort((a, b) => a.position - b.position);
  }
  async createSpace(space: Space): Promise<Space> {
    const db = this.read();
    db.regions = [...db.regions.filter((g) => g.id !== space.id), SpaceWireSchema.parse(space)];
    this.write(db);
    return space;
  }
  async updateSpace(space: Space): Promise<Space> {
    return this.createSpace(space);
  }
  async deleteSpace(id: string): Promise<void> {
    const db = this.read();
    const dropped = new Set(db.tasks.filter((t) => t.regionId === id).map((t) => t.id));
    db.regions = db.regions.filter((g) => g.id !== id);
    db.tasks = db.tasks
      .filter((t) => t.regionId !== id)
      // Mirrors `blocked_by ... ON DELETE SET NULL`. Chains cannot cross spaces, so this should
      // never fire; it is here so the two repositories cannot disagree if that ever changes.
      .map((t) => (t.blockedBy !== null && dropped.has(t.blockedBy) ? { ...t, blockedBy: null } : t));
    this.write(db);
  }
  async getTasks(): Promise<Task[]> {
    return this.read().tasks.map(toTask);
  }
  async saveTask(task: Task): Promise<Task> {
    const db = this.read();
    const valid = TaskWireSchema.parse(toTaskWire(task));
    db.tasks = [...db.tasks.filter((t) => t.id !== task.id), valid];
    this.write(db);
    return toTask(valid);
  }
  async deleteTask(id: string): Promise<void> {
    const db = this.read();
    // Mirrors the self-FK's `ON DELETE SET NULL`: a blocker's successors are orphaned, never deleted.
    db.tasks = db.tasks
      .filter((t) => t.id !== id)
      .map((t) => (t.blockedBy === id ? { ...t, blockedBy: null } : t));
    this.write(db);
  }
  async reorderTasks(spaceId: string, orderedIds: string[]): Promise<void> {
    const db = this.read();
    const index = new Map(orderedIds.map((id, i) => [id, i]));
    db.tasks = db.tasks.map((t) => (t.regionId === spaceId && index.has(t.id) ? { ...t, position: index.get(t.id) ?? t.position } : t));
    this.write(db);
  }
  async seed(spaces: Space[], tasks: Task[]): Promise<void> {
    if (this.read().regions.length > 0) return;
    this.write({
      regions: SpaceWireArraySchema.parse(spaces),
      tasks: TaskWireArraySchema.parse(tasks.map(toTaskWire)),
    });
  }
  async dataPath(): Promise<string> {
    return 'Browser localStorage (development mode)';
  }
}

/** `browserKey` lets dev test fixtures use an isolated localStorage slot. */
export function createRepository(browserKey: string = BROWSER_STORAGE_KEY): DataRepository {
  return isTauri() ? new TauriRepository() : new BrowserRepository(browserKey);
}

export const windowControls = {
  minimize: () => (isTauri() ? invoke('window_minimize') : Promise.resolve()),
  toggleMaximize: () => (isTauri() ? invoke<boolean>('window_toggle_maximize') : Promise.resolve(false)),
  close: () => (isTauri() ? invoke('window_close') : Promise.resolve()),
};
