import { Router } from 'express';
import * as productController from '../controllers/product.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', productController.list);
router.get('/low-stock', productController.lowStock);
router.get('/categories', productController.categories);
router.get('/brands', productController.brands);
router.get('/barcode/:barcode', productController.getByBarcode);
router.get('/:id', productController.getById);
router.post('/', productController.create);
router.put('/:id', productController.update);
router.delete('/:id', productController.remove);

export default router;
