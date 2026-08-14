import { Router } from 'express';
import * as settingsController from '../controllers/settings.controller';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.get('/', settingsController.get);
router.get('/templates', settingsController.templates);
router.put('/', authenticate, requireRole('admin'), settingsController.update);
router.post('/complete-setup', authenticate, requireRole('admin'), settingsController.completeSetup);

export default router;
