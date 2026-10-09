import { useEffect } from 'react';
import type { AppCommandId } from '../contracts/events';
import { useStore, visibleRegions } from '../state/store';

export const NEW_REGION_EVENT = 'wotask:new-region';

export function runCommand(id: AppCommandId): void {
  const s = useStore.getState();
  const sel = s.selectedId;
  switch (id) {
    case 'task.new':
      s.focusInput();
      return;
    case 'task.toggleComplete':
      if (sel) void s.toggleComplete(sel);
      return;
    case 'task.delete':
      if (sel) void s.deleteTask(sel);
      return;
    case 'task.edit':
      if (sel) s.openEditor(sel);
      return;
    case 'task.moveUp':
      if (sel) void s.moveTask(sel, -1);
      return;
    case 'task.moveDown':
      if (sel) void s.moveTask(sel, 1);
      return;
    case 'task.cyclePriority':
      if (sel) void s.cyclePriority(sel);
      return;
    case 'selection.next':
      s.selectRelative(1);
      return;
    case 'selection.prev':
      s.selectRelative(-1);
      return;
    case 'selection.clear':
      s.select(null);
      return;
    case 'region.next':
      s.cycleRegion(1);
      return;
    case 'region.prev':
      s.cycleRegion(-1);
      return;
    case 'region.new':
      window.dispatchEvent(new Event(NEW_REGION_EVENT));
      return;
    case 'history.undo':
      void s.undo();
      return;
    case 'palette.open':
      s.setPaletteOpen(true);
      return;
    case 'view.toggleCompleted':
      s.toggleShowCompleted();
      return;
    case 'settings.open':
      s.setSettingsOpen(true);
      return;
    case 'view.shortcuts':
      s.setShortcutsOpen(!s.shortcutsOpen);
      return;
  }
}

const isEditable = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');

function handleKey(e: KeyboardEvent): void {
  // Never interfere with IME composition (Bangla, CJK, ...).
  if (e.isComposing || e.keyCode === 229) return;

  const s = useStore.getState();
  // First run: the onboarding card owns the keyboard until a region exists.
  if (s.regions.length === 0) return;
  const ctrl = e.ctrlKey || e.metaKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const run = (id: AppCommandId) => {
    e.preventDefault();
    runCommand(id);
  };

  if (ctrl && key === 'k') {
    e.preventDefault();
    s.setPaletteOpen(!s.paletteOpen);
    return;
  }
  if (ctrl && key === ',') return run('settings.open');

  if (e.key === 'Escape') {
    if (s.paletteOpen) return s.setPaletteOpen(false);
    if (s.settingsOpen) return s.setSettingsOpen(false);
    if (s.shortcutsOpen) return s.setShortcutsOpen(false);
    if (isEditable(e.target)) {
      (e.target as HTMLElement).blur();
      return;
    }
    if (s.editingId) return s.openEditor(null);
    if (s.creatingRegion) return s.setCreatingRegion(false);
    if (s.editingRegionId) return s.openRegionEditor(null);
    return run('selection.clear');
  }

  if (isEditable(e.target) || s.paletteOpen || s.settingsOpen) return;
  if (e.key === '?') return run('view.shortcuts');
  if (s.shortcutsOpen) return;
  // Let focused buttons handle their own activation keys.
  if (e.target instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' ')) return;

  if (ctrl && e.shiftKey && key === 'n') return run('region.new');
  if (ctrl && key === 'z') return run('history.undo');
  if (ctrl && key === 'n') return run('task.new');
  if (ctrl && e.key === 'ArrowRight') return run('region.next');
  if (ctrl && e.key === 'ArrowLeft') return run('region.prev');
  if (ctrl && /^[1-9]$/.test(e.key)) {
    const region = visibleRegions(s.regions)[Number(e.key) - 1];
    if (region) {
      e.preventDefault();
      s.setActiveRegion(region.id);
    }
    return;
  }
  if (ctrl) return;

  if (e.altKey && e.key === 'ArrowUp') return run('task.moveUp');
  if (e.altKey && e.key === 'ArrowDown') return run('task.moveDown');
  if (e.altKey) return;

  switch (key) {
    case 'ArrowDown':
    case 'j':
      return run('selection.next');
    case 'ArrowUp':
    case 'k':
      return run('selection.prev');
    case ' ':
    case 'x':
      return run('task.toggleComplete');
    case 'Enter':
    case 'e':
      return run('task.edit');
    case 'Delete':
    case 'Backspace':
      return run('task.delete');
    case 'n':
      return run('task.new');
    case 'p':
      return run('task.cyclePriority');
    case 'h':
      return run('view.toggleCompleted');
    case '/':
      return run('palette.open');
  }
}

export function useGlobalShortcuts(): void {
  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);
}
