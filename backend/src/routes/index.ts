import { Router } from 'express';
import authRoutes from './auth.routes';
import productRoutes from './product.routes';
import salesRoutes from './sales.routes';
import inventoryRoutes from './inventory.routes';
import grnRoutes from './grn.routes';
import promotionRoutes from './promotion.routes';
import reportRoutes from './report.routes';
import shiftRoutes from './shift.routes';
import userRoutes from './user.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/sales', salesRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/grn', grnRoutes);
router.use('/promotions', promotionRoutes);
router.use('/reports', reportRoutes);
router.use('/shifts', shiftRoutes);
router.use('/users', userRoutes);

export default router;
