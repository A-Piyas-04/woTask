import { invoke } from '@tauri-apps/api/core';
import type { TaskRepository } from '../contracts/repository';
import { RegionArraySchema, RegionSchema, TaskArraySchema, TaskSchema, type Region, type Task } from '../contracts/task';

export const isTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

class TauriRepository implements TaskRepository {
  readonly kind = 'tauri' as const;

  async getRegions(): Promise<Region[]> {
    return RegionArraySchema.parse(await invoke('get_regions'));
  }
  async createRegion(region: Region): Promise<Region> {
    return RegionSchema.parse(await invoke('save_region', { region: RegionSchema.parse(region) }));
  }
  async updateRegion(region: Region): Promise<Region> {
    return this.createRegion(region);
  }
  async deleteRegion(id: string): Promise<void> {
    await invoke('delete_region', { id });
  }
  async getTasks(): Promise<Task[]> {
    return TaskArraySchema.parse(await invoke('get_tasks'));
  }
  async saveTask(task: Task): Promise<Task> {
    return TaskSchema.parse(await invoke('save_task', { task: TaskSchema.parse(task) }));
  }
  async deleteTask(id: string): Promise<void> {
    await invoke('delete_task', { id });
  }
  async reorderTasks(regionId: string, orderedIds: string[]): Promise<void> {
    await invoke('reorder_tasks', { regionId, orderedIds });
  }
  async seed(regions: Region[], tasks: Task[]): Promise<void> {
    await invoke('seed', { regions: RegionArraySchema.parse(regions), tasks: TaskArraySchema.parse(tasks) });
  }
  async dataPath(): Promise<string> {
    return String(await invoke('data_path'));
  }
}

export const BROWSER_STORAGE_KEY = 'wotask:v2';
/** Pre-region storage format; converted once, then removed. */
const LEGACY_STORAGE_KEY = 'wotask:v1';
const LEGACY_HUE_COUNT = 8;

interface BrowserDb {
  regions: Region[];
  tasks: Task[];
}

function convertLegacy(raw: string): BrowserDb {
  const old = JSON.parse(raw) as {
    lists?: { id: string; name: string; position: number; createdAt: number }[];
    tasks?: (Omit<Task, 'regionId'> & { listId: string })[];
  };
  const regions: Region[] = (old.lists ?? []).map((g) => ({
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
  const tasks: Task[] = (old.tasks ?? []).map(({ listId, ...t }) => ({ ...t, regionId: listId }));
  return { regions: RegionArraySchema.parse(regions), tasks: TaskArraySchema.parse(tasks) };
}

/** Used when running in a plain browser tab (`npm run dev`). */
class BrowserRepository implements TaskRepository {
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

  private read(): BrowserDb {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return { regions: [], tasks: [] };
      const obj = JSON.parse(raw) as { regions?: unknown; tasks?: unknown };
      return { regions: RegionArraySchema.parse(obj.regions ?? []), tasks: TaskArraySchema.parse(obj.tasks ?? []) };
    } catch {
      return { regions: [], tasks: [] };
    }
  }
  private write(db: BrowserDb): void {
    localStorage.setItem(this.key, JSON.stringify(db));
  }

  async getRegions(): Promise<Region[]> {
    return [...this.read().regions].sort((a, b) => a.position - b.position);
  }
  async createRegion(region: Region): Promise<Region> {
    const db = this.read();
    db.regions = [...db.regions.filter((g) => g.id !== region.id), RegionSchema.parse(region)];
    this.write(db);
    return region;
  }
  async updateRegion(region: Region): Promise<Region> {
    return this.createRegion(region);
  }
  async deleteRegion(id: string): Promise<void> {
    const db = this.read();
    db.regions = db.regions.filter((g) => g.id !== id);
    db.tasks = db.tasks.filter((t) => t.regionId !== id);
    this.write(db);
  }
  async getTasks(): Promise<Task[]> {
    return this.read().tasks;
  }
  async saveTask(task: Task): Promise<Task> {
    const db = this.read();
    const valid = TaskSchema.parse(task);
    db.tasks = [...db.tasks.filter((t) => t.id !== task.id), valid];
    this.write(db);
    return valid;
  }
  async deleteTask(id: string): Promise<void> {
    const db = this.read();
    db.tasks = db.tasks.filter((t) => t.id !== id);
    this.write(db);
  }
  async reorderTasks(regionId: string, orderedIds: string[]): Promise<void> {
    const db = this.read();
    const index = new Map(orderedIds.map((id, i) => [id, i]));
    db.tasks = db.tasks.map((t) => (t.regionId === regionId && index.has(t.id) ? { ...t, position: index.get(t.id) ?? t.position } : t));
    this.write(db);
  }
  async seed(regions: Region[], tasks: Task[]): Promise<void> {
    if (this.read().regions.length > 0) return;
    this.write({ regions: RegionArraySchema.parse(regions), tasks: TaskArraySchema.parse(tasks) });
  }
  async dataPath(): Promise<string> {
    return 'Browser localStorage (development mode)';
  }
}

/** `browserKey` lets dev test fixtures use an isolated localStorage slot. */
export function createRepository(browserKey: string = BROWSER_STORAGE_KEY): TaskRepository {
  return isTauri() ? new TauriRepository() : new BrowserRepository(browserKey);
}

export const windowControls = {
  minimize: () => (isTauri() ? invoke('window_minimize') : Promise.resolve()),
  toggleMaximize: () => (isTauri() ? invoke<boolean>('window_toggle_maximize') : Promise.resolve(false)),
  close: () => (isTauri() ? invoke('window_close') : Promise.resolve()),
};
