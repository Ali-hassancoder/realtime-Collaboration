import mongoose from 'mongoose';
import { jsonTransform } from '../../utils/mongoose.js';

const workspaceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true, toJSON: { transform: jsonTransform } }
);

export const Workspace = mongoose.model('Workspace', workspaceSchema);