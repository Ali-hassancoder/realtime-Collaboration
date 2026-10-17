import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const notificationParams = z.object({ notificationId: objectId });

export const listNotificationsQuery = z.object({
  before: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  // ?unread=true keeps only unread items (the badge uses the count, the panel the list)
  unread: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
});
