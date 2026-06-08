import { Response, NextFunction } from 'express';
import * as inventoryService from '../services/inventory.service';
import { AuthRequest } from '../middleware/auth';

export const movements = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await inventoryService.getStockMovements({
      product_id: req.query.product_id ? parseInt(req.query.product_id as string) : undefined,
      movement_type: req.query.movement_type as string,
      date_from: req.query.date_from as string,
      date_to: req.query.date_to as string,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

export const adjust = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await inventoryService.adjustInventory(
      parseInt(req.params.productId),
      req.body.adjustment_type,
      parseFloat(req.body.quantity),
      req.body.reason,
      req.user!.id
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};
