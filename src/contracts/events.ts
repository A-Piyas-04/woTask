/** Every user-invokable action. Shortcuts and the command palette both map onto these. */
export type AppCommandId =
  | 'task.new'
  | 'task.toggleComplete'
  | 'task.delete'
  | 'task.edit'
  | 'task.moveUp'
  | 'task.moveDown'
  | 'task.cyclePriority'
  | 'selection.next'
  | 'selection.prev'
  | 'selection.clear'
  | 'list.next'
  | 'list.prev'
  | 'list.new'
  | 'history.undo'
  | 'palette.open'
  | 'view.toggleCompleted'
  | 'settings.open';

export interface AppCommand {
  id: AppCommandId;
  title: string;
  /** Human-readable shortcut, e.g. "Ctrl+K". */
  shortcut?: string;
}

export const COMMANDS: readonly AppCommand[] = [
  { id: 'task.new', title: 'New task', shortcut: 'N' },
  { id: 'task.toggleComplete', title: 'Complete / reopen task', shortcut: 'Space' },
  { id: 'task.edit', title: 'Edit task details', shortcut: 'Enter' },
  { id: 'task.delete', title: 'Delete task', shortcut: 'Del' },
  { id: 'task.moveUp', title: 'Move task up', shortcut: 'Alt+↑' },
  { id: 'task.moveDown', title: 'Move task down', shortcut: 'Alt+↓' },
  { id: 'task.cyclePriority', title: 'Cycle priority', shortcut: 'P' },
  { id: 'selection.next', title: 'Select next task', shortcut: '↓' },
  { id: 'selection.prev', title: 'Select previous task', shortcut: '↑' },
  { id: 'list.next', title: 'Next list', shortcut: 'Ctrl+→' },
  { id: 'list.prev', title: 'Previous list', shortcut: 'Ctrl+←' },
  { id: 'list.new', title: 'New list', shortcut: 'Ctrl+Shift+N' },
  { id: 'history.undo', title: 'Undo', shortcut: 'Ctrl+Z' },
  { id: 'view.toggleCompleted', title: 'Show / hide completed tasks', shortcut: 'H' },
  { id: 'settings.open', title: 'Settings', shortcut: 'Ctrl+,' },
  { id: 'palette.open', title: 'Command palette', shortcut: 'Ctrl+K' },
];

export type QualityTier = 'high' | 'medium' | 'low';
