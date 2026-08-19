import { Router } from 'express';
import * as promotionController from '../controllers/promotion.controller';
import { authenticate, requireFeature } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.use(requireFeature('promotions'));

router.get('/', promotionController.list);
router.post('/apply', promotionController.apply);
router.post('/', promotionController.create);
router.put('/:id', promotionController.update);
router.delete('/:id', promotionController.remove);

export default router;
