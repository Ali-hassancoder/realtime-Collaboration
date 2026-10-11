import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  MONGO_URI: z.string().min(1, ''),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  JWT_ACCESS_SECRET: z.string().min(32, '6a9571d34c4ee7a977051ddd5d6bf667dd5eb92668cacbc4f609cd8ee4c3736339cb043d19dfcd777bf6e00a067b1e7c'),
  ACCESS_TOKEN_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(7),
});

const result = schema.safeParse(process.env);
if (!result.success) {
  const problems = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${problems}`);
}

export const env = result.data;