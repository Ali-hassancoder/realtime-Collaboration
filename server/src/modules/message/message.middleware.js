import { AppError } from '../../utils/AppError.js';
import { Message } from './message.model.js';

const OBJECT_ID = /^[a-f\d]{24}$/i;

// Requires loadProject to have run first (req.project). Matching on projectId means a
// message from another project never resolves. Every failure is a 404.
export async function loadMessage(req, _res, next) {
  const { messageId } = req.params;
  const notFound = new AppError(404, 'MESSAGE_NOT_FOUND', 'Message not found.');
  if (!OBJECT_ID.test(messageId)) throw notFound;

  const message = await Message.findOne({ _id: messageId, projectId: req.project._id });
  if (!message) throw notFound;

  req.message = message;
  next();
}
