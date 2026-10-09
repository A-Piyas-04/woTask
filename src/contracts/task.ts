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
  listId: z.string().min(1),
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

export const ListSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  position: z.number().int(),
  createdAt: z.number().int(),
});
export type List = z.infer<typeof ListSchema>;

export const TaskArraySchema = z.array(TaskSchema);
export const ListArraySchema = z.array(ListSchema);

/** Fields a user may change on an existing task. */
export type TaskPatch = Partial<Pick<Task, 'title' | 'notes' | 'priority' | 'dueAt' | 'completedAt' | 'listId' | 'tags'>>;

export const isCompleted = (t: Task): boolean => t.completedAt !== null;
