import { Router } from 'express';
import * as grnController from '../controllers/grn.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', grnController.list);
router.get('/suppliers', grnController.listSuppliers);
router.post('/suppliers', grnController.createSupplier);
router.get('/:id', grnController.getById);
router.get('/:id/returns', grnController.listReturns);
router.post('/:id/return', grnController.createReturn);
router.post('/', grnController.create);

export default router;
