import { Router } from 'express';
import * as settingsController from '../controllers/settings.controller';
import { authenticate, optionalAuthenticate, requireRole } from '../middleware/auth';

const router = Router();

// optionalAuthenticate: this is called both after login (real tenant
// settings) and once eagerly on every app mount including the login screen
// itself, before any token exists — see getSettings() in settings.service.ts
// for how it handles the no-tenant-context case.
router.get('/', optionalAuthenticate, settingsController.get);
router.get('/templates', settingsController.templates);
router.get('/plans', settingsController.plans);
router.get('/preset-admin', settingsController.presetAdmin);
router.put('/', authenticate, requireRole('admin'), settingsController.update);
router.post('/complete-setup', authenticate, requireRole('admin'), settingsController.completeSetup);

export default router;
