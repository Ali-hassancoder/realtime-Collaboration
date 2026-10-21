import mongoose from 'mongoose';

// Single-use tokens for email verification and password reset (Phase 16). Only the
// SHA-256 hash of the random token is stored (same pattern as refresh Sessions), so a
// database leak cannot be replayed as an email link. "Single use" is enforced by
// findOneAndDelete at redemption, not by a used flag.
const authTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    purpose: { type: String, enum: ['email_verify', 'password_reset'], required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// MongoDB automatically removes stale tokens (expired links are simply invalid)
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthToken = mongoose.model('AuthToken', authTokenSchema);
