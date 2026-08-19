import { Router } from 'express';
import staffRoutes from './staff.routes';
import settingsRoutes from './settings.routes';

const router = Router();

router.use('/staff', staffRoutes);
router.use('/settings', settingsRoutes);

export default router;
