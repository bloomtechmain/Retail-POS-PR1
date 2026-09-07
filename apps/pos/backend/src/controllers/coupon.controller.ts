import { Response, NextFunction } from 'express';
import * as couponService from '../services/coupon.service';
import { AuthRequest } from '../middleware/auth';

export const list = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await couponService.getCoupons();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const create = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await couponService.createCoupon(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
};

export const update = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await couponService.updateCoupon(parseInt(req.params.id), req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const remove = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await couponService.deleteCoupon(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
};

// Read-only preview so the checkout UI can show the discount before the
// cashier finalizes payment — actual redemption happens inside POST /sales.
export const preview = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { code, base_amount } = req.body;
    const data = await couponService.previewCoupon(code, Number(base_amount) || 0);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};
