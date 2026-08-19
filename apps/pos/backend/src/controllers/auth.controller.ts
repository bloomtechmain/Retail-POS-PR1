import { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service';
import { AuthRequest } from '../middleware/auth';

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const result = await authService.loginUser(email, password);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
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
