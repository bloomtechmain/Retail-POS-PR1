import { Router } from 'express';
import * as taxRateController from '../controllers/taxRate.controller';
import { authenticate, requireRole, requireFeature } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.use(requireFeature('vat_invoice'));

router.get('/', taxRateController.list);
router.post('/', requireRole('admin'), taxRateController.create);
router.put('/:id', requireRole('admin'), taxRateController.update);
router.delete('/:id', requireRole('admin'), taxRateController.remove);

export default router;
