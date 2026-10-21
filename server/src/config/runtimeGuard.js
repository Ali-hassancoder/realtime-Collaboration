import { logger } from '../utils/logger.js';

// env.js already checks *shape* (types, min lengths) at parse time. This module checks what is
// only wrong in *production*: shapes that are perfectly valid for development but would deploy
// an unsafe instance (localhost CORS origin, placeholder secrets, half-configured SMTP).
// Called once from server.js before anything binds a port, so a bad deploy dies in the boot log,
// not in user-facing behaviour. Tests call validateRuntime() directly with fixture objects.

// The exact placeholder shipped in .env.example - nobody should be running on it.
const PLACEHOLDER_SECRETS = new Set(['replace-me-with-a-random-secret-of-at-least-32-characters']);
const PLACEHOLDER_MAIL_DOMAIN = 'no-reply@syncora.app'; // MAIL_FROM default

function isLocalUrl(value) {
  try {
    const { hostname } = new URL(value);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');
  } catch {
    return false; // not parseable - env.js would have rejected it already
  }
}

export function validateRuntime(e) {
  const problems = [];
  const warnings = [];

  if (e.NODE_ENV === 'production') {
    if (isLocalUrl(e.CLIENT_URL)) {
      problems.push(`CLIENT_URL points at a local dev origin (${e.CLIENT_URL}); set the deployed SPA URL`);
    }
    if (!e.CLIENT_URL.startsWith('https://')) {
      problems.push('CLIENT_URL must be https:// in production (auth cookies are Secure, so a http origin cannot work)');
    }
    if (PLACEHOLDER_SECRETS.has(e.JWT_ACCESS_SECRET)) {
      problems.push('JWT_ACCESS_SECRET is the .env.example placeholder; generate a real secret');
    }
    if (!e.SMTP_HOST) {
      warnings.push('SMTP_HOST is unset: verification and reset emails will print to the server console instead of sending');
    } else {
      if (!e.SMTP_USER || !e.SMTP_PASS) {
        problems.push('SMTP_HOST is set but SMTP_USER/SMTP_PASS are missing: emails would fail at send time');
      }
      if (e.MAIL_FROM.includes(PLACEHOLDER_MAIL_DOMAIN)) {
        warnings.push(`MAIL_FROM still uses the placeholder domain (${PLACEHOLDER_MAIL_DOMAIN}); receiving mail servers may reject it`);
      }
    }
    if (!e.TRUST_PROXY) {
      warnings.push('TRUST_PROXY is unset: behind a reverse proxy every client shares the proxy IP, collapsing rate limits');
    }
  }

  return { ok: problems.length === 0, problems, warnings };
}

// Fail fast: log every problem, then refuse to start. Warnings still print so they show up
// in the deploy log of a successful boot.
export function assertRuntimeConfig(e) {
  const { ok, problems, warnings } = validateRuntime(e);
  for (const w of warnings) logger.warn({ env: 'runtime' }, w);
  if (!ok) {
    for (const p of problems) logger.error({ env: 'runtime' }, p);
    throw new Error(`Refusing to start in ${e.NODE_ENV}: ${problems.length} environment problem(s), see log above`);
  }
}
