import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { authenticate, requireRole, requireFeature } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// PUT is deliberately never feature-gated — Setup.tsx uses it for the
// admin's own login email/password on every plan, including Basic, before
// any other staff account could ever exist.
router.get('/roles', requireFeature('users'), userController.roles);
router.get('/', requireRole('admin'), requireFeature('users'), userController.list);
router.post('/', requireRole('admin'), requireFeature('users'), userController.create);
router.put('/:id', requireRole('admin'), userController.update);
router.delete('/:id', requireRole('admin'), requireFeature('users'), userController.remove);

export default router;
