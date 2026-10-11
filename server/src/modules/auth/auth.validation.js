import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);

// bcrypt only uses the first 72 bytes, so we cap at 72
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(50),
  email,
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(72),
});