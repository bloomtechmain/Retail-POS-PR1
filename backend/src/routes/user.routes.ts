import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/roles', userController.roles);
router.get('/', requireRole('admin'), userController.list);
router.post('/', requireRole('admin'), userController.create);
router.put('/:id', requireRole('admin'), userController.update);
router.delete('/:id', requireRole('admin'), userController.remove);

export default router;
