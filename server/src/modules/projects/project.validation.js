import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const createProjectSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  description: z.string().trim().max(1000).default(''),
});

// No defaults here, otherwise a partial update would overwrite fields
export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80).optional(),
    description: z.string().trim().max(1000).optional(),
    status: z.enum(['active', 'archived']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field');

export const listProjectsQuery = z.object({
  status: z.enum(['active', 'archived']).default('active'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const addProjectMemberSchema = z.object({ userId: objectId });
export const projectMemberParams = z.object({ userId: objectId });