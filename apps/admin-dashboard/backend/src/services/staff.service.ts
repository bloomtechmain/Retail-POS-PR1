import bcrypt from 'bcryptjs';
import { query } from '../config/database';
import { createError } from '../middleware/error';
import { signStaffToken } from '../utils/jwt';
import { StaffAuthPayload } from '../types';
import { provisionOnlineTenant, updateTenantFeatures } from './posBackendClient';
import { generateLicense, setLicenseActive } from './licenseServerClient';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Expired/active is always derived from subscription_end_date — never
// stored as a separate status, so it can't drift out of sync with the
// actual date. Same computation apps/pos/backend's loginUser uses.
const withSubscriptionStatus = <T extends { subscription_end_date: string | Date }>(row: T) => {
  const endDate = new Date(row.subscription_end_date);
  const daysRemaining = Math.ceil((endDate.getTime() - Date.now()) / MS_PER_DAY);
  return { ...row, days_remaining: daysRemaining, is_expired: daysRemaining < 0 };
};

export const loginStaff = async (email: string, password: string) => {
  const result = await query(
    `SELECT * FROM staff WHERE email = $1 AND deleted_at IS NULL`,
    [email]
  );
  if (result.rows.length === 0) throw createError('Invalid email or password', 401);

  const staff = result.rows[0];
  if (!staff.is_active) throw createError('Account is disabled. Contact the platform admin.', 401);

  const isMatch = await bcrypt.compare(password, staff.password);
  if (!isMatch) throw createError('Invalid email or password', 401);

  const payload: StaffAuthPayload = {
    staff_id: staff.id,
    role: staff.role,
    name: staff.name,
    email: staff.email,
  };
  const token = signStaffToken(payload);

  return { token, staff: { id: staff.id, name: staff.name, email: staff.email, role: staff.role } };
};

export const createAgent = async (
  data: { name: string; email: string; password: string },
  createdByStaffId: number
) => {
  if (!data.name?.trim()) throw createError('Name is required', 400);
  if (!data.email?.trim()) throw createError('Email is required', 400);
  if (!data.password || data.password.length < 6) {
    throw createError('Password must be at least 6 characters', 400);
  }

  const existing = await query('SELECT id FROM staff WHERE email = $1', [data.email.trim()]);
  if (existing.rows.length > 0) throw createError('Email already in use', 400);

  const hashed = await bcrypt.hash(data.password, 10);
  const result = await query(
    `INSERT INTO staff (name, email, password, role, created_by)
     VALUES ($1, $2, $3, 'agent', $4)
     RETURNING id, name, email, role, is_active, created_at`,
    [data.name.trim(), data.email.trim(), hashed, createdByStaffId]
  );
  return result.rows[0];
};

export const listAgents = async () => {
  const result = await query(
    `SELECT id, name, email, role, is_active, created_at
     FROM staff WHERE role = 'agent' AND deleted_at IS NULL ORDER BY created_at DESC`,
    []
  );
  return result.rows;
};

export const setAgentActive = async (agentId: number, isActive: boolean) => {
  const result = await query(
    `UPDATE staff SET is_active = $1, updated_at = NOW()
     WHERE id = $2 AND role = 'agent' RETURNING id, name, email, role, is_active`,
    [isActive, agentId]
  );
  if (result.rows.length === 0) throw createError('Agent not found', 404);
  return result.rows[0];
};

export interface CreateCustomerInput {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  deliveryType: 'online' | 'offline';
  planKey: string;
  customFeatures?: string[];
  adminEmail: string;
  adminPassword: string;
  notes?: string;
}

