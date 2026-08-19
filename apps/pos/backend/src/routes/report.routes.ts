import { Router } from 'express';
import * as reportController from '../controllers/report.controller';
import { authenticate, requireFeature } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Dashboard and the Inventory-page stock report stay available on every
// plan (they back Basic-tier pages) — only the standalone Reports page's
// own endpoints are gated behind the 'reports' feature.
router.get('/dashboard', reportController.dashboard);
router.get('/inventory', reportController.inventoryReport);
router.get('/sales', requireFeature('reports'), reportController.salesReport);
router.get('/product-sales', requireFeature('reports'), reportController.productSalesReport);
router.get('/cashiers', requireFeature('reports'), reportController.cashierReport);
router.get('/credit', requireFeature('reports'), reportController.creditReport);

export default router;
