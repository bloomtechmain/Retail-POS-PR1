import { Response, NextFunction } from 'express';
import * as productService from '../services/product.service';
import { AuthRequest } from '../middleware/auth';

export const list = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { search, category_id, brand_id, page, limit, active_only } = req.query;
    const result = await productService.getProducts({
      search: search as string,
      category_id: category_id ? parseInt(category_id as string) : undefined,
      brand_id: brand_id ? parseInt(brand_id as string) : undefined,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 50,
      active_only: active_only !== 'false',
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

export const getById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const product = await productService.getProductById(parseInt(req.params.id));
    res.json({ success: true, data: product });
  } catch (err) { next(err); }
};

export const getByBarcode = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const product = await productService.getProductByBarcode(req.params.barcode);
    res.json({ success: true, data: product });
  } catch (err) { next(err); }
};

export const create = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const product = await productService.createProduct(req.body);
    res.status(201).json({ success: true, data: product });
  } catch (err) { next(err); }
};

export const update = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const product = await productService.updateProduct(parseInt(req.params.id), req.body);
    res.json({ success: true, data: product });
  } catch (err) { next(err); }
};

export const remove = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await productService.deleteProduct(parseInt(req.params.id));
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) { next(err); }
};

export const lowStock = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const products = await productService.getLowStockProducts();
    res.json({ success: true, data: products });
  } catch (err) { next(err); }
};

export const categories = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await productService.getCategories();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const brands = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await productService.getBrands();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};
