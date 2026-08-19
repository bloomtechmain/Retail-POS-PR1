import { Router } from 'express';
import * as vatInvoiceController from '../controllers/vatInvoice.controller';
import { authenticate, requireFeature } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.use(requireFeature('vat_invoice'));

router.get('/', vatInvoiceController.list);
router.get('/:id', vatInvoiceController.getById);
router.post('/', vatInvoiceController.create);

export default router;
