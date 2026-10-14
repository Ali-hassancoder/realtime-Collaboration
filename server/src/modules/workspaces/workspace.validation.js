import { z } from 'zod';
import { ASSIGNABLE_ROLES } from './workspace.permissions.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60),
  description: z.string().trim().max(500).default(''),
});

// No defaults here, otherwise a partial update would overwrite fields
export const updateWorkspaceSchema = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    description: z.string().trim().max(500).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field');

export const memberParams = z.object({ userId: objectId });
export const inviteParams = z.object({ inviteId: objectId });

// 'owner' is deliberately not assignable
export const updateRoleSchema = z.object({ role: z.enum(ASSIGNABLE_ROLES) });

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  role: z.enum(ASSIGNABLE_ROLES).default('member'),
});

export const acceptInviteSchema = z.object({ token: z.string().min(20).max(200) });