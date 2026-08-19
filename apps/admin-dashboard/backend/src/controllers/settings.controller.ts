import { Request, Response, NextFunction } from 'express';
import { fetchPlans } from '../services/posBackendClient';

export const plans = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await fetchPlans();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};
