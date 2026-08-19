import { Response, NextFunction } from 'express';
import * as shiftService from '../services/shift.service';
import { AuthRequest } from '../middleware/auth';

export const openShift = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const shift = await shiftService.openShift(req.user!.id, parseFloat(req.body.opening_cash || 0));
    res.status(201).json({ success: true, data: shift });
  } catch (err) { next(err); }
};

export const closeShift = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const shift = await shiftService.closeShift(
      parseInt(req.params.id),
      req.user!.id,
      parseFloat(req.body.actual_cash),
      req.body.notes
    );
    res.json({ success: true, data: shift });
  } catch (err) { next(err); }
};

export const currentShift = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const shift = await shiftService.getOpenShift(req.user!.id);
    res.json({ success: true, data: shift });
  } catch (err) { next(err); }
};

export const list = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await shiftService.getShifts({
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

export const shiftReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const report = await shiftService.getShiftReport(parseInt(req.params.id));
    res.json({ success: true, data: report });
  } catch (err) { next(err); }
};
