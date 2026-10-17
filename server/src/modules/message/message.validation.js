import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const body = z.string().trim().min(1, 'Write something first').max(2000, 'A message can hold at most 2000 characters');
const version = z.number().int().min(1);

// Unknown keys are stripped, so they can never be mass-assigned
export const createMessageSchema = z.object({ body });

export const updateMessageSchema = z.object({ version, body });

export const messageParams = z.object({ messageId: objectId });

export const listMessagesQuery = z.object({
  before: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