// The core sale-completion flow: an agent (or admin) turns a customer
// decision — online vs offline, which package, with/without customization —
// into either a fully provisioned hosted tenant or an activatable license
// key, and records it on the shared platform_customers ledger either way.
// Plan-key/feature validity is enforced downstream: pos-backend's
// provisionTenant() validates planKey against its own catalog for the
// online path (see posBackendClient.ts) — this service deliberately does
// not duplicate that catalog.
export const createCustomer = async (input: CreateCustomerInput, agentId: number) => {
  if (!input.customerName?.trim()) throw createError('Customer name is required', 400);
  if (!input.customerEmail?.trim()) throw createError('Customer email is required', 400);
  if (!input.adminEmail?.trim()) throw createError('Login email is required', 400);
  if (!input.adminPassword || input.adminPassword.length < 6) {
    throw createError('Password must be at least 6 characters', 400);
  }
  if (input.deliveryType !== 'online' && input.deliveryType !== 'offline') {
    throw createError('deliveryType must be "online" or "offline"', 400);
  }
  const planKey = input.planKey || 'basic';
  const customFeatures = input.customFeatures && input.customFeatures.length > 0 ? input.customFeatures : undefined;

  let tenantId: number | null = null;
  let licenseKey: string | null = null;

  if (input.deliveryType === 'online') {
    const result = await provisionOnlineTenant({
      businessName: input.customerName.trim(),
      adminName: input.customerName.trim(),
      adminEmail: input.adminEmail.trim(),
      adminPassword: input.adminPassword,
      planKey,
      customFeatures,
    });
    tenantId = result.tenantId;
  } else {
    const result = await generateLicense({
      customer_name: input.customerName.trim(),
      customer_email: input.customerEmail.trim(),
      notes: input.notes,
      preset_admin_email: input.adminEmail.trim(),
      preset_admin_password: input.adminPassword,
    });
    licenseKey = result.licenseKey;
  }

  const row = await query(
    `INSERT INTO platform_customers
       (agent_id, customer_name, customer_email, customer_phone, delivery_type, plan_key, custom_features, tenant_id, license_key, notes, subscription_end_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW() + INTERVAL '1 month')
     RETURNING *`,
    [
      agentId,
      input.customerName.trim(),
      input.customerEmail.trim(),
      input.customerPhone || null,
      input.deliveryType,
      planKey,
      customFeatures ? JSON.stringify(customFeatures) : null,
      tenantId,
      licenseKey,
      input.notes || null,
    ]
  );

  return {
    ...row.rows[0],
    // Returned once so the agent can hand it to the customer immediately —
    // never stored in platform_customers itself.
    adminEmail: input.adminEmail.trim(),
    adminPassword: input.adminPassword,
  };
};

export const listCustomers = async (staff: { staff_id: number; role: 'admin' | 'agent' }) => {
  if (staff.role === 'admin') {
    const result = await query(
      `SELECT pc.*, s.name as agent_name
       FROM platform_customers pc JOIN staff s ON s.id = pc.agent_id
       ORDER BY pc.created_at DESC`,
      []
    );
    return result.rows.map(withSubscriptionStatus);
  }
  const result = await query(
    `SELECT * FROM platform_customers WHERE agent_id = $1 ORDER BY created_at DESC`,
    [staff.staff_id]
  );
  return result.rows.map(withSubscriptionStatus);
};

export const getCustomerDetail = async (customerId: number, staff: { staff_id: number; role: 'admin' | 'agent' }) => {
  const result = await query(
    `SELECT pc.*, s.name AS agent_name, s.email AS agent_email
     FROM platform_customers pc JOIN staff s ON s.id = pc.agent_id
     WHERE pc.id = $1`,
    [customerId]
  );
  if (result.rows.length === 0) throw createError('Customer not found', 404);
  const row = result.rows[0];
  if (staff.role !== 'admin' && row.agent_id !== staff.staff_id) {
    throw createError('You can only view customers you created', 403);
  }
  return withSubscriptionStatus(row);
};

