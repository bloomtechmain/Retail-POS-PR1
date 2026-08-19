import jwt from 'jsonwebtoken';
import { StaffAuthPayload } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

export const signStaffToken = (payload: StaffAuthPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
};

export const verifyStaffToken = (token: string): StaffAuthPayload => {
  return jwt.verify(token, JWT_SECRET) as StaffAuthPayload;
};
