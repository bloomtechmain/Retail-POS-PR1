import { Router } from 'express';
import * as grnController from '../controllers/grn.controller';
import { authenticate, requirePermission } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', grnController.list);
router.get('/suppliers', grnController.listSuppliers);
router.post('/suppliers', requirePermission('grn.create'), grnController.createSupplier);
router.get('/:id', grnController.getById);
router.get('/:id/returns', grnController.listReturns);
router.post('/:id/return', requirePermission('grn.edit'), grnController.createReturn);
router.post('/', requirePermission('grn.create'), grnController.create);

export default router;
