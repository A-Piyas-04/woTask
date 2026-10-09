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
});

export const TaskSchema = TaskObjectSchema;
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
export type TaskPatch = Partial<Pick<Task, 'title' | 'notes' | 'priority' | 'dueAt' | 'completedAt' | 'spaceId' | 'tags'>>;

/** Fields a user may change on an existing space. */
export type SpacePatch = Partial<Pick<Space, 'name' | 'kind' | 'description' | 'colorIndex' | 'targetDate' | 'archivedAt'>>;

export const isCompleted = (t: Task): boolean => t.completedAt !== null;
