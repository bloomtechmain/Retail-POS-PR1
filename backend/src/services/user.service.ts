import bcrypt from 'bcryptjs';
import { query } from '../config/database';
import { createError } from '../middleware/error';
import { User } from '../types';

export const getUsers = async () => {
  const result = await query(
    `SELECT u.id, u.name, u.email, u.role_id, r.name as role_name,
       u.is_active, u.last_login, u.created_at
     FROM users u JOIN roles r ON u.role_id = r.id
     WHERE u.deleted_at IS NULL
     ORDER BY u.name ASC`,
    []
  );
  return result.rows;
};

export const createUser = async (data: {
  name: string;
  email: string;
  password: string;
  role_id: number;
  pin?: string;
}): Promise<User> => {
  const existing = await query('SELECT id FROM users WHERE email = $1', [data.email]);
  if (existing.rows.length > 0) throw createError('Email already exists', 400);

  const hashed = await bcrypt.hash(data.password, 10);
  const result = await query(
    `INSERT INTO users (name, email, password, role_id, pin, is_active)
     VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING id, name, email, role_id, is_active, created_at`,
    [data.name, data.email, hashed, data.role_id, data.pin || null]
  );
  return result.rows[0];
};

export const updateUser = async (
  id: number,
  data: { name?: string; email?: string; role_id?: number; is_active?: boolean; pin?: string; password?: string }
): Promise<User> => {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (data.name) { fields.push(`name = $${i++}`); values.push(data.name); }
  if (data.email) { fields.push(`email = $${i++}`); values.push(data.email); }
  if (data.role_id) { fields.push(`role_id = $${i++}`); values.push(data.role_id); }
  if (data.is_active !== undefined) { fields.push(`is_active = $${i++}`); values.push(data.is_active); }
  if (data.pin !== undefined) { fields.push(`pin = $${i++}`); values.push(data.pin || null); }
  if (data.password) {
    const hashed = await bcrypt.hash(data.password, 10);
    fields.push(`password = $${i++}`);
    values.push(hashed);
  }

  if (fields.length === 0) throw createError('No fields to update', 400);
  fields.push('updated_at = NOW()');
  values.push(id);

  const result = await query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${i} AND deleted_at IS NULL
     RETURNING id, name, email, role_id, is_active, created_at, updated_at`,
    values
  );
  if (result.rows.length === 0) throw createError('User not found', 404);
  return result.rows[0];
};

export const deleteUser = async (id: number): Promise<void> => {
  const result = await query(
    'UPDATE users SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  if (result.rowCount === 0) throw createError('User not found', 404);
};

export const getRoles = async () => {
  const result = await query('SELECT id, name FROM roles ORDER BY name', []);
  return result.rows;
};
