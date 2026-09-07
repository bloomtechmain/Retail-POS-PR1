import { Router } from 'express';
import * as terminalController from '../controllers/terminal.controller';
import { authenticate, requireRole, requireFeature } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.use(requireFeature('multi_terminal'));

router.get('/', terminalController.list);
router.delete('/:id', requireRole('admin'), terminalController.remove);

export default router;
