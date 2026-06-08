import { Response, NextFunction } from 'express';
import * as salesService from '../services/sales.service';
import { AuthRequest } from '../middleware/auth';

export const create = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const sale = await salesService.createSale(req.body, req.user!.id);
    res.status(201).json({ success: true, data: sale });
  } catch (err) { next(err); }
};

export const list = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await salesService.getSales({
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      date_from: req.query.date_from as string,
      date_to: req.query.date_to as string,
      cashier_id: req.query.cashier_id ? parseInt(req.query.cashier_id as string) : undefined,
      shift_id: req.query.shift_id ? parseInt(req.query.shift_id as string) : undefined,
      status: req.query.status as string,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

export const getById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const sale = await salesService.getSaleById(parseInt(req.params.id));
    res.json({ success: true, data: sale });
  } catch (err) { next(err); }
};

export const voidSale = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const sale = await salesService.voidSale(parseInt(req.params.id), req.body.reason, req.user!.id);
    res.json({ success: true, data: sale });
  } catch (err) { next(err); }
};
