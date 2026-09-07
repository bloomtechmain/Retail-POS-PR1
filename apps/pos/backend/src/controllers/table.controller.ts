import { Response, NextFunction } from 'express';
import * as tableService from '../services/table.service';
import { AuthRequest } from '../middleware/auth';

export const list = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await tableService.getTables();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const create = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await tableService.createTable(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
};

export const update = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await tableService.updateTable(parseInt(req.params.id), req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const remove = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await tableService.deleteTable(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
};
