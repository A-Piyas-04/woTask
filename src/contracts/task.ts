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

/** All timestamps are integer milliseconds since the Unix epoch. */
export const TaskSchema = z.object({
  id: z.string().min(1),
  regionId: z.string().min(1),
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
export type Task = z.infer<typeof TaskSchema>;

export const RegionKindSchema = z.enum(['category', 'project', 'goal']);
export type RegionKind = z.infer<typeof RegionKindSchema>;

export const REGION_KIND_LABELS: Record<RegionKind, string> = {
  category: 'Category',
  project: 'Project',
  goal: 'Goal',
};

export const REGION_KIND_PLURALS: Record<RegionKind, string> = {
  category: 'Categories',
  project: 'Projects',
  goal: 'Goals',
};

/**
 * A region is a user-defined category, project or goal; each one is a zone of space.
 * Optional fields are nullable (not undefined) because the Rust side serialises `None` as `null`.
 */
export const RegionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  kind: RegionKindSchema,
  description: z.string().max(200).nullable(),
  /** Index into `PALETTE.regionHues`; the hex is never stored. */
  colorIndex: z.number().int().min(0),
  position: z.number().int(),
  /** Goals only. */
  targetDate: z.number().int().nullable(),
  createdAt: z.number().int(),
  /** Archived regions are hidden from the scene but keep their tasks. */
  archivedAt: z.number().int().nullable(),
});
export type Region = z.infer<typeof RegionSchema>;

export const TaskArraySchema = z.array(TaskSchema);
export const RegionArraySchema = z.array(RegionSchema);

/** Fields a user may change on an existing task. */
export type TaskPatch = Partial<Pick<Task, 'title' | 'notes' | 'priority' | 'dueAt' | 'completedAt' | 'regionId' | 'tags'>>;

/** Fields a user may change on an existing region. */
export type RegionPatch = Partial<Pick<Region, 'name' | 'kind' | 'description' | 'colorIndex' | 'targetDate' | 'archivedAt'>>;

export const isCompleted = (t: Task): boolean => t.completedAt !== null;
