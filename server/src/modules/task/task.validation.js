import { z } from 'zod';
import { TASK_PRIORITIES, TASK_STATUSES } from './task.model.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

// Calendar date (YYYY-MM-DD) stored as UTC midnight. The round trip rejects impossible dates like 2026-02-31.
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Enter a real date')
  .transform((s) => new Date(`${s}T00:00:00.000Z`));

const title = z.string().trim().min(1, 'Title is required').max(200, 'Title is too long');
const description = z.string().trim().max(2000, 'Description is too long');
const version = z.number().int().min(1);

export const createTaskSchema = z.object({
  title,
  description: description.default(''),
  status: z.enum(TASK_STATUSES).default('todo'),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  assigneeId: objectId.nullable().default(null),
  dueDate: calendarDate.nullable().default(null),
});

// Unknown keys (position, projectId, createdBy, ...) are stripped, so they can never be mass-assigned.
// No defaults here, otherwise a partial update would overwrite fields.
export const updateTaskSchema = z
  .object({
    version,
    title: title.optional(),
    description: description.optional(),
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    assigneeId: objectId.nullable().optional(),
    dueDate: calendarDate.nullable().optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== 'version'), 'Provide at least one field to change');

// prevId only = bottom of the column, nextId only = top, both = between, neither = bottom
export const moveTaskSchema = z
  .object({
    version,
    status: z.enum(TASK_STATUSES),
    prevId: objectId.nullable().default(null),
    nextId: objectId.nullable().default(null),
  })
  .refine((v) => !(v.prevId && v.prevId === v.nextId), 'prevId and nextId must be different tasks');

export const boardQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(100),
});