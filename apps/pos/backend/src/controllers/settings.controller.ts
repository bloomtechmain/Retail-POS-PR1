import { Response, NextFunction } from 'express';
import * as settingsService from '../services/settings.service';
import { AuthRequest } from '../middleware/auth';

export const get = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // No valid token at all (the frontend calls this eagerly on every app
    // mount, including the login screen before any token exists) — there's
    // no tenant to resolve settings for, so skip the DB entirely rather
    // than erroring. A valid token always resolves for real, whether it's
    // a hosted tenant token or an Electron token (which has no tenant
    // schema by design but does have its own real public.settings row).
    const data = req.user ? await settingsService.getSettings() : settingsService.GENERIC_DEFAULTS;
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

export const plans = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = settingsService.listPlans();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const presetAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = settingsService.consumePresetAdminCredentials();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};
