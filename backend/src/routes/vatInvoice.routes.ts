import { Router } from 'express';
import * as vatInvoiceController from '../controllers/vatInvoice.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', vatInvoiceController.list);
router.get('/:id', vatInvoiceController.getById);
router.post('/', vatInvoiceController.create);

export default router;
