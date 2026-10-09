import { invoke } from '@tauri-apps/api/core';
import type { TaskRepository } from '../contracts/repository';
import { ListArraySchema, ListSchema, TaskArraySchema, TaskSchema, type List, type Task } from '../contracts/task';

export const isTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

class TauriRepository implements TaskRepository {
  readonly kind = 'tauri' as const;

  async listLists(): Promise<List[]> {
    return ListArraySchema.parse(await invoke('list_lists'));
  }
  async createList(list: List): Promise<List> {
    return ListSchema.parse(await invoke('save_list', { list: ListSchema.parse(list) }));
  }
  async updateList(list: List): Promise<List> {
    return this.createList(list);
  }
  async deleteList(id: string): Promise<void> {
    await invoke('delete_list', { id });
  }
  async listTasks(): Promise<Task[]> {
    return TaskArraySchema.parse(await invoke('list_tasks'));
  }
  async saveTask(task: Task): Promise<Task> {
    return TaskSchema.parse(await invoke('save_task', { task: TaskSchema.parse(task) }));
  }
  async deleteTask(id: string): Promise<void> {
    await invoke('delete_task', { id });
  }
  async reorderTasks(listId: string, orderedIds: string[]): Promise<void> {
    await invoke('reorder_tasks', { listId, orderedIds });
  }
  async seed(lists: List[], tasks: Task[]): Promise<void> {
    await invoke('seed', { lists: ListArraySchema.parse(lists), tasks: TaskArraySchema.parse(tasks) });
  }
  async dataPath(): Promise<string> {
    return String(await invoke('data_path'));
  }
}

const STORAGE_KEY = 'wotask:v1';

interface BrowserDb {
  lists: List[];
  tasks: Task[];
}

/** Used when running in a plain browser tab (`npm run dev`). */
class BrowserRepository implements TaskRepository {
  readonly kind = 'browser' as const;

  private read(): BrowserDb {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { lists: [], tasks: [] };
      const parsed: unknown = JSON.parse(raw);
      const obj = parsed as { lists?: unknown; tasks?: unknown };
      return { lists: ListArraySchema.parse(obj.lists ?? []), tasks: TaskArraySchema.parse(obj.tasks ?? []) };
    } catch {
      return { lists: [], tasks: [] };
    }
  }
  private write(db: BrowserDb): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }

  async listLists(): Promise<List[]> {
    return [...this.read().lists].sort((a, b) => a.position - b.position);
  }
  async createList(list: List): Promise<List> {
    const db = this.read();
    db.lists = [...db.lists.filter((l) => l.id !== list.id), ListSchema.parse(list)];
    this.write(db);
    return list;
  }
  async updateList(list: List): Promise<List> {
    return this.createList(list);
  }
  async deleteList(id: string): Promise<void> {
    const db = this.read();
    db.lists = db.lists.filter((l) => l.id !== id);
    db.tasks = db.tasks.filter((t) => t.listId !== id);
    this.write(db);
  }
  async listTasks(): Promise<Task[]> {
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
  async reorderTasks(listId: string, orderedIds: string[]): Promise<void> {
    const db = this.read();
    const index = new Map(orderedIds.map((id, i) => [id, i]));
    db.tasks = db.tasks.map((t) => (t.listId === listId && index.has(t.id) ? { ...t, position: index.get(t.id) ?? t.position } : t));
    this.write(db);
  }
  async seed(lists: List[], tasks: Task[]): Promise<void> {
    if (this.read().lists.length > 0) return;
    this.write({ lists: ListArraySchema.parse(lists), tasks: TaskArraySchema.parse(tasks) });
  }
  async dataPath(): Promise<string> {
    return 'Browser localStorage (development mode)';
  }
}

export function createRepository(): TaskRepository {
  return isTauri() ? new TauriRepository() : new BrowserRepository();
}

export const windowControls = {
  minimize: () => (isTauri() ? invoke('window_minimize') : Promise.resolve()),
  toggleMaximize: () => (isTauri() ? invoke<boolean>('window_toggle_maximize') : Promise.resolve(false)),
  close: () => (isTauri() ? invoke('window_close') : Promise.resolve()),
};
