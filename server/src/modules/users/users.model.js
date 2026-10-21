import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    // Phase 16: soft enforcement - unverified users can use the app, the client shows a
    // reminder banner. A completed password reset proves mailbox control, so it verifies too.
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      // Never serialize sensitive/internal fields
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        delete ret.emailVerifiedAt;
        return ret;
      },
    },
  }
);

export const User = mongoose.model('User', userSchema);