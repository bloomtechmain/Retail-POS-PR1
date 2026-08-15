import { Response, NextFunction } from 'express';
import * as settingsService from '../services/settings.service';
import { AuthRequest } from '../middleware/auth';

export const get = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await settingsService.getSettings();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const update = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await settingsService.updateSettings(req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const templates = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = settingsService.listTemplates();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const completeSetup = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await settingsService.completeSetup(req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};
