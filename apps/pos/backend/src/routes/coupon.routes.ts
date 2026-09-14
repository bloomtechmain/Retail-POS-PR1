import { Router } from 'express';
import * as couponController from '../controllers/coupon.controller';
import { authenticate, requireRole, requireFeature } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.use(requireFeature('coupons'));

router.get('/', couponController.list);
router.post('/', requireRole('admin'), couponController.create);
router.post('/bulk-generate', requireRole('admin'), couponController.bulkGenerate);
router.put('/:id', requireRole('admin'), couponController.update);
router.delete('/:id', requireRole('admin'), couponController.remove);
router.post('/preview', couponController.preview);

export default router;
