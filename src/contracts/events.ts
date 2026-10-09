/** Every user-invokable action. Shortcuts and the command palette both map onto these. */
export type AppCommandId =
  | 'task.new'
  | 'task.toggleComplete'
  | 'task.delete'
  | 'task.edit'
  | 'task.moveUp'
  | 'task.moveDown'
  | 'task.cyclePriority'
  | 'task.link'
  | 'task.unlink'
  | 'selection.next'
  | 'selection.prev'
  | 'selection.clear'
  | 'space.next'
  | 'space.prev'
  | 'space.new'
  | 'history.undo'
  | 'palette.open'
  | 'view.toggleCompleted'
  | 'view.shortcuts'
  | 'settings.open';

export type CommandGroup = 'Navigation' | 'Tasks' | 'Spaces' | 'View';

export interface AppCommand {
  id: AppCommandId;
  title: string;
  /** Human-readable shortcut, e.g. "Ctrl+K". Keys are separated by "+". */
  shortcut?: string;
  group: CommandGroup;
}

export const COMMANDS: readonly AppCommand[] = [
  { id: 'task.new', title: 'New task', shortcut: 'N', group: 'Tasks' },
  { id: 'task.toggleComplete', title: 'Complete / reopen task', shortcut: 'Space', group: 'Tasks' },
  { id: 'task.edit', title: 'Edit task details', shortcut: 'Enter', group: 'Tasks' },
  { id: 'task.delete', title: 'Delete task', shortcut: 'Del', group: 'Tasks' },
  { id: 'task.moveUp', title: 'Move task up', shortcut: 'Alt+↑', group: 'Tasks' },
  { id: 'task.moveDown', title: 'Move task down', shortcut: 'Alt+↓', group: 'Tasks' },
  { id: 'task.cyclePriority', title: 'Cycle priority', shortcut: 'P', group: 'Tasks' },
  { id: 'task.link', title: 'Chain after…', shortcut: 'L', group: 'Tasks' },
  { id: 'task.unlink', title: 'Unchain task', group: 'Tasks' },
  { id: 'selection.next', title: 'Select next task', shortcut: '↓', group: 'Navigation' },
  { id: 'selection.prev', title: 'Select previous task', shortcut: '↑', group: 'Navigation' },
  { id: 'selection.clear', title: 'Clear selection', shortcut: 'Esc', group: 'Navigation' },
  { id: 'space.next', title: 'Next space', shortcut: 'Ctrl+→', group: 'Spaces' },
  { id: 'space.prev', title: 'Previous space', shortcut: 'Ctrl+←', group: 'Spaces' },
  { id: 'space.new', title: 'New space', shortcut: 'Ctrl+Shift+N', group: 'Spaces' },
  { id: 'history.undo', title: 'Undo', shortcut: 'Ctrl+Z', group: 'Tasks' },
  { id: 'view.toggleCompleted', title: 'Show / hide completed tasks', shortcut: 'H', group: 'View' },
  { id: 'view.shortcuts', title: 'Keyboard shortcuts', shortcut: '?', group: 'View' },
  { id: 'settings.open', title: 'Settings', shortcut: 'Ctrl+,', group: 'View' },
  { id: 'palette.open', title: 'Command palette', shortcut: 'Ctrl+K', group: 'View' },
];

export type QualityTier = 'high' | 'medium' | 'low';
