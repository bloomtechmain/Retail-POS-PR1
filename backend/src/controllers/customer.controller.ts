import { Response, NextFunction } from 'express';
import * as customerService from '../services/customer.service';
import { AuthRequest } from '../middleware/auth';

export const list = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await customerService.getCustomers({
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      search: req.query.search as string,
      with_balance_only: req.query.with_balance_only === 'true',
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

export const getById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const customer = await customerService.getCustomerById(parseInt(req.params.id));
    res.json({ success: true, data: customer });
  } catch (err) { next(err); }
};

export const create = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const customer = await customerService.createCustomer(req.body);
    res.status(201).json({ success: true, data: customer });
  } catch (err) { next(err); }
};

export const update = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const customer = await customerService.updateCustomer(parseInt(req.params.id), req.body);
    res.json({ success: true, data: customer });
  } catch (err) { next(err); }
};

export const remove = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await customerService.deleteCustomer(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
};

export const statement = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await customerService.getCustomerStatement(parseInt(req.params.id));
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

export const addPayment = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const payment = await customerService.recordPayment(parseInt(req.params.id), req.body, req.user!.id);
    res.status(201).json({ success: true, data: payment });
  } catch (err) { next(err); }
};
