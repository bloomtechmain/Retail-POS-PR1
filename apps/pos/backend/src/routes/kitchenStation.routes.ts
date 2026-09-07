import { Router } from 'express';
import * as kitchenStationController from '../controllers/kitchenStation.controller';
import { authenticate, requireRole, requireFeature } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.use(requireFeature('kot_printing'));

router.get('/', kitchenStationController.list);
router.post('/', requireRole('admin'), kitchenStationController.create);
router.put('/:id', requireRole('admin'), kitchenStationController.update);
router.delete('/:id', requireRole('admin'), kitchenStationController.remove);

export default router;
