import type { Priority, Space, SpaceKind, Task } from '../contracts/task';

const DAY = 86_400_000;
const HOUR = 3_600_000;

type Seed = [title: string, priority: Priority, dueInDays: number | null, done: boolean, tags: string[], notes?: string];

interface SpaceSeed {
  id: string;
  name: string;
  kind: SpaceKind;
  description: string | null;
  targetInDays: number | null;
  tasks: Seed[];
  /** Chain links as `{ successorIndex: blockerIndex }`, both indices into `tasks`. */
  chains?: Record<number, number>;
}

const DEMO: SpaceSeed[] = [
  {
    id: 'space-launch',
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
    // The pricing copy gates both the translation and the demo video; the tweet thread waits on the video.
    chains: { 4: 0, 1: 0, 8: 1 },
  },
  {
    id: 'space-health',
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
    // A straight run-up to the race.
    chains: { 6: 0, 7: 6 },
  },
  {
    id: 'space-study',
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
    id: 'space-backlog',
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

function build(seeds: SpaceSeed[], now: number): { spaces: Space[]; tasks: Task[] } {
  const spaces: Space[] = seeds.map((g, i) => ({
    id: g.id,
    name: g.name,
    kind: g.kind,
    description: g.description,
    colorIndex: i,
    position: i,
    targetDate: g.targetInDays === null ? null : now + g.targetInDays * DAY,
    createdAt: now - 30 * DAY,
    archivedAt: null,
  }));
  const tasks: Task[] = [];
  for (const g of seeds) {
    const blocker = (i: number): string | null => {
      const from = g.chains?.[i];
      return from === undefined ? null : `${g.id}-task-${from}`;
    };
    g.tasks.forEach(([title, priority, due, done, tags, notes], i) => {
      const createdAt = now - (40 - i) * HOUR;
      tasks.push({
        id: `${g.id}-task-${i}`,
        spaceId: g.id,
        title,
        notes: notes ?? '',
        priority,
        dueAt: due === null ? null : now + due * DAY,
        completedAt: done ? now - (i + 1) * 600_000 : null,
        position: i,
        createdAt,
        updatedAt: createdAt,
        tags,
        blockedBy: blocker(i),
      });
    });
  }
  return { spaces, tasks };
}

/** Development seed: four spaces covering every kind, with Bangla text. */
export function buildDemoData(now: number): { spaces: Space[]; tasks: Task[] } {
  return build(DEMO, now);
}

const P: Priority[] = [0, 1, 2, 3];

/** Dev-only fixtures selected with `?seed=<name>`, used by the UI and visual tests. */
export const FIXTURES: Record<string, (now: number) => { spaces: Space[]; tasks: Task[] }> = {
  demo: buildDemoData,
  none: () => ({ spaces: [], tasks: [] }),
  priorities: (now) =>
    build(
      [
        {
          id: 'space-priorities',
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
          id: 'space-states',
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
          id: 'space-dense',
          name: 'Dense',
          kind: 'project',
          description: null,
          targetInDays: null,
          tasks: Array.from({ length: 60 }, (_, i) => [`Dense task number ${i + 1}`, P[i % 4], i % 9 === 0 ? -1 : null, i % 7 === 0, []] satisfies Seed),
        },
      ],
      now,
    ),
  /** Kinds interleaved in creation order, so a new project reorders the categories after it. */
  reorder: (now) =>
    build(
      (
        [
          ['SQLens', 'project', 4],
          ['FL Research', 'category', 1],
          ['IUTverse', 'project', 0],
          ['woTask', 'project', 3],
          ['Portfolio-Upgrade', 'project', 1],
          ['NID-OCR', 'category', 2],
        ] as const
      ).map(([name, kind, n], r) => ({
        id: `space-reorder-${r}`,
        name,
        kind,
        description: null,
        targetInDays: null,
        tasks: Array.from({ length: n }, (_, i) => [`${name} task ${i + 1}`, P[(i + r) % 4], null, false, []] satisfies Seed),
      })),
      now,
    ),
  many: (now) =>
    build(
      Array.from({ length: 30 }, (_, r) => ({
        id: `space-many-${r}`,
        name: `${(['Project', 'Goal', 'Category'] as const)[r % 3]} ${r + 1}`,
        kind: (['project', 'goal', 'category'] as const)[r % 3],
        description: null,
        targetInDays: r % 3 === 1 ? 20 : null,
        tasks: Array.from({ length: (r * 7) % 9 }, (_, i) => [`Task ${r + 1}.${i + 1}`, P[(i + r) % 4], null, i % 5 === 4, []] satisfies Seed),
      })),
      now,
    ),
  /** A single linear chain: one unlocked head followed by four locked steps. */
  chains: (now) =>
    build(
      [
        {
          id: 'space-chains',
          name: 'Chains',
          kind: 'project',
          description: null,
          targetInDays: null,
          tasks: [
            ['Draft the schema', 3, 1, false, ['design']],
            ['Write the migration', 2, null, false, ['db']],
            ['Backfill existing rows', 2, null, false, ['db']],
            ['Ship behind a flag', 1, null, false, ['release']],
            ['Remove the flag', 0, null, false, ['release']],
            ['Unrelated loose task', 1, null, false, []],
          ],
          chains: { 1: 0, 2: 1, 3: 2, 4: 3 },
        },
      ],
      now,
    ),
  /** One root forking three ways, with a second fork further down and a completed blocker. */
  forks: (now) =>
    build(
      [
        {
          id: 'space-forks',
          name: 'Forks',
          kind: 'project',
          description: null,
          targetInDays: null,
          tasks: [
            ['Agree the API shape', 2, null, true, ['design']],
            ['Build the client', 3, 2, false, ['fe']],
            ['Build the server', 3, 2, false, ['be']],
            ['Write the docs', 1, null, false, ['docs']],
            ['Client integration tests', 2, null, false, ['fe']],
            ['Server load tests', 2, null, false, ['be']],
            ['Announce the API', 0, null, false, ['marketing']],
          ],
          // 0 is complete, so 1/2/3 are unlocked; everything below them is still locked.
          chains: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2, 6: 4 },
        },
      ],
      now,
    ),
  /** A long chain plus edge cases: an overdue locked step and one completed out of order. */
  lockedDeep: (now) =>
    build(
      [
        {
          id: 'space-locked',
          name: 'Locked',
          kind: 'goal',
          description: null,
          targetInDays: 30,
          tasks: Array.from({ length: 14 }, (_, i) => [`Step ${i + 1}`, P[i % 4], i === 5 ? -3 : null, i === 9, []] satisfies Seed),
          chains: Object.fromEntries(Array.from({ length: 13 }, (_, i) => [i + 1, i])),
        },
      ],
      now,
    ),
  stress: (now) =>
    build(
      Array.from({ length: 10 }, (_, r) => ({
        id: `space-stress-${r}`,
        name: `Stress ${r + 1}`,
        kind: (['category', 'project', 'goal'] as const)[r % 3],
        description: null,
        targetInDays: r % 3 === 2 ? 30 : null,
        tasks: Array.from({ length: 50 }, (_, i) => [`Stress ${r + 1}.${i + 1}`, P[(i + r) % 4], null, i % 6 === 0, []] satisfies Seed),
      })),
      now,
    ),
};
