import { Router } from 'express';
import * as reportController from '../controllers/report.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/dashboard', reportController.dashboard);
router.get('/sales', reportController.salesReport);
router.get('/product-sales', reportController.productSalesReport);
router.get('/inventory', reportController.inventoryReport);
router.get('/cashiers', reportController.cashierReport);

export default router;
