import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { User } from '../users/users.model.js';
import { Session } from './session.model.js';
import { AuthToken } from './authToken.model.js';
import { sendMail } from '../../utils/mailer.js';

const BCRYPT_COST = 12;
// Compared against when the email doesn't exist, so response time doesn't reveal valid emails
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);

// Phase 16 token lifetimes: verification links are forgiving (a day), reset links are
// short - the whole point is a fresh mailbox trip right now.
const VERIFY_TOKEN_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_MS = 60 * 60 * 1000;

const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

function signAccessToken(user) {
  return jwt.sign({ sub: user.id }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: `${env.ACCESS_TOKEN_MINUTES}m`,
  });
}

async function createSession(userId, userAgent) {
  const raw = crypto.randomBytes(48).toString('base64url');
  await Session.create({
    userId,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
    userAgent: userAgent?.slice(0, 300),
  });
  return raw;
}

async function issueTokens(user, userAgent) {
  return {
    user,
    accessToken: signAccessToken(user),
    refreshToken: await createSession(user._id, userAgent),
  };
}

export async function register({ name, email, password }, userAgent) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  let user;
  try {
    user = await User.create({ name, email, passwordHash });
  } catch (err) {
    // Unique index is the source of truth (avoids a check-then-insert race)
    if (err.code === 11000) {
      throw new AppError(409, 'EMAIL_IN_USE', 'An account with this email already exists.');
    }
    throw err;
  }
  // Best effort: an undeliverable verification email must not undo a valid registration
  // (the user can resend from the in-app banner; sendMail never throws).
  const raw = await createAuthToken(user._id, 'email_verify', VERIFY_TOKEN_MS);
  await sendVerificationEmail(user.email, raw);
  return issueTokens(user, userAgent);
}

export async function login({ email, password }, userAgent) {
  const user = await User.findOne({ email }).select('+passwordHash');
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }
  return issueTokens(user, userAgent);
}

export async function refresh(rawToken, userAgent) {
  // Atomic find-and-delete: a refresh token can be used only once
  const session = await Session.findOneAndDelete({
    tokenHash: hashToken(rawToken),
    expiresAt: { $gt: new Date() },
  });
  if (!session) throw new AppError(401, 'REFRESH_INVALID', 'Session expired. Please log in again.');

  const user = await User.findById(session.userId);
  if (!user) throw new AppError(401, 'REFRESH_INVALID', 'Session expired. Please log in again.');

  return issueTokens(user, userAgent);
}

export async function logout(rawToken) {
  if (!rawToken) return;
  await Session.deleteOne({ tokenHash: hashToken(rawToken) });
}

export const hashPassword = (password) => bcrypt.hash(password, BCRYPT_COST);
export const verifyPassword = (password, hash) => bcrypt.compare(password, hash);
export const revokeAllSessions = (userId) => Session.deleteMany({ userId });
export { hashToken };

// ---------- Email verification + password reset (Phase 16) ----------
// Tokens follow the Session pattern: 32 random bytes, only the SHA-256 hash is stored,
// and redemption is an atomic findOneAndDelete, which makes every link single use.

async function createAuthToken(userId, purpose, ttlMs) {
  // A new link replaces older ones for the same purpose, so only the last email sent works
  await AuthToken.deleteMany({ userId, purpose });
  const raw = crypto.randomBytes(32).toString('base64url');
  await AuthToken.create({
    userId,
    tokenHash: hashToken(raw),
    purpose,
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return raw;
}

const redeemAuthToken = (raw, purpose) =>
  AuthToken.findOneAndDelete({ tokenHash: hashToken(raw), purpose, expiresAt: { $gt: new Date() } });

const sendVerificationEmail = (email, raw) =>
  sendMail({
    to: email,
    subject: 'Verify your Syncora email',
    text:
      `Confirm your email address to finish setting up your Syncora account:\n\n` +
      `${env.CLIENT_URL}/verify-email/${raw}\n\nThis link works once and expires within 24 hours.`,
  });

export async function verifyEmail(rawToken) {
  const token = await redeemAuthToken(rawToken, 'email_verify');
  if (!token) {
    throw new AppError(400, 'VERIFY_LINK_INVALID', 'This verification link is invalid or has expired.');
  }
  await User.findByIdAndUpdate(token.userId, { $set: { emailVerified: true, emailVerifiedAt: new Date() } });
}

export async function resendVerification(user) {
  if (user.emailVerified) {
    throw new AppError(409, 'EMAIL_ALREADY_VERIFIED', 'This email address is already verified.');
  }
  const raw = await createAuthToken(user._id, 'email_verify', VERIFY_TOKEN_MS);
  await sendVerificationEmail(user.email, raw);
}

export async function forgotPassword(email) {
  // Always resolves: the route answers with the same generic 202 whether or not the
  // email exists, so the endpoint cannot enumerate accounts. (Registration's 409 on
  // duplicate email remains an accepted, documented trade-off.)
  const user = await User.findOne({ email });
  if (!user) return;
  const raw = await createAuthToken(user._id, 'password_reset', RESET_TOKEN_MS);
  await sendMail({
    to: email,
    subject: 'Reset your Syncora password',
    text:
      `Choose a new Syncora password:\n\n${env.CLIENT_URL}/reset-password/${raw}\n\n` +
      `This link works once and expires within an hour. If you did not request a reset, ignore this email.`,
  });
}

export async function resetPassword(rawToken, newPassword) {
  const token = await redeemAuthToken(rawToken, 'password_reset');
  if (!token) {
    throw new AppError(400, 'RESET_LINK_INVALID', 'This reset link is invalid or has expired.');
  }
  const user = await User.findById(token.userId);
  if (!user) throw new AppError(400, 'RESET_LINK_INVALID', 'This reset link is invalid or has expired.');

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  // Controlling the mailbox proves ownership, so a completed reset also verifies the email
  if (!user.emailVerified) {
    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
  }
  await user.save();

  // A reset is also a recovery from a stolen account: every existing session must go,
  // and no other outstanding link should survive the password change.
  await revokeAllSessions(user._id);
  await AuthToken.deleteMany({ userId: user._id });
}
