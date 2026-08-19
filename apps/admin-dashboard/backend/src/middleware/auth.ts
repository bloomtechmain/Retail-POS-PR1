import { Request, Response, NextFunction } from 'express';
import { verifyStaffToken } from '../utils/jwt';
import { StaffAuthPayload } from '../types';

export interface StaffAuthRequest extends Request {
  staff?: StaffAuthPayload;
}

export const authenticateStaff = (req: StaffAuthRequest, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'No token provided' });
      return;
    }
    const token = authHeader.split(' ')[1];
    req.staff = verifyStaffToken(token);
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

export const requireStaffRole = (...roles: Array<'admin' | 'agent'>) => {
  return (req: StaffAuthRequest, res: Response, next: NextFunction): void => {
    if (!req.staff) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    if (!roles.includes(req.staff.role)) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }
    next();
  };
};
