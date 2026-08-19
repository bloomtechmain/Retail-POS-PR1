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

  // The Electron desktop app's local database has no `tenants` table at all
  // (single flat schema, one business, no isolation needed) — `user.tenant_id`
  // is simply absent from the row there. Only the hosted multi-tenant
  // backend (where `users.tenant_id` is NOT NULL) needs this lookup.
  let schemaName: string | undefined;
  if (user.tenant_id != null) {
    // Runs pre-tenant-context (search_path is still plain "public" here), so
    // this resolves against public.tenants exactly like the users/roles
    // lookup above did — no different treatment needed.
    const tenantResult = await query('SELECT schema_name FROM tenants WHERE id = $1', [user.tenant_id]);
    if (tenantResult.rows.length === 0) {
      throw createError('This account is not linked to an active business. Contact support.', 401);
    }
    schemaName = tenantResult.rows[0].schema_name;

    // Subscription renewal check — platform_customers is owned/written by
    // apps/admin-dashboard/backend, but lives in this same shared Postgres
    // database, so this is a plain read-only cross-table lookup (same
    // pattern that service uses in reverse for its own dashboard stats).
    // Most tenants (self-serve website signups, pre-existing data) have no
    // matching row at all — login is completely unaffected for them. If the
    // table doesn't exist at all (admin-dashboard/backend never deployed/
    // migrated on this install), fail OPEN — never let a missing optional
    // table break every login on this backend.
    try {
      const subscriptionResult = await query(
        'SELECT subscription_end_date FROM platform_customers WHERE tenant_id = $1',
        [user.tenant_id]
      );
      if (subscriptionResult.rows.length > 0) {
        const endDate = subscriptionResult.rows[0].subscription_end_date;
        if (endDate && new Date(endDate).getTime() < Date.now()) {
          throw createError('Your subscription has expired. Contact your agent to reactivate your account.', 403);
        }
      }
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 403) throw err;
      console.warn('[auth] Skipping subscription check — platform_customers unavailable:', (err as Error).message);
    }
  }

  await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

  const token = signToken({
    id: user.id,
    email: user.email,
    role_id: user.role_id,
    role_name: user.role_name,
    permissions: user.permissions,
    tenant_id: user.tenant_id ?? undefined,
    schema_name: schemaName,
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
