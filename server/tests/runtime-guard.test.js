// Runtime guard rules (Phase 17): pure functions over fixture objects, no DB and no boot -
// the same file runs cleanly even if the suite's Mongo fixtures are absent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRuntime } from '../src/config/runtimeGuard.js';

// What env.js hands the server after parsing: every key the guard reads has its real default.
const prod = (overrides = {}) => ({
  NODE_ENV: 'production',
  CLIENT_URL: 'https://app.example.com',
  JWT_ACCESS_SECRET: 'x'.repeat(48),
  SMTP_HOST: '',
  SMTP_PORT: 587,
  SMTP_USER: '',
  SMTP_PASS: '',
  MAIL_FROM: 'Syncora <no-reply@syncora.app>',
  TRUST_PROXY: '1',
  ...overrides,
});

const problemsMatching = (result, needle) => result.problems.filter((p) => p.includes(needle));

test('a correct production config passes with no problems', () => {
  const result = validateRuntime(prod({ SMTP_HOST: 'smtp.example.com', SMTP_USER: 'u', SMTP_PASS: 'p', MAIL_FROM: 'Syncora <no-reply@example.com>' }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.problems, []);
});

test('non-production environments are never blocked', () => {
  // the exact local dev config that would be fatal in production
  const result = validateRuntime({ ...prod(), NODE_ENV: 'development', CLIENT_URL: 'http://localhost:5173' });
  assert.equal(result.ok, true);
});

test('localhost or http CLIENT_URL blocks production boot', () => {
  const local = validateRuntime(prod({ CLIENT_URL: 'http://localhost:5173' }));
  assert.equal(local.ok, false);
  assert.equal(problemsMatching(local, 'CLIENT_URL').length, 2); // local origin + not https

  const plainHttp = validateRuntime(prod({ CLIENT_URL: 'http://app.example.com' }));
  assert.equal(plainHttp.ok, false);
  assert.equal(problemsMatching(plainHttp, 'https').length, 1);
});

test('the .env.example placeholder secret blocks production boot', () => {
  const result = validateRuntime(prod({ JWT_ACCESS_SECRET: 'replace-me-with-a-random-secret-of-at-least-32-characters' }));
  assert.equal(result.ok, false);
  assert.equal(problemsMatching(result, 'placeholder').length, 1);
});

test('half-configured SMTP blocks, missing SMTP only warns', () => {
  const half = validateRuntime(prod({ SMTP_HOST: 'smtp.example.com' })); // no USER/Pass
  assert.equal(half.ok, false);
  assert.equal(problemsMatching(half, 'SMTP_USER/SMTP_PASS').length, 1);

  const none = validateRuntime(prod()); // console-print fallback stays usable
  assert.equal(none.ok, true);
  assert.equal(problemsMatching(none, '').length, 0);
  assert.equal(none.warnings.filter((w) => w.includes('SMTP_HOST')).length, 1);
});

test('placeholder MAIL_FROM and missing TRUST_PROXY warn but do not block', () => {
  const result = validateRuntime(prod({
    SMTP_HOST: 'smtp.example.com', SMTP_USER: 'u', SMTP_PASS: 'p', TRUST_PROXY: '',
    // MAIL_FROM left at the syncora.app default
  }));
  assert.equal(result.ok, true);
  assert.equal(result.warnings.filter((w) => w.includes('MAIL_FROM')).length, 1);
  assert.equal(result.warnings.filter((w) => w.includes('TRUST_PROXY')).length, 1);
});
