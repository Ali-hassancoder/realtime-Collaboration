import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { User } from '../users/user.model.js';
import { Session } from './session.model.js';

const BCRYPT_COST = 12;
// Compared against when the email doesn't exist, so response time doesn't reveal valid emails
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);

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