import { Response, NextFunction } from 'express';
import * as promotionService from '../services/promotion.service';
import { AuthRequest } from '../middleware/auth';

export const list = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await promotionService.getPromotions(req.query.active_only === 'true');
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const create = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const promo = await promotionService.createPromotion(req.body, req.user!.id);
    res.status(201).json({ success: true, data: promo });
  } catch (err) { next(err); }
};

export const update = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const promo = await promotionService.updatePromotion(parseInt(req.params.id), req.body);
    res.json({ success: true, data: promo });
  } catch (err) { next(err); }
};

export const remove = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await promotionService.deletePromotion(parseInt(req.params.id));
    res.json({ success: true, message: 'Promotion deleted' });
  } catch (err) { next(err); }
};

export const apply = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const promotionId = req.body.promotion_id ? parseInt(req.body.promotion_id) : undefined;
    const result = await promotionService.applyPromotions(req.body.items, promotionId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};
