import bcrypt from 'bcryptjs';
import { PoolClient } from 'pg';
import { transaction, query } from '../config/database';
import { createError } from '../middleware/error';
import { TENANT_SCHEMA_STATEMENTS } from '../config/tenantSchema';
import { CATEGORY_TEMPLATES } from '../data/categoryTemplates';
import { isValidPlanKey, DEFAULT_PLAN_KEY, FeatureKey } from '../data/plans';
import { runWithTenant } from '../config/tenantContext';

// Starter data for a freshly-created sandbox — enough to click around and
// try a sale immediately, not a full demo of every feature. Spans piece/kg/
// litre units on purpose so the unit-of-measure feature is visible too.
const SANDBOX_CATEGORIES = [
  { name: 'Groceries', color: '#22c55e' },
  { name: 'Beverages', color: '#3b82f6' },
  { name: 'Household', color: '#f59e0b' },
];
const SANDBOX_PRODUCTS: Array<{
  name: string; sku: string; category: string; unit_type: string;
  cost_price: number; selling_price: number; current_stock: number;
}> = [
  { name: 'Basmati Rice 5kg', sku: 'SBX-001', category: 'Groceries', unit_type: 'piece', cost_price: 8.5, selling_price: 11.99, current_stock: 40 },
  { name: 'Sugar', sku: 'SBX-002', category: 'Groceries', unit_type: 'kg', cost_price: 1.1, selling_price: 1.5, current_stock: 60 },
  { name: 'Cooking Oil 1L', sku: 'SBX-003', category: 'Groceries', unit_type: 'litre', cost_price: 2.8, selling_price: 3.75, current_stock: 30 },
  { name: 'Bottled Water 500ml', sku: 'SBX-004', category: 'Beverages', unit_type: 'piece', cost_price: 0.2, selling_price: 0.5, current_stock: 120 },
  { name: 'Orange Juice 1L', sku: 'SBX-005', category: 'Beverages', unit_type: 'piece', cost_price: 1.6, selling_price: 2.4, current_stock: 25 },
  { name: 'Instant Coffee', sku: 'SBX-006', category: 'Beverages', unit_type: 'piece', cost_price: 3.2, selling_price: 4.5, current_stock: 18 },
  { name: 'Dish Soap', sku: 'SBX-007', category: 'Household', unit_type: 'piece', cost_price: 1.4, selling_price: 2.1, current_stock: 35 },
  { name: 'Paper Towels', sku: 'SBX-008', category: 'Household', unit_type: 'piece', cost_price: 2.0, selling_price: 2.99, current_stock: 22 },
];

export interface ProvisionTenantInput {
  businessName: string;
  businessType?: string;
  templateKey?: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  planKey?: string;
  currencyCode?: string;
  currencySymbol?: string;
  // Set by a marketing agent customizing this tenant's package beyond its
  // plan's defaults — omitted by the public sign-up website, which always
  // provisions a plain, un-customized plan.
  customFeatures?: FeatureKey[];
}

export interface ProvisionTenantResult {
  tenantId: number;
  schemaName: string;
  adminEmail: string;
}

const isSafeSchemaName = (name: string): boolean => /^[a-z_][a-z0-9_]*$/.test(name);

