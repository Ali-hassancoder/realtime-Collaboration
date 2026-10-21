import mongoose from 'mongoose';

// One collaborative Yjs document per project (Phase 13).
// The snapshot is an opaque Yjs binary update (Y.encodeStateAsUpdate) - the server never parses
// or reinterprets it beyond applying/removing it to a live Y.Doc. Storing it as a Buffer keeps
// the document portable across restarts and lets us hand the same bytes to joining clients.
const documentSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    // One document per project, keyed by projectId. Unique index guarantees the upsert path
    // (findOneAndUpdate with upsert:true) never races a duplicate into existence.
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, unique: true },
    snapshot: { type: Buffer, required: true, default: Buffer.alloc(0) },
    lastEditorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Cascade cleanup when a workspace disappears.
documentSchema.index({ workspaceId: 1 });

export const Document = mongoose.model('Document', documentSchema);
