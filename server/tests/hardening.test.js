// Hardened response headers + graceful shutdown (Phase 17). No database needed.
import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createShutdownHandler } from '../src/config/shutdown.js';

const app = createApp();

test('helmet sends production security headers', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
  // HSTS must carry the year-long maxAge configured in app.js (only meaningful over https)
  assert.match(res.headers['strict-transport-security'], /max-age=31536000/);
  assert.equal(res.headers['content-security-policy'], undefined); // API serves no HTML
});

// --- graceful shutdown (src/config/shutdown.js), driven with fakes ---

function makeFakes({ drainWorks }) {
  const calls = { ioClose: 0, disconnectSockets: [], serverClose: 0, forced: 0, dbDisconnects: 0, exits: [] };
  const io = {
    close: () => { calls.ioClose += 1; },
    disconnectSockets: (closeConn) => { calls.disconnectSockets.push(closeConn); },
  };
  const httpServer = {
    close: (cb) => {
      calls.serverClose += 1;
      if (drainWorks) process.nextTick(cb);
    },
    closeAllConnections: () => { calls.forced += 1; },
  };
  return { io, httpServer, calls, disconnectDB: async () => { calls.dbDisconnects += 1; } };
}

test('shutdown drains in the happy path: DB disconnected, then exit 0', async () => {
  const fakes = makeFakes({ drainWorks: true });
  const shutdown = createShutdownHandler({ ...fakes, exit: (code) => fakes.calls.exits.push(code), forceMs: 50 });
  shutdown('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.deepEqual(fakes.calls.exits, [0]);
  assert.equal(fakes.calls.dbDisconnects, 1);
  assert.equal(fakes.calls.forced, 0); // the deadline must not have fired
});

test('shutdown forces connections closed when the drain hangs', async () => {
  const fakes = makeFakes({ drainWorks: false });
  const shutdown = createShutdownHandler({ ...fakes, exit: (code) => fakes.calls.exits.push(code), forceMs: 30 });
  shutdown('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.deepEqual(fakes.calls.exits, [0]);
  assert.equal(fakes.calls.forced, 1);
  assert.deepEqual(fakes.calls.disconnectSockets, [true]);
  assert.equal(fakes.calls.dbDisconnects, 0); // never reaches the DB step while the drain hangs
});

test('a repeated signal does nothing (no double close, no double exit)', async () => {
  const fakes = makeFakes({ drainWorks: true });
  const shutdown = createShutdownHandler({ ...fakes, exit: (code) => fakes.calls.exits.push(code), forceMs: 50 });
  shutdown('SIGTERM');
  shutdown('SIGINT');
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(fakes.calls.ioClose, 1);
  assert.equal(fakes.calls.serverClose, 1);
  assert.deepEqual(fakes.calls.exits, [0]);
});
