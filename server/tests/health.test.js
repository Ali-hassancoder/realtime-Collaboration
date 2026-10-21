import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

test('GET /api/health returns success', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  // uptime joined the body in Phase 17 (platform probes + deploy log diffing); it grows, so check shape
  assert.deepEqual(res.body, { success: true, message: 'API is running', uptime: res.body.uptime });
  assert.equal(typeof res.body.uptime, 'number');
});

test('unknown route returns consistent 404 error format', async () => {
  const res = await request(app).get('/api/does-not-exist');
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'ROUTE_NOT_FOUND');
});

test('malformed JSON returns 400 without leaking internals', async () => {
  const res = await request(app)
    .post('/api/health')
    .set('Content-Type', 'application/json')
    .send('{bad json');
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'MALFORMED_JSON');
});