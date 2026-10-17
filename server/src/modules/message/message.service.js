import { AppError } from '../../utils/AppError.js';
import { canModify } from '../workspaces/workspace.permissions.js';
import { Message } from './message.model.js';

const forbidden = () => new AppError(403, 'FORBIDDEN', 'You do not have permission to do this.');
const versionConflict = (current) =>
  new AppError(409, 'MESSAGE_VERSION_CONFLICT', 'This message was changed by someone else.', { current });

function assertProjectActive(project) {
  if (project.status === 'archived') {
    throw new AppError(409, 'PROJECT_ARCHIVED', 'This project is archived. Restore it to chat.');
  }
}

// The REST and event shape: the author name is embedded so clients need no extra lookup
const serialize = (message) => {
  const { authorId, ...rest } = message.toJSON();
  return {
    ...rest,
    authorId: String(authorId?.id ?? authorId),
    author: authorId?.id ? { id: authorId.id, name: authorId.name } : null,
  };
};

const populateAuthor = (doc) => doc.populate('authorId', 'name');

export async function listMessages(project, { before, limit }) {
  // Newest-first query with a limit+1 probe, then served in chronological order
  const query = { projectId: project._id, ...(before ? { _id: { $lt: before } } : {}) };
  const found = await populateAuthor(Message.find(query).sort({ _id: -1 }).limit(limit + 1));
  const hasMore = found.length > limit;
  const page = hasMore ? found.slice(0, limit) : found;
  page.reverse();
  return { messages: page.map(serialize), hasMore };
}

export async function createMessage(project, user, { body }) {
  assertProjectActive(project);
  const message = await Message.create({
    workspaceId: project.workspaceId,
    projectId: project._id,
    authorId: user._id,
    body,
  });
  return serialize(await populateAuthor(message));
}

export async function updateMessage(project, message, user, { version, body }) {
  assertProjectActive(project);
  // Only the author may edit; there is no message:edit_any
  if (!message.authorId.equals(user._id)) throw forbidden();

  const updated = await Message.findOneAndUpdate(
    { _id: message._id, authorId: user._id, version },
    { $set: { body }, $inc: { version: 1 } },
    { returnDocument: 'after', runValidators: true }
  );
  if (!updated) {
    const current = await Message.findById(message._id);
    if (!current) throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message not found.');
    throw versionConflict(serialize(current));
  }
  return serialize(await populateAuthor(updated));
}

export async function deleteMessage(membership, project, message, user) {
  assertProjectActive(project);
  // Admins may delete any message; everyone else only their own (docs/PERMISSIONS.md)
  const isAuthor = message.authorId.equals(user._id);
  if (!canModify(membership.role, 'message:delete', isAuthor)) throw forbidden();
  await Message.deleteOne({ _id: message._id });
}
