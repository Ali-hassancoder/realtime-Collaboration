import './setup.js';
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { User } from '../src/modules/users/users.model.js';
import { Session } from '../src/modules/auth/session.model.js';

const testUri = process.env.MONGO_URI_TEST;
// Safety: never run against the real database
const skipReason =
  !testUri || testUri === process.env.MONGO_URI ? 'Set MONGO_URI_TEST to a separate test database' : false;

describe('auth', { skip: skipReason }, () => {
  const app = createApp();
  const agent = request.agent(app); // keeps cookies between requests
  const email = `user-${Date.now()}@test.example`;
  const password = 'correct-horse-9';

  before(async () => {
    await mongoose.connect(testUri);
  });

  after(async () => {
    const users = await User.find({ email: /@test\.example$/ }).select('_id');
    await Session.deleteMany({ userId: { $in: users.map((u) => u._id) } });
    await User.deleteMany({ email: /@test\.example$/ });
    await mongoose.disconnect();
  });

  test('rejects invalid registration data', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'A', email: 'nope', password: '123' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  test('registers a user and never returns the password hash', async () => {
    const res = await agent.post('/api/auth/register').send({ name: 'Test User', email, password });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.user.email, email);
    assert.equal(res.body.data.user.passwordHash, undefined);
    assert.ok(res.headers['set-cookie'].some((c) => c.startsWith('access_token=') && c.includes('HttpOnly')));
  });

  test('rejects duplicate email', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'Test User', email, password });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'EMAIL_IN_USE');
  });

  test('/me works with the session cookie', async () => {
    const res = await agent.get('/api/auth/me');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.email, email);
  });

  test('/me without cookie returns 401', async () => {
    const res = await request(app).get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  test('wrong password and unknown email give the same error', async () => {
    const a = await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' });
    const b = await request(app).post('/api/auth/login').send({ email: 'nobody@test.example', password });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.deepEqual(a.body, b.body);
  });

  test('refresh rotates the session', async () => {
    const res = await agent.post('/api/auth/refresh');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.email, email);
  });

  test('logout ends the session', async () => {
    const out = await agent.post('/api/auth/logout');
    assert.equal(out.status, 200);
    const res = await agent.get('/api/auth/me');
    assert.equal(res.status, 401);
    const refresh = await agent.post('/api/auth/refresh');
    assert.equal(refresh.status, 401);
  });

  test('login works after logout', async () => {
    const res = await agent.post('/api/auth/login').send({ email, password });
    assert.equal(res.status, 200);
  });
});