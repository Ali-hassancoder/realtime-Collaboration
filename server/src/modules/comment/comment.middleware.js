import { AppError } from '../../utils/AppError.js';
import { Comment } from './comment.model.js';

const OBJECT_ID = /^[a-f\d]{24}$/i;

// Requires loadTask to have run first (req.task). Matching on taskId means a comment from
// another task never resolves. Every failure is a 404.
export async function loadComment(req, _res, next) {
  const { commentId } = req.params;
  const notFound = new AppError(404, 'COMMENT_NOT_FOUND', 'Comment not found.');
  if (!OBJECT_ID.test(commentId)) throw notFound;

  const comment = await Comment.findOne({ _id: commentId, taskId: req.task._id });
  if (!comment) throw notFound;

  req.comment = comment;
  next();
}
