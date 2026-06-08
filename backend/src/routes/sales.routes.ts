import { Router } from 'express';
import * as salesController from '../controllers/sales.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', salesController.list);
router.get('/:id', salesController.getById);
router.post('/', salesController.create);
router.put('/:id/void', salesController.voidSale);
router.post('/:id/return', salesController.returnSale);

export default router;
