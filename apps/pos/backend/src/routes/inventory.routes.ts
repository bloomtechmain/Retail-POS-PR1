import { Router } from 'express';
import * as inventoryController from '../controllers/inventory.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/movements', inventoryController.movements);
router.post('/adjust/:productId', inventoryController.adjust);

export default router;
