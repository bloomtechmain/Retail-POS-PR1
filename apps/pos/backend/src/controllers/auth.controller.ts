import { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service';
import { AuthRequest } from '../middleware/auth';
import { isRateLimited, recordFailedAttempt, clearAttempts } from '../utils/rateLimiter';

export const login = async (req: Request, res: Response, next: NextFunction) => {
  const { email, password } = req.body;
  const rateLimitKey = `${req.ip}:${(email || '').toLowerCase()}`;
  try {
    const retryAfter = isRateLimited(rateLimitKey);
    if (retryAfter !== null) {
      res.status(429).json({
        success: false,
        message: `Too many failed login attempts. Try again in ${retryAfter} seconds.`,
      });
      return;
    }
    const result = await authService.loginUser(email, password);
    clearAttempts(rateLimitKey);
    res.json({ success: true, ...result });
  } catch (err) {
    recordFailedAttempt(rateLimitKey);
    next(err);
  }
};

export const me = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, user: req.user });
  } catch (err) { next(err); }
};

export const changePassword = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await authService.changePassword(req.user!.id, req.body.current_password, req.body.new_password);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) { next(err); }
};

export const switchSandbox = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await authService.switchSandbox(req.user!, !!req.body.sandbox);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};
