import { Response, NextFunction } from 'express';
import * as reportService from '../services/report.service';
import { AuthRequest } from '../middleware/auth';

export const dashboard = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const stats = await reportService.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (err) { next(err); }
};

export const salesReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { date_from, date_to, group_by } = req.query;
    const today = new Date().toISOString().slice(0, 10);
    const result = await reportService.getSalesReport({
      date_from: (date_from as string) || today,
      date_to: (date_to as string) || today,
      group_by: (group_by as 'day' | 'month') || 'day',
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

export const productSalesReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { date_from, date_to } = req.query;
    const today = new Date().toISOString().slice(0, 10);
    const result = await reportService.getProductSalesReport({
      date_from: (date_from as string) || today,
      date_to: (date_to as string) || today,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

export const inventoryReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await reportService.getInventoryReport();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

export const cashierReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { date_from, date_to } = req.query;
    const today = new Date().toISOString().slice(0, 10);
    const result = await reportService.getCashierReport({
      date_from: (date_from as string) || today,
      date_to: (date_to as string) || today,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};