// Agent confirms payment was received (outside this system — cash/bank
// transfer, checked manually) and renews the customer's package by another
// month from today. For offline customers this also restores the license
// (see licenseServerClient.setLicenseActive) — blocks/unblocks future
// activations; cannot retroactively affect an already-running install (see
// plan notes on Electron's one-time activation check).
export const reactivateCustomer = async (customerId: number, staff: { staff_id: number; role: 'admin' | 'agent' }) => {
  const existing = await query('SELECT * FROM platform_customers WHERE id = $1', [customerId]);
  if (existing.rows.length === 0) throw createError('Customer not found', 404);
  const row = existing.rows[0];
  if (staff.role !== 'admin' && row.agent_id !== staff.staff_id) {
    throw createError('You can only reactivate customers you created', 403);
  }

  if (row.delivery_type === 'offline' && row.license_key) {
    await setLicenseActive(row.license_key, true);
  }

  const result = await query(
    `UPDATE platform_customers
     SET subscription_end_date = NOW() + INTERVAL '1 month', last_payment_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [customerId]
  );
  return withSubscriptionStatus(result.rows[0]);
};

// Lets an agent/admin change a customer's package features anytime after
// signup, not just at creation. For online customers this pushes live to
// their tenant (see posBackendClient.updateTenantFeatures — takes effect on
// their very next request, no restart needed). For offline customers there
// is no live install to push to — Electron only checks its license once at
// first activation (same limitation already noted for reactivateCustomer /
// license revoke-restore) — this just updates the ledger record for now,
// which is what an agent would reference when the customer's desktop app
// eventually needs reinstalling/reactivating anyway.
export const updateCustomerFeatures = async (
  customerId: number,
  staff: { staff_id: number; role: 'admin' | 'agent' },
  customFeatures: string[] | null
) => {
  const existing = await query('SELECT * FROM platform_customers WHERE id = $1', [customerId]);
  if (existing.rows.length === 0) throw createError('Customer not found', 404);
  const row = existing.rows[0];
  if (staff.role !== 'admin' && row.agent_id !== staff.staff_id) {
    throw createError('You can only edit customers you created', 403);
  }

  const normalized = customFeatures && customFeatures.length > 0 ? customFeatures : null;

  if (row.delivery_type === 'online' && row.tenant_id) {
    await updateTenantFeatures(row.tenant_id, normalized);
  }

  const result = await query(
    `UPDATE platform_customers SET custom_features = $1 WHERE id = $2 RETURNING *`,
    [normalized ? JSON.stringify(normalized) : null, customerId]
  );
  return withSubscriptionStatus(result.rows[0]);
};

// Every number below comes from a live query against the same shared
// Postgres database apps/pos/backend uses — public.tenants/public.users are
// read directly here (this service already holds full DB credentials to
// that same database; it's a read, never a write, so it doesn't cross any
// ownership boundary — provisioning still only ever happens through
// pos-backend's own routes).
export const getAdminDashboardStats = async () => {
  const [
    agentCounts,
    customerTotals,
    deliveryBreakdown,
    planBreakdown,
    tenantCount,
    userCount,
    recentCustomers,
    topAgents,
    dailySignups,
  ] = await Promise.all([
    query(`SELECT
             COUNT(*) FILTER (WHERE role = 'agent' AND deleted_at IS NULL) AS total_agents,
             COUNT(*) FILTER (WHERE role = 'agent' AND deleted_at IS NULL AND is_active) AS active_agents
           FROM staff`, []),
    query(`SELECT COUNT(*) AS total_customers FROM platform_customers`, []),
    query(`SELECT delivery_type, COUNT(*) AS count FROM platform_customers GROUP BY delivery_type`, []),
    query(`SELECT plan_key, COUNT(*) AS count FROM platform_customers GROUP BY plan_key ORDER BY count DESC`, []),
    query(`SELECT COUNT(*) AS total_tenants FROM tenants WHERE is_active = TRUE`, []),
    query(`SELECT COUNT(*) AS total_users FROM users WHERE deleted_at IS NULL`, []),
    query(
      `SELECT pc.id, pc.customer_name, pc.customer_email, pc.delivery_type, pc.plan_key, pc.created_at, s.name AS agent_name
       FROM platform_customers pc JOIN staff s ON s.id = pc.agent_id
       ORDER BY pc.created_at DESC LIMIT 10`,
      []
    ),
    query(
      `SELECT s.id, s.name, s.email, COUNT(pc.id) AS customer_count
       FROM staff s LEFT JOIN platform_customers pc ON pc.agent_id = s.id
       WHERE s.role = 'agent' AND s.deleted_at IS NULL
       GROUP BY s.id, s.name, s.email
       ORDER BY customer_count DESC, s.name ASC
       LIMIT 10`,
      []
    ),
    query(
      `SELECT to_char(created_at, 'YYYY-MM-DD') AS day, COUNT(*) AS count
       FROM platform_customers
       WHERE created_at >= NOW() - INTERVAL '13 days'
       GROUP BY day ORDER BY day ASC`,
      []
    ),
  ]);

  return {
    total_agents: Number(agentCounts.rows[0].total_agents),
    active_agents: Number(agentCounts.rows[0].active_agents),
    total_customers: Number(customerTotals.rows[0].total_customers),
    delivery_breakdown: deliveryBreakdown.rows.map((r) => ({ delivery_type: r.delivery_type, count: Number(r.count) })),
    plan_breakdown: planBreakdown.rows.map((r) => ({ plan_key: r.plan_key, count: Number(r.count) })),
    total_tenants: Number(tenantCount.rows[0].total_tenants),
    total_pos_users: Number(userCount.rows[0].total_users),
    recent_customers: recentCustomers.rows,
    top_agents: topAgents.rows.map((r) => ({ ...r, customer_count: Number(r.customer_count) })),
    daily_signups_last_14_days: dailySignups.rows.map((r) => ({ day: r.day, count: Number(r.count) })),
  };
};

export const getAgentDashboardStats = async (agentId: number) => {
  const [totals, deliveryBreakdown, planBreakdown, recentCustomers] = await Promise.all([
    query(`SELECT COUNT(*) AS total_customers FROM platform_customers WHERE agent_id = $1`, [agentId]),
    query(`SELECT delivery_type, COUNT(*) AS count FROM platform_customers WHERE agent_id = $1 GROUP BY delivery_type`, [agentId]),
    query(`SELECT plan_key, COUNT(*) AS count FROM platform_customers WHERE agent_id = $1 GROUP BY plan_key ORDER BY count DESC`, [agentId]),
    query(
      `SELECT id, customer_name, customer_email, delivery_type, plan_key, created_at
       FROM platform_customers WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [agentId]
    ),
  ]);

  return {
    total_customers: Number(totals.rows[0].total_customers),
    delivery_breakdown: deliveryBreakdown.rows.map((r) => ({ delivery_type: r.delivery_type, count: Number(r.count) })),
    plan_breakdown: planBreakdown.rows.map((r) => ({ plan_key: r.plan_key, count: Number(r.count) })),
    recent_customers: recentCustomers.rows,
  };
};
