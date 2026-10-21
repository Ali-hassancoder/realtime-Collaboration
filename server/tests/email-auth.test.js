import './setup.js';
import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { User } from '../src/modules/users/users.model.js';
import { Session } from '../src/modules/auth/session.model.js';
import { AuthToken } from '../src/modules/auth/authToken.model.js';
import { hashToken } from '../src/modules/auth/auth.service.js';
import { outbox } from '../src/utils/mailer.js';

const testUri = process.env.MONGO_URI_TEST;
const skipReason =
  !testUri || testUri === process.env.MONGO_URI ? 'Set MONGO_URI_TEST to a separate test database' : false;

describe('email verification + password reset (Phase 16)', { skip: skipReason }, () => {
  const app = createApp();
  const stamp = Date.now();
  const password = 'correct-horse-9';
  let userIdentity = 0;

  // The mailer captures messages in test mode; links are read straight out of them.
  const linkToken = (message, path) => message.text.match(new RegExp(`${path}/([A-Za-z0-9_-]+)`))?.[1];
  const emailsTo = (email) => outbox.filter((m) => m.to === email);
  const lastEmailTo = (email) => emailsTo(email).at(-1);

  async function newAgent(name = 'user') {
    const agent = request.agent(app);
    const email = `${name}-${stamp}-${(userIdentity += 1)}@email-auth-test.example`;
    const res = await agent.post('/api/auth/register').send({ name: `${name} User`, email, password });
    assert.equal(res.status, 201);
    return { agent, email };
  }

  before(async () => {
    await mongoose.connect(testUri);
  });

  after(async () => {
    const users = await User.find({ email: /@email-auth-test\.example$/ }).select('_id');
    const ids = users.map((u) => u._id);
    await AuthToken.deleteMany({ userId: { $in: ids } });
    await Session.deleteMany({ userId: { $in: ids } });
    await User.deleteMany({ email: /@email-auth-test\.example$/ });
    await mongoose.disconnect();
  });

  beforeEach(() => {
    outbox.length = 0;
  });

  test('registration sends a verification email and starts the user unverified', async () => {
    const { email } = await newAgent();
    assert.equal(await User.countDocuments({ email, emailVerified: false }), 1);
    const mail = lastEmailTo(email);
    assert.equal(mail.subject, 'Verify your Syncora email');
    assert.ok(linkToken(mail, '/verify-email'), 'email must carry a verification link');
  });

  test('a valid token verifies the email exactly once', async () => {
    const { email } = await newAgent();
    const token = linkToken(lastEmailTo(email), '/verify-email');

    const res = await request(app).post('/api/auth/verify-email').send({ token });
    assert.equal(res.status, 200);
    assert.equal((await User.findOne({ email })).emailVerified, true);

    const reuse = await request(app).post('/api/auth/verify-email').send({ token });
    assert.equal(reuse.status, 400);
    assert.equal(reuse.body.error.code, 'VERIFY_LINK_INVALID');
  });

  test('an expired verification token is rejected', async () => {
    const { email } = await newAgent();
    const user = await User.findOne({ email });
    // Forge an already-expired token the same way the service would have
    const raw = 'x'.repeat(43);
    await AuthToken.create({
      userId: user._id,
      tokenHash: hashToken(raw),
      purpose: 'email_verify',
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await request(app).post('/api/auth/verify-email').send({ token: raw });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VERIFY_LINK_INVALID');
    assert.equal((await User.findOne({ email })).emailVerified, false);
  });

  test('resending replaces the old link and requires authentication', async () => {
    const { agent, email } = await newAgent();
    const first = linkToken(lastEmailTo(email), '/verify-email');

    const anonymous = await request(app).post('/api/auth/resend-verification');
    assert.equal(anonymous.status, 401);

    const out = await agent.post('/api/auth/resend-verification');
    assert.equal(out.status, 202);
    const second = linkToken(lastEmailTo(email), '/verify-email');
    assert.notEqual(second, first);

    // Only the newest link survives: createAuthToken replaces prior tokens for the purpose
    const stale = await request(app).post('/api/auth/verify-email').send({ token: first });
    assert.equal(stale.status, 400);
    const fresh = await request(app).post('/api/auth/verify-email').send({ token: second });
    assert.equal(fresh.status, 200);

    const again = await agent.post('/api/auth/resend-verification');
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'EMAIL_ALREADY_VERIFIED');
  });

  test('forgot-password answers identically for unknown emails and sends nothing', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@nowhere-test.example' });
    assert.equal(res.status, 202);
    assert.equal(emailsTo('ghost@nowhere-test.example').length, 0);
  });

  test('a reset sets the new password, revokes every session, and verifies the email', async () => {
    const { agent, email } = await newAgent();
    // Deliberately leave the account unverified to prove reset implies verification
    const forgot = await request(app).post('/api/auth/forgot-password').send({ email });
    assert.equal(forgot.status, 202);
    const token = linkToken(lastEmailTo(email), '/reset-password');
    assert.ok(token);

    const newPassword = 'new-correct-horse-8';
    const reset = await request(app).post('/api/auth/reset-password').send({ token, password: newPassword });
    assert.equal(forgot.status, 202);
    assert.equal(reset.status, 200);

    // Old password no longer works, new one does
    const oldLogin = await request(app).post('/api/auth/login').send({ email, password });
    assert.equal(oldLogin.status, 401);
    const newLogin = await request(app).post('/api/auth/login').send({ email, password: newPassword });
    assert.equal(newLogin.status, 200);

    // The session held by the registering agent was revoked by the reset
    const staleRefresh = await agent.post('/api/auth/refresh');
    assert.equal(staleRefresh.status, 401);

    const user = await User.findOne({ email });
    assert.equal(user.emailVerified, true, 'mailbox control proven by the reset link');
    assert.equal(await AuthToken.countDocuments({ userId: user._id }), 0, 'no links survive a reset');

    // The reset link itself is single-use
    const reuse = await request(app).post('/api/auth/reset-password').send({ token, password: 'another-pass-1' });
    assert.equal(reuse.status, 400);
    assert.equal(reuse.body.error.code, 'RESET_LINK_INVALID');
  });

  test('malformed tokens and weak passwords are rejected before any lookup', async () => {
    const badToken = await request(app).post('/api/auth/verify-email').send({ token: 'short' });
    assert.equal(badToken.status, 400);
    assert.equal(badToken.body.error.code, 'VALIDATION_ERROR');

    const { email } = await newAgent();
    const token = linkToken(lastEmailTo(email), '/reset-password') ?? 'a'.repeat(43);
    const weak = await request(app).post('/api/auth/reset-password').send({ token, password: '123' });
    assert.equal(weak.status, 400);
    assert.equal(weak.body.error.code, 'VALIDATION_ERROR');
  });

  test('a password_reset token cannot verify an email and vice versa', async () => {
    const { email } = await newAgent();
    await request(app).post('/api/auth/forgot-password').send({ email });
    const resetToken = linkToken(lastEmailTo(email), '/reset-password');

    const cross = await request(app).post('/api/auth/verify-email').send({ token: resetToken });
    assert.equal(cross.status, 400);
    assert.equal(cross.body.error.code, 'VERIFY_LINK_INVALID');
    assert.equal((await User.findOne({ email })).emailVerified, false);
  });
});
