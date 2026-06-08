import { Response, NextFunction } from 'express';
import * as grnService from '../services/grn.service';
import { AuthRequest } from '../middleware/auth';

export const list = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await grnService.getGRNs({
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      search: req.query.search as string,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

export const getById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const grn = await grnService.getGRNById(parseInt(req.params.id));
    res.json({ success: true, data: grn });
  } catch (err) { next(err); }
};

export const create = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const grn = await grnService.createGRN(req.body, req.user!.id);
    res.status(201).json({ success: true, data: grn });
  } catch (err) { next(err); }
};

export const listReturns = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await grnService.getGRNReturns(parseInt(req.params.id));
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const createReturn = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const ret = await grnService.createGRNReturn(
      parseInt(req.params.id),
      req.body.items,
      req.body.notes,
      req.user!.id
    );
    res.status(201).json({ success: true, data: ret });
  } catch (err) { next(err); }
};

export const listSuppliers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const suppliers = await grnService.getSuppliers();
    res.json({ success: true, data: suppliers });
  } catch (err) { next(err); }
};

export const createSupplier = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const supplier = await grnService.createSupplier(req.body);
    res.status(201).json({ success: true, data: supplier });
  } catch (err) { next(err); }
};
