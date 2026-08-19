import { Response, NextFunction } from 'express';
import * as taxRateService from '../services/taxRate.service';
import { AuthRequest } from '../middleware/auth';

export const list = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await taxRateService.getTaxRates(req.query.active_only === 'true');
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const create = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await taxRateService.createTaxRate(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
};

export const update = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await taxRateService.updateTaxRate(parseInt(req.params.id), req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const remove = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await taxRateService.deleteTaxRate(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
};
