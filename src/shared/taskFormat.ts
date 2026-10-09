const DAY = 86_400_000;

const startOfDay = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export interface DueLabel {
  text: string;
  tone: 'overdue' | 'today' | 'soon' | 'later';
}

export function formatDue(dueAt: number | null, now: number = Date.now()): DueLabel | null {
  if (dueAt === null) return null;
  const days = Math.round((startOfDay(dueAt) - startOfDay(now)) / DAY);
  if (days < 0) return { text: days === -1 ? 'Yesterday' : `${-days}d overdue`, tone: 'overdue' };
  if (days === 0) return { text: 'Today', tone: 'today' };
  if (days === 1) return { text: 'Tomorrow', tone: 'soon' };
  if (days < 7) return { text: new Date(dueAt).toLocaleDateString(undefined, { weekday: 'short' }), tone: 'soon' };
  return { text: new Date(dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), tone: 'later' };
}