// Creates a brand new, fully isolated tenant: a public.tenants row, its own
// Postgres schema with a full copy of every business table, an initial
// settings row, optional starter categories, and the admin login that owns
// it. Used both by the one-time existing-data migration (for tenant #1) and
// by every sign-up going forward — this is the single place "what does a
// new tenant look like" is defined.
export const provisionTenant = async (input: ProvisionTenantInput): Promise<ProvisionTenantResult> => {
  if (!input.businessName?.trim()) throw createError('Business name is required', 400);
  if (!input.adminName?.trim()) throw createError('Admin name is required', 400);
  if (!input.adminEmail?.trim()) throw createError('Admin email is required', 400);
  if (!input.adminPassword || input.adminPassword.length < 6) {
    throw createError('Password must be at least 6 characters', 400);
  }
  const planKey = input.planKey && isValidPlanKey(input.planKey) ? input.planKey : DEFAULT_PLAN_KEY;

  return transaction(async (client: PoolClient) => {
    // Runs with no tenant context active (public sign-up has no JWT yet),
    // so this transaction's connection starts on the default (public)
    // search_path — every statement here is explicitly schema-qualified
    // rather than relying on that, since we deliberately flip search_path
    // mid-transaction for the tenant-table-creation step below.
    const existing = await client.query('SELECT id FROM public.users WHERE email = $1', [input.adminEmail]);
    if (existing.rows.length > 0) throw createError('Email already in use', 400);

    const tenantResult = await client.query(
      `INSERT INTO public.tenants (schema_name, business_name, plan_key)
       VALUES ('', $1, $2) RETURNING id`,
      [input.businessName.trim(), planKey]
    );
    const tenantId = tenantResult.rows[0].id;
    const schemaName = `tenant_${tenantId}`;
    if (!isSafeSchemaName(schemaName)) throw createError('Failed to allocate tenant schema', 500);

    await client.query('UPDATE public.tenants SET schema_name = $1 WHERE id = $2', [schemaName, tenantId]);

    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET search_path TO "${schemaName}", public`);

    for (const statement of TENANT_SCHEMA_STATEMENTS) {
      await client.query(statement);
    }

    await client.query(
      `INSERT INTO settings (business_name, business_type, plan_key, custom_features, currency_code, currency_symbol, setup_completed)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE)
       ON CONFLICT (id) DO UPDATE SET business_name = $1, business_type = $2, plan_key = $3, custom_features = $4, currency_code = $5, currency_symbol = $6, setup_completed = TRUE`,
      [
        input.businessName.trim(),
        input.businessType || '',
        planKey,
        input.customFeatures ? JSON.stringify(input.customFeatures) : null,
        input.currencyCode || 'USD',
        input.currencySymbol || '$',
      ]
    );

    const template = input.templateKey ? CATEGORY_TEMPLATES[input.templateKey] : undefined;
    for (const cat of (template?.categories || [{ name: 'General', color: '#6366f1' }])) {
      await client.query('INSERT INTO categories (name, color) VALUES ($1, $2) ON CONFLICT DO NOTHING', [cat.name, cat.color]);
    }

    // Back to explicit public.* for the platform-level login record — no
    // need to reset search_path, every remaining statement is qualified.
    const roleResult = await client.query(`SELECT id FROM public.roles WHERE name = 'admin'`);
    if (roleResult.rows.length === 0) throw createError('Admin role is not seeded — cannot provision tenant', 500);
    const adminRoleId = roleResult.rows[0].id;

    const hashed = await bcrypt.hash(input.adminPassword, 10);
    await client.query(
      `INSERT INTO public.users (tenant_id, name, email, password, role_id, is_active)
       VALUES ($1,$2,$3,$4,$5,TRUE)`,
      [tenantId, input.adminName.trim(), input.adminEmail.trim(), hashed, adminRoleId]
    );

    return { tenantId, schemaName, adminEmail: input.adminEmail.trim() };
  });
};

// Lets an agent/admin change a customer's feature set anytime after
// signup, not just at creation — the very next request that tenant makes
// picks it up immediately, since requireFeature reads settings.custom_features
// live on every request (no cache, no restart needed). Called internally by
// apps/admin-dashboard/backend (see requireInternalApiKey on the route);
// this runs with no tenant context of its own (server-to-server call, no
// tenant JWT), so it must look up the schema and open one explicitly.
export const updateTenantFeatures = async (
  tenantId: number,
  customFeatures: FeatureKey[] | null
): Promise<void> => {
  const tenantResult = await query('SELECT schema_name FROM public.tenants WHERE id = $1', [tenantId]);
  if (tenantResult.rows.length === 0) throw createError('Tenant not found', 404);
  const schemaName = tenantResult.rows[0].schema_name;

  await runWithTenant(schemaName, async () => {
    await query(
      'UPDATE settings SET custom_features = $1, updated_at = NOW() WHERE id = 1',
      [customFeatures && customFeatures.length > 0 ? JSON.stringify(customFeatures) : null]
    );
  });
};

// Manual enable/disable switch an agent/admin can flip anytime from the
// admin dashboard — separate from subscription expiry (which is
// date-derived and owned by apps/admin-dashboard/backend's platform_customers
// table). Blocks future logins via the loginUser check below; cannot force
// out an already-issued JWT still in a browser somewhere (no server-side
// session store in this codebase — same limitation the expiry check already
// has).
export const setTenantActive = async (tenantId: number, isActive: boolean): Promise<void> => {
  const result = await query('UPDATE public.tenants SET is_active = $1 WHERE id = $2', [isActive, tenantId]);
  if (result.rowCount === 0) throw createError('Tenant not found', 404);
};

// Irreversibly destroys a tenant: every product/sale/GRN/etc. they ever
// had, gone. Called only for a platform_customers row apps/admin-dashboard/
// backend has already confirmed is meant to be permanently deleted — this
// function itself has no extra confirmation, callers must be certain.
export const deleteTenant = async (tenantId: number): Promise<void> => {
  const tenantResult = await query('SELECT schema_name FROM public.tenants WHERE id = $1', [tenantId]);
  if (tenantResult.rows.length === 0) throw createError('Tenant not found', 404);
  const schemaName = tenantResult.rows[0].schema_name;
  if (!isSafeSchemaName(schemaName)) throw createError('Refusing to delete: invalid schema name', 500);

  await transaction(async (client: PoolClient) => {
    // public.users.tenant_id -> tenants(id) has no ON DELETE CASCADE, so the
    // tenant row can't be deleted while these still reference it.
    await client.query('DELETE FROM public.users WHERE tenant_id = $1', [tenantId]);
    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    // Clean up the sandbox-mode sibling schema too, if this tenant ever
    // switched into sandbox (see ensureSandboxSchema) — otherwise it's left
    // behind forever with nothing left to reference it.
    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}_sandbox" CASCADE`);
    await client.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
  });
};

