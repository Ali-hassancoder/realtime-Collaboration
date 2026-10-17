import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { listNotificationsQuery, notificationParams } from './notification.validation.js';
import * as controller from './notification.controller.js';

const router = Router();
// The inbox is personal: authentication is the only access check there is
router.use(authenticate);

router.get('/', validate({ query: listNotificationsQuery }), controller.list);
router.post('/read-all', controller.readAll);
router.patch('/:notificationId/read', validate({ params: notificationParams }), controller.read);

export default router;
