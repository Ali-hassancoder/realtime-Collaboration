import { AppError } from '../../utils/AppError.js';
import { canModify } from '../workspaces/workspace.permissions.js';
import { Comment } from './comment.model.js';

const forbidden = () => new AppError(403, 'FORBIDDEN', 'You do not have permission to do this.');
const versionConflict = (current) =>
  new AppError(409, 'COMMENT_VERSION_CONFLICT', 'This comment was changed by someone else.', { current });

function assertProjectActive(project) {
  if (project.status === 'archived') {
    throw new AppError(409, 'PROJECT_ARCHIVED', 'This project is archived. Restore it to change its comments.');
  }
}

// The REST and event shape: the author name is embedded so clients need no extra lookup
const serialize = (comment) => {
  const { authorId, ...rest } = comment.toJSON();
  return {
    ...rest,
    authorId: String(authorId?.id ?? authorId),
    author: authorId?.id ? { id: authorId.id, name: authorId.name } : null,
  };
};

const populateAuthor = (doc) => doc.populate('authorId', 'name');

export async function listComments(task, { before, limit }) {
  // Newest-first query with a limit+1 probe, then served in chronological order
  const query = { taskId: task._id, ...(before ? { _id: { $lt: before } } : {}) };
  const found = await populateAuthor(Comment.find(query).sort({ _id: -1 }).limit(limit + 1));
  const hasMore = found.length > limit;
  const page = hasMore ? found.slice(0, limit) : found;
  page.reverse();
  return { comments: page.map(serialize), hasMore };
}

export async function createComment(project, task, user, { body }) {
  assertProjectActive(project);
  const comment = await Comment.create({
    workspaceId: project.workspaceId,
    projectId: project._id,
    taskId: task._id,
    authorId: user._id,
    body,
  });
  return serialize(await populateAuthor(comment));
}

export async function updateComment(project, comment, user, { version, body }) {
  assertProjectActive(project);
  // Only the author may edit; there is no comment:edit_any
  if (!comment.authorId.equals(user._id)) throw forbidden();

  const updated = await Comment.findOneAndUpdate(
    { _id: comment._id, authorId: user._id, version },
    { $set: { body }, $inc: { version: 1 } },
    { returnDocument: 'after', runValidators: true }
  );
  if (!updated) {
    const current = await Comment.findById(comment._id);
    if (!current) throw new AppError(404, 'COMMENT_NOT_FOUND', 'Comment not found.');
    throw versionConflict(serialize(current));
  }
  return serialize(await populateAuthor(updated));
}

export async function deleteComment(membership, project, comment, user) {
  assertProjectActive(project);
  // Managers may delete any comment; everyone else only their own (docs/PERMISSIONS.md)
  const isAuthor = comment.authorId.equals(user._id);
  if (!canModify(membership.role, 'comment:delete', isAuthor)) throw forbidden();
  await Comment.deleteOne({ _id: comment._id });
}
