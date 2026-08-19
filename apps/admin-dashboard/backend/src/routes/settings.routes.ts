import { Router } from 'express';
import * as settingsController from '../controllers/settings.controller';

const router = Router();

// Same path shape as apps/pos/backend's public GET /api/settings/plans —
// internally proxies there — so the frontend's fetchPlans() call needs no
// changes at all, only its base URL (the vite proxy target) moved.
router.get('/plans', settingsController.plans);

export default router;
