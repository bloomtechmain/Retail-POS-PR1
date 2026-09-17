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

// Basic-tier reporting: today's sales summary only, and deliberately never
// trusts a caller-supplied date range the way salesReport does — a Basic
// tenant only has 'daily_report', not 'reports', so this is the one report
// endpoint reachable with just that feature, and it always computes "today"
// itself rather than accepting date_from/date_to. That's what keeps this a
// real server-side restriction rather than a client-side-only UI lock.
export const dailySalesReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const result = await reportService.getSalesReport({
      date_from: today,
      date_to: today,
      group_by: 'day',
    });
    res.json({ success: true, data: { date: today, ...result.summary } });
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

export const creditReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await reportService.getCreditReport();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

export const stockMovementReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { date_from, date_to } = req.query;
    const today = new Date().toISOString().slice(0, 10);
    const result = await reportService.getStockMovementReport({
      date_from: (date_from as string) || today,
      date_to: (date_to as string) || today,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

export const promotionsReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { date_from, date_to } = req.query;
    const today = new Date().toISOString().slice(0, 10);
    const result = await reportService.getPromotionsReport({
      date_from: (date_from as string) || today,
      date_to: (date_to as string) || today,
    });
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
