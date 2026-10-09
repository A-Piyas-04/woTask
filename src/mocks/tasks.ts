import type { Priority, Region, RegionKind, Task } from '../contracts/task';

const DAY = 86_400_000;
const HOUR = 3_600_000;

type Seed = [title: string, priority: Priority, dueInDays: number | null, done: boolean, tags: string[], notes?: string];

interface RegionSeed {
  id: string;
  name: string;
  kind: RegionKind;
  description: string | null;
  targetInDays: number | null;
  tasks: Seed[];
}

const DEMO: RegionSeed[] = [
  {
    id: 'region-launch',
    name: 'Product Launch',
    kind: 'project',
    description: 'Ship woTask 1.0 to the first hundred users.',
    targetInDays: null,
    tasks: [
      ['Finalise pricing page copy', 3, 2, false, ['marketing'], 'Two tiers only.\nNo annual discount yet.'],
      ['Record the 60-second demo video', 2, 5, false, ['marketing']],
      ['Fix crash when importing an empty CSV', 3, -1, false, ['bug']],
      ['Write release notes', 1, 6, false, ['docs']],
      ['ল্যান্ডিং পেজের বাংলা অনুবাদ', 2, 8, false, ['i18n']],
      ['Set up the support inbox', 1, 4, false, []],
      ['Beta feedback round 2', 0, null, true, ['research']],
      ['Code-sign the installer', 2, 3, false, ['build']],
      ['Draft launch tweet thread', 0, null, false, ['marketing']],
      ['Load-test sync with 10k tasks', 1, 9, true, ['perf']],
    ],
  },
  {
    id: 'region-health',
    name: 'Health',
    kind: 'goal',
    description: 'Run a 10K without stopping by the end of the year.',
    targetInDays: 45,
    tasks: [
      ['Run 5 km three times this week', 3, 3, false, ['running']],
      ['Book the annual check-up', 2, -2, false, ['admin']],
      ['সকালে ২০ মিনিট হাঁটা', 1, 0, true, ['habit']],
      ['Buy proper running shoes', 1, null, true, ['gear']],
      ['Stretching routine after every run', 0, null, false, ['habit']],
      ['Sleep before midnight for 7 days', 2, 7, false, ['sleep']],
      ['First 8 km long run', 2, 14, false, ['running']],
      ['Register for the December 10K', 1, 20, false, []],
    ],
  },
  {
    id: 'region-study',
    name: 'পড়াশোনা',
    kind: 'category',
    description: 'Courses, reading and exam prep.',
    targetInDays: null,
    tasks: [
      ['Linear algebra — chapter 4 exercises', 2, 2, false, ['math']],
      ['পদার্থবিজ্ঞান নোট গুছিয়ে রাখা', 1, null, false, ['physics']],
      ['Finish "Designing Data-Intensive Applications" ch. 7', 1, 10, false, ['reading']],
      ['Submit the statistics assignment', 3, 1, false, ['stats']],
      ['Watch the MIT lecture on eigenvalues', 0, null, true, ['math']],
      ['Flashcards: 30 new words', 0, 0, false, ['language']],
      ['ইংরেজি রচনা লেখার অনুশীলন', 1, 4, false, ['writing']],
    ],
  },
  {
    id: 'region-backlog',
    name: 'Backlog',
    kind: 'category',
    description: null,
    targetInDays: null,
    tasks: [
      ['A 3D task manager that feels like glass', 2, null, false, ['idea']],
      ['Learn to cook bhuna khichuri', 0, null, false, ['food']],
      ['Weekend photography walk in Old Dhaka', 1, null, false, ['photo']],
      ['Build a small mechanical keyboard', 0, null, false, ['hardware']],
      [
        'A very long idea title to make sure that wrapping and truncation behave sensibly when someone writes an essay into the quick-add field',
        0,
        null,
        false,
        [],
      ],
      ['Write letters to old friends', 0, null, true, []],
    ],
  },
];

function build(seeds: RegionSeed[], now: number): { regions: Region[]; tasks: Task[] } {
  const regions: Region[] = seeds.map((g, i) => ({
    id: g.id,
    name: g.name,
    kind: g.kind,
    description: g.description,
    colorIndex: i % 8,
    position: i,
    targetDate: g.targetInDays === null ? null : now + g.targetInDays * DAY,
    createdAt: now - 30 * DAY,
    archivedAt: null,
  }));
  const tasks: Task[] = [];
  for (const g of seeds) {
    g.tasks.forEach(([title, priority, due, done, tags, notes], i) => {
      const createdAt = now - (40 - i) * HOUR;
      tasks.push({
        id: `${g.id}-task-${i}`,
        regionId: g.id,
        title,
        notes: notes ?? '',
        priority,
        dueAt: due === null ? null : now + due * DAY,
        completedAt: done ? now - (i + 1) * 600_000 : null,
        position: i,
        createdAt,
        updatedAt: createdAt,
        tags,
      });
    });
  }
  return { regions, tasks };
}

/** Development seed: four regions covering every kind, with Bangla text. */
export function buildDemoData(now: number): { regions: Region[]; tasks: Task[] } {
  return build(DEMO, now);
}

const P: Priority[] = [0, 1, 2, 3];

/** Dev-only fixtures selected with `?seed=<name>`, used by the UI and visual tests. */
export const FIXTURES: Record<string, (now: number) => { regions: Region[]; tasks: Task[] }> = {
  demo: buildDemoData,
  none: () => ({ regions: [], tasks: [] }),
  priorities: (now) =>
    build(
      [
        {
          id: 'region-priorities',
          name: 'Priorities',
          kind: 'project',
          description: null,
          targetInDays: null,
          tasks: P.map((p) => [`Priority ${p}`, p, null, false, []] satisfies Seed),
        },
      ],
      now,
    ),
  states: (now) =>
    build(
      [
        {
          id: 'region-states',
          name: 'States',
          kind: 'category',
          description: null,
          targetInDays: null,
          tasks: [
            ['Overdue task', 1, -2, false, []],
            ['Completed task', 1, null, true, []],
          ],
        },
      ],
      now,
    ),
  dense60: (now) =>
    build(
      [
        {
          id: 'region-dense',
          name: 'Dense',
          kind: 'project',
          description: null,
          targetInDays: null,
          tasks: Array.from({ length: 60 }, (_, i) => [`Dense task number ${i + 1}`, P[i % 4], i % 9 === 0 ? -1 : null, i % 7 === 0, []] satisfies Seed),
        },
      ],
      now,
    ),
  stress: (now) =>
    build(
      Array.from({ length: 10 }, (_, r) => ({
        id: `region-stress-${r}`,
        name: `Stress ${r + 1}`,
        kind: (['category', 'project', 'goal'] as const)[r % 3],
        description: null,
        targetInDays: r % 3 === 2 ? 30 : null,
        tasks: Array.from({ length: 50 }, (_, i) => [`Stress ${r + 1}.${i + 1}`, P[(i + r) % 4], null, i % 6 === 0, []] satisfies Seed),
      })),
      now,
    ),
};