// Called from POST /auth/sandbox the first time a given account switches
// into sandbox mode. `liveSchemaName` is the schema the caller's real
// (non-sandbox) token resolves to — a hosted tenant's "tenant_N", or
// undefined for Electron, which has no tenant schema at all and only ever
// uses "public" for its real data. The sandbox schema is always that
// value's sibling: "tenant_N_sandbox", or the fixed name "sandbox" for
// Electron. Idempotent — if the schema already exists (a previous switch
// already created it), this is a no-op so nothing already added there by
// the user is ever touched or reset.
export const ensureSandboxSchema = async (liveSchemaName: string | undefined): Promise<string> => {
  const sandboxSchema = liveSchemaName ? `${liveSchemaName}_sandbox` : 'sandbox';
  if (!isSafeSchemaName(sandboxSchema)) throw createError('Invalid sandbox schema name', 500);

  const existing = await query(
    `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`,
    [sandboxSchema]
  );
  if (existing.rows.length > 0) return sandboxSchema;

  // Mirror the live plan/currency/business name into the sandbox once, at
  // creation, so feature-gating and formatting match what the user actually
  // has. This is a one-time snapshot, not kept in sync afterward — the
  // sandbox is for learning the system, not a live mirror of the account.
  const liveSettingsResult = await runWithTenant(liveSchemaName || 'public', () =>
    query('SELECT * FROM settings WHERE id = 1', [])
  );
  const live = liveSettingsResult.rows[0];

  return transaction(async (client: PoolClient) => {
    await client.query(`CREATE SCHEMA "${sandboxSchema}"`);
    await client.query(`SET search_path TO "${sandboxSchema}", public`);

    for (const statement of TENANT_SCHEMA_STATEMENTS) {
      await client.query(statement);
    }

    await client.query(
      `INSERT INTO settings (business_name, business_type, plan_key, custom_features, currency_code, currency_symbol, setup_completed)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE)
       ON CONFLICT (id) DO UPDATE SET business_name = $1, business_type = $2, plan_key = $3, custom_features = $4, currency_code = $5, currency_symbol = $6, setup_completed = TRUE`,
      [
        live?.business_name ? `${live.business_name} (Sandbox)` : 'My Sandbox Business',
        live?.business_type || '',
        live?.plan_key || DEFAULT_PLAN_KEY,
        live?.custom_features ? JSON.stringify(live.custom_features) : null,
        live?.currency_code || 'USD',
        live?.currency_symbol || '$',
      ]
    );

    const categoryIdByName: Record<string, number> = {};
    for (const cat of SANDBOX_CATEGORIES) {
      const result = await client.query(
        'INSERT INTO categories (name, color) VALUES ($1, $2) RETURNING id',
        [cat.name, cat.color]
      );
      categoryIdByName[cat.name] = result.rows[0].id;
    }

    for (const p of SANDBOX_PRODUCTS) {
      await client.query(
        `INSERT INTO products (name, sku, category_id, unit_type, cost_price, selling_price, current_stock, costing_method)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'weighted_average')`,
        [p.name, p.sku, categoryIdByName[p.category] || null, p.unit_type, p.cost_price, p.selling_price, p.current_stock]
      );
    }

    return sandboxSchema;
  });
};
