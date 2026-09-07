import { Router } from 'express';
import * as salesController from '../controllers/sales.controller';
import { authenticate, requireFeature } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', salesController.list);
router.get('/:id', salesController.getById);
router.post('/', salesController.create);
router.put('/:id/void', salesController.voidSale);
router.post('/:id/return', salesController.returnSale);

// Held-order lifecycle — shared by plain "hold this bill" on a regular POS
// till (order_type='retail', no plan feature required) AND Restaurant
// Mode's dine-in/takeaway/delivery orders (order_type check + real
// enforcement lives inside createHeldSale itself, not route middleware,
// since the gate depends on the request body, not just the endpoint).
router.post('/held', salesController.createHeld);
router.post('/held/:id/items', salesController.addItems);
router.post('/held/:id/send-to-kitchen', requireFeature('kot_printing'), salesController.sendToKitchen);
router.post('/held/:id/complete', salesController.completeHeld);
router.post('/held/:id/cancel', salesController.cancelHeld);

export default router;
