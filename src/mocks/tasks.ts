import type { List, Priority, Task } from '../contracts/task';

const DAY = 86_400_000;
const BASE = Date.UTC(2026, 9, 9, 6, 0, 0);

export const MOCK_LISTS: List[] = [
  { id: 'list-inbox', name: 'Inbox', color: '#7c9cff', position: 0, createdAt: BASE },
  { id: 'list-work', name: 'Work', color: '#4fd1a5', position: 1, createdAt: BASE },
  { id: 'list-home', name: 'বাড়ি (Home)', color: '#ffb547', position: 2, createdAt: BASE },
  { id: 'list-ideas', name: 'Ideas', color: '#f472b6', position: 3, createdAt: BASE },
];

type Seed = [title: string, priority: Priority, dueInDays: number | null, done: boolean, tags: string[], notes?: string];

const SEEDS: Record<string, Seed[]> = {
  'list-inbox': [
    ['Reply to Rahim about the weekend trip', 2, 1, false, ['personal']],
    ['বাজার থেকে চাল, ডাল আর সবজি আনতে হবে', 1, 0, false, ['shopping']],
    ['Renew passport before the end of the month', 3, 12, false, ['admin'], 'Need two photos and the old passport.'],
    ['Call the bank', 2, 2, false, []],
    ['Pay electricity bill — বিদ্যুৎ বিল', 3, -1, false, ['bills']],
    ['Book dentist appointment', 1, 7, false, ['health']],
    ['Back up phone photos', 0, null, true, []],
    ['Read the article Nadia sent', 0, null, false, ['reading']],
    ['Return library book', 1, 3, true, []],
    ['Sort out the downloads folder', 0, null, false, []],
  ],
  'list-work': [
    ['Prepare Q4 roadmap slides for Monday review with leadership and product leads', 3, 3, false, ['planning'], 'Focus on the three bets.\nInclude risk table.'],
    ['Review pull request #482', 2, 0, false, ['code']],
    ['Write onboarding doc for new hires', 1, 10, false, ['docs']],
    ['Fix flaky integration test in CI', 2, 1, false, ['code', 'ci']],
    ['১:১ মিটিং — Tanvir', 1, 2, false, ['meetings']],
    ['Update dependencies', 0, 14, true, ['code']],
    ['Send invoice to client', 3, 0, false, ['finance']],
    ['Draft blog post on offline-first apps', 1, null, false, ['writing']],
    ['Clean up Jira backlog', 0, null, true, []],
    ['Benchmark SQLite query with 10k rows', 2, 5, false, ['perf']],
  ],
  'list-home': [
    ['Fix the leaking kitchen tap', 2, 2, false, ['repair']],
    ['মায়ের ওষুধ কিনতে হবে', 3, 0, false, ['family']],
    ['Water the plants', 0, 0, true, []],
    ['Organise the bookshelf', 0, null, false, []],
    ['Plan Eid dinner menu — ঈদের রান্নার তালিকা', 2, 20, false, ['family', 'food']],
    ['Change bedsheets', 0, 1, false, []],
    ['Replace the hallway bulb', 1, null, true, ['repair']],
    ['Pay internet bill', 2, 4, false, ['bills']],
    ['Deep clean the fridge', 0, 6, false, []],
    ['Take the bicycle for servicing', 1, 9, false, []],
  ],
  'list-ideas': [
    ['A 3D task manager that feels like glass', 3, null, false, ['product']],
    ['Learn to cook bhuna khichuri', 1, null, false, ['food']],
    ['Weekend photography walk in Old Dhaka', 1, null, false, ['photo']],
    ['Start a reading log', 0, null, true, ['reading']],
    ['নতুন ভাষা শেখা — maybe Japanese?', 0, null, false, ['learning']],
    ['Build a small mechanical keyboard', 1, null, false, ['hardware']],
    ['A very long idea title to make sure that wrapping and truncation behave sensibly when someone writes an essay into the quick-add field', 0, null, false, []],
    ['Write letters to old friends', 0, null, false, ['personal']],
    ['Try a 30-day sketching challenge', 1, null, false, ['art']],
    ['Volunteer at the local library', 0, null, false, []],
  ],
};

export function buildMockTasks(): Task[] {
  const tasks: Task[] = [];
  for (const [listId, seeds] of Object.entries(SEEDS)) {
    seeds.forEach(([title, priority, due, done, tags, notes], i) => {
      const createdAt = BASE - (40 - i) * 3_600_000;
      tasks.push({
        id: `${listId}-task-${i}`,
        listId,
        title,
        notes: notes ?? '',
        priority,
        dueAt: due === null ? null : BASE + due * DAY,
        completedAt: done ? BASE - i * 600_000 : null,
        position: i,
        createdAt,
        updatedAt: createdAt,
        tags,
      });
    });
  }
  return tasks;
}

export const MOCK_TASKS: Task[] = buildMockTasks();

/** What a brand-new user sees on first launch of a release build. */
export function buildWelcomeData(now: number): { lists: List[]; tasks: Task[] } {
  const lists: List[] = [
    { id: 'inbox', name: 'Inbox', color: '#7c9cff', position: 0, createdAt: now },
    { id: 'personal', name: 'Personal', color: '#4fd1a5', position: 1, createdAt: now },
  ];
  const titles: [string, Priority][] = [
    ['Welcome to woTask — click a sphere to select it', 2],
    ['Click it again (or press Space) to complete it', 1],
    ['Drag anywhere to explore, scroll to zoom', 1],
    ['Press N to add a task, Ctrl+K for commands', 1],
    ['বাংলাতেও লিখতে পারবেন — Bangla works too', 0],
    ['Double-click or Enter to edit, Del to delete, Ctrl+Z undo', 0],
  ];
  const tasks: Task[] = titles.map(([title, priority], i) => ({
    id: `welcome-${i}`,
    listId: 'inbox',
    title,
    notes: '',
    priority,
    dueAt: null,
    completedAt: null,
    position: i,
    createdAt: now,
    updatedAt: now,
    tags: [],
  }));
  return { lists, tasks };
}
