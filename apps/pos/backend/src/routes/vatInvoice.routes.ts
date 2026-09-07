import { Router } from 'express';
import * as vatInvoiceController from '../controllers/vatInvoice.controller';
import { authenticate, requireFeature } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.use(requireFeature('vat_invoice'));

router.get('/pending', vatInvoiceController.pending);
router.post('/:saleId/generate', vatInvoiceController.generate);
router.get('/', vatInvoiceController.list);
router.get('/:id', vatInvoiceController.getById);

export default router;
