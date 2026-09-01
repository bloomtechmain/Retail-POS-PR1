import bcrypt from 'bcryptjs';
import { query } from '../config/database';
import { createError } from '../middleware/error';
import { User } from '../types';
import { PLANS, DEFAULT_PLAN_KEY } from '../data/plans';
import { getCurrentTenantId } from '../config/tenantContext';
import { markPasswordChanged } from '../utils/tokenRevocation';

// `users` is the one table shared across every tenant (see tenantContext.ts)
// rather than living inside each tenant's own schema, so every query here
// must filter by tenant_id explicitly — nothing else does that for us.
// Electron has no `tenant_id` column on its local `users` table at all
// (single-tenant, see AuthPayload's comment on `tenant_id`), so
// `getCurrentTenantId()` is undefined there and these functions fall back
// to their original unscoped form, unchanged from before this fix.

export const getUsers = async () => {
  const tenantId = getCurrentTenantId();
  const result = await query(
    `SELECT u.id, u.name, u.email, u.role_id, r.name as role_name,
       u.is_active, u.last_login, u.created_at
     FROM users u JOIN roles r ON u.role_id = r.id
     WHERE u.deleted_at IS NULL${tenantId !== undefined ? ' AND u.tenant_id = $1' : ''}
     ORDER BY u.name ASC`,
    tenantId !== undefined ? [tenantId] : []
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
  if (!data.password || data.password.length < 6) {
    throw createError('Password must be at least 6 characters', 400);
  }
  const tenantId = getCurrentTenantId();

  const existing = await query(
    `SELECT id FROM users WHERE email = $1${tenantId !== undefined ? ' AND tenant_id = $2' : ''}`,
    tenantId !== undefined ? [data.email, tenantId] : [data.email]
  );
  if (existing.rows.length > 0) throw createError('Email already exists', 400);

  const settingsResult = await query('SELECT plan_key FROM settings WHERE id = 1', []);
  const planKey = settingsResult.rows[0]?.plan_key || DEFAULT_PLAN_KEY;
  const maxUsers = PLANS[planKey]?.max_users;
  if (maxUsers !== null && maxUsers !== undefined) {
    const countResult = await query(
      `SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND is_active = TRUE${tenantId !== undefined ? ' AND tenant_id = $1' : ''}`,
      tenantId !== undefined ? [tenantId] : []
    );
    if (parseInt(countResult.rows[0].count) >= maxUsers) {
      throw createError(
        `Your ${PLANS[planKey].name} plan allows up to ${maxUsers} staff account${maxUsers === 1 ? '' : 's'}. Upgrade in Settings to add more.`,
        403
      );
    }
  }

  const hashed = await bcrypt.hash(data.password, 10);
  const result = await query(
    tenantId !== undefined
      ? `INSERT INTO users (tenant_id, name, email, password, role_id, pin, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,TRUE) RETURNING id, name, email, role_id, is_active, created_at`
      : `INSERT INTO users (name, email, password, role_id, pin, is_active)
         VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING id, name, email, role_id, is_active, created_at`,
    tenantId !== undefined
      ? [tenantId, data.name, data.email, hashed, data.role_id, data.pin || null]
      : [data.name, data.email, hashed, data.role_id, data.pin || null]
  );
  return result.rows[0];
};

export const updateUser = async (
  id: number,
  data: { name?: string; email?: string; role_id?: number; is_active?: boolean; pin?: string; password?: string }
): Promise<User> => {
  const tenantId = getCurrentTenantId();

  if (data.email) {
    const existing = await query(
      `SELECT id FROM users WHERE email = $1 AND id != $2${tenantId !== undefined ? ' AND tenant_id = $3' : ''}`,
      tenantId !== undefined ? [data.email, id, tenantId] : [data.email, id]
    );
    if (existing.rows.length > 0) throw createError('Email already exists', 400);
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (data.name) { fields.push(`name = $${i++}`); values.push(data.name); }
  if (data.email) { fields.push(`email = $${i++}`); values.push(data.email); }
  if (data.role_id) { fields.push(`role_id = $${i++}`); values.push(data.role_id); }
  if (data.is_active !== undefined) { fields.push(`is_active = $${i++}`); values.push(data.is_active); }
  if (data.pin !== undefined) { fields.push(`pin = $${i++}`); values.push(data.pin || null); }
  if (data.password) {
    if (data.password.length < 6) throw createError('Password must be at least 6 characters', 400);
    const hashed = await bcrypt.hash(data.password, 10);
    fields.push(`password = $${i++}`);
    values.push(hashed);
  }

  if (fields.length === 0) throw createError('No fields to update', 400);
  fields.push('updated_at = NOW()');
  values.push(id);

  let tenantClause = '';
  if (tenantId !== undefined) {
    tenantClause = ` AND tenant_id = $${i + 1}`;
    values.push(tenantId);
  }

  const result = await query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${i} AND deleted_at IS NULL${tenantClause}
     RETURNING id, name, email, role_id, is_active, created_at, updated_at`,
    values
  );
  if (result.rows.length === 0) throw createError('User not found', 404);
  if (data.password) markPasswordChanged(id);
  return result.rows[0];
};

export const deleteUser = async (id: number): Promise<void> => {
  const tenantId = getCurrentTenantId();
  const result = await query(
    `UPDATE users SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL${tenantId !== undefined ? ' AND tenant_id = $2' : ''}`,
    tenantId !== undefined ? [id, tenantId] : [id]
  );
  if (result.rowCount === 0) throw createError('User not found', 404);
};

export const getRoles = async () => {
  const result = await query('SELECT id, name FROM roles ORDER BY name', []);
  return result.rows;
};
