import { z } from 'zod';

/** 0 = none, 1 = low, 2 = medium, 3 = high */
export const PrioritySchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
export type Priority = z.infer<typeof PrioritySchema>;

export const PRIORITY_LABELS: Record<Priority, string> = {
  0: 'None',
  1: 'Low',
  2: 'Medium',
  3: 'High',
};

/**
 * All timestamps are integer milliseconds since the Unix epoch.
 *
 * Split in two on purpose: `TaskObjectSchema` is the plain shape, which `.omit()`/`.extend()` can
 * still be called on, and `TaskSchema` is that shape plus its cross-field rules. `src/data/repository.ts`
 * derives the wire schema from the object; everything else validates with `TaskSchema`.
 */
export const TaskObjectSchema = z.object({
  id: z.string().min(1),
  spaceId: z.string().min(1),
  title: z.string().min(1).max(500),
  notes: z.string().max(20_000),
  priority: PrioritySchema,
  dueAt: z.number().int().nullable(),
  completedAt: z.number().int().nullable(),
  position: z.number().int(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  tags: z.array(z.string().min(1).max(40)),
  /**
   * Id of the one task that must be completed before this one. `null` (never `undefined` - the Rust
   * side serialises `None` as null) for an unchained task or for the first step of a chain.
   *
   * One predecessor in, many successors out, so chains form a forest and can fork: completing one
   * task may release several. A task carrying a `blockedBy` is only actually *locked* while that
   * blocker is still incomplete, which is derived, never stored - see `isLocked` in the store.
   *
   * `.default(null)` is load-bearing. Rows written before migration v3 and localStorage blobs
   * written by older builds have no such key, and without a default they would fail to parse.
   */
  blockedBy: z.string().min(1).nullable().default(null),
});

/** Cross-field rules. Anything needing to see *other* tasks (cycles, same-space) lives in the store. */
export const TaskSchema = TaskObjectSchema.refine((t) => t.blockedBy !== t.id, {
  message: 'a task cannot block itself',
  path: ['blockedBy'],
});
export type Task = z.infer<typeof TaskObjectSchema>;

export const SpaceKindSchema = z.enum(['category', 'project', 'goal']);
export type SpaceKind = z.infer<typeof SpaceKindSchema>;

export const SPACE_KIND_LABELS: Record<SpaceKind, string> = {
  category: 'Category',
  project: 'Project',
  goal: 'Goal',
};

export const SPACE_KIND_PLURALS: Record<SpaceKind, string> = {
  category: 'Categories',
  project: 'Projects',
  goal: 'Goals',
};

/**
 * A space is a user-defined category, project or goal: one patch of the universe, with its own hue
 * and its own constellation of tasks.
 * Optional fields are nullable (not undefined) because the Rust side serialises `None` as `null`.
 */
export const SpaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  kind: SpaceKindSchema,
  description: z.string().max(200).nullable(),
  /** Index into `PALETTE.spaceHues`; the hex is never stored. */
  colorIndex: z.number().int().min(0),
  position: z.number().int(),
  /** Goals only. */
  targetDate: z.number().int().nullable(),
  createdAt: z.number().int(),
  /** Archived spaces are hidden from the scene but keep their tasks. */
  archivedAt: z.number().int().nullable(),
});
export type Space = z.infer<typeof SpaceSchema>;

export const TaskArraySchema = z.array(TaskSchema);
export const SpaceArraySchema = z.array(SpaceSchema);

/** Fields a user may change on an existing task. */
export type TaskPatch = Partial<
  Pick<Task, 'title' | 'notes' | 'priority' | 'dueAt' | 'completedAt' | 'spaceId' | 'tags' | 'blockedBy'>
>;

/** Fields a user may change on an existing space. */
export type SpacePatch = Partial<Pick<Space, 'name' | 'kind' | 'description' | 'colorIndex' | 'targetDate' | 'archivedAt'>>;

export const isCompleted = (t: Task): boolean => t.completedAt !== null;

/**
 * Everything the scene needs to know about one task's place in the chain forest. Entirely derived
 * from the task list, never stored. It lives in `contracts/` so `src/scene/` can type against it
 * without importing from `src/state/`.
 */
export interface ChainMeta {
  blockedBy: string | null;
  /** The blocker exists and is not complete. A blocker that was deleted never locks. */
  locked: boolean;
  /** Completed while still blocked: the user chose "Complete anyway", or the blocker was reopened. */
  outOfOrder: boolean;
  /** 0 for an unchained task or the first step of a chain. */
  depth: number;
  /** The first step of this task's chain; its own id when it is that step. */
  rootId: string;
  successorIds: string[];
  /** The blocker's `completedAt` (0 when none). Changes exactly when the blocker is completed. */
  unlockToken: number;
}

/** Keyed by task id. Only chained tasks appear; look-ups for a loose task return undefined. */
export type ChainIndex = Readonly<Record<string, ChainMeta>>;
