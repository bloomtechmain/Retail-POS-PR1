import { Router } from 'express';
import * as shiftController from '../controllers/shift.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', shiftController.list);
router.get('/current', shiftController.currentShift);
router.post('/open', shiftController.openShift);
router.put('/:id/close', shiftController.closeShift);
router.get('/:id/report', shiftController.shiftReport);

export default router;
