import bcrypt from 'bcryptjs';
import { query } from '../config/database';
import { signToken } from '../utils/jwt';
import { createError } from '../middleware/error';

export const loginUser = async (email: string, password: string) => {
  const result = await query(
    `SELECT u.*, r.name as role_name, r.permissions
     FROM users u
     JOIN roles r ON u.role_id = r.id
     WHERE u.email = $1 AND u.deleted_at IS NULL`,
    [email]
  );

  if (result.rows.length === 0) {
    throw createError('Invalid email or password', 401);
  }

  const user = result.rows[0];

  if (!user.is_active) {
    throw createError('Account is disabled. Contact administrator.', 401);
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw createError('Invalid email or password', 401);
  }

  await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

  const token = signToken({
    id: user.id,
    email: user.email,
    role_id: user.role_id,
    role_name: user.role_name,
    permissions: user.permissions,
  });

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role_name: user.role_name,
      permissions: user.permissions,
    },
  };
};

export const changePassword = async (userId: number, currentPassword: string, newPassword: string) => {
  const result = await query('SELECT password FROM users WHERE id = $1', [userId]);
  if (result.rows.length === 0) throw createError('User not found', 404);

  const isMatch = await bcrypt.compare(currentPassword, result.rows[0].password);
  if (!isMatch) throw createError('Current password is incorrect', 400);

  const hashed = await bcrypt.hash(newPassword, 10);
  await query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [hashed, userId]);
};
