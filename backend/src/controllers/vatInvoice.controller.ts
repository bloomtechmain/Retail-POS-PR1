import { Response, NextFunction } from 'express';
import * as vatInvoiceService from '../services/vatInvoice.service';
import { AuthRequest } from '../middleware/auth';

export const create = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const sale = await vatInvoiceService.createVatInvoice(req.body, req.user!.id);
    res.status(201).json({ success: true, data: sale });
  } catch (err) { next(err); }
};

export const list = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await vatInvoiceService.getVatInvoices({
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

export const getById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const sale = await vatInvoiceService.getVatInvoiceById(parseInt(req.params.id));
    res.json({ success: true, data: sale });
  } catch (err) { next(err); }
};
