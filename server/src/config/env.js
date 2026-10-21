import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  MONGO_URI: z.string().min(1, ''),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(7),
  // Set to the number of reverse-proxy hops in front of the API (e.g. 1 on Render/Fly) so rate
  // limiting and req.ip see the real client. Empty leaves Express at its default (trust none).
  TRUST_PROXY: z.string().default(''),
  // Email (Phase 16: verification + password reset). All optional: without SMTP_HOST the
  // mailer logs messages to the server console instead of sending, so development works
  // with no mail server. Production should configure real credentials.
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().default('Syncora <no-reply@syncora.app>'),
});

const result = schema.safeParse(process.env);
if (!result.success) {
  const problems = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${problems}`);
}

export const env = result.data;