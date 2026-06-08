import { Response, NextFunction } from 'express';
import * as userService from '../services/user.service';
import { AuthRequest } from '../middleware/auth';

export const list = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const users = await userService.getUsers();
    res.json({ success: true, data: users });
  } catch (err) { next(err); }
};

export const create = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await userService.createUser(req.body);
    res.status(201).json({ success: true, data: user });
  } catch (err) { next(err); }
};

export const update = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await userService.updateUser(parseInt(req.params.id), req.body);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

export const remove = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await userService.deleteUser(parseInt(req.params.id));
    res.json({ success: true, message: 'User deleted' });
  } catch (err) { next(err); }
};

export const roles = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await userService.getRoles();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};
