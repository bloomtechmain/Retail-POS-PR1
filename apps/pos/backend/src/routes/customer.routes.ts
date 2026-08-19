import { Router } from 'express';
import * as customerController from '../controllers/customer.controller';
import { authenticate, requireFeature } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.use(requireFeature('customers'));

router.get('/', customerController.list);
router.get('/:id', customerController.getById);
router.get('/:id/statement', customerController.statement);
router.post('/:id/payments', customerController.addPayment);
router.post('/', customerController.create);
router.put('/:id', customerController.update);
router.delete('/:id', customerController.remove);

export default router;
