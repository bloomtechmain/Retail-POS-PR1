import bcrypt from 'bcryptjs';
import { PoolClient } from 'pg';
import { transaction } from '../config/database';
import { createError } from '../middleware/error';
import { TENANT_SCHEMA_STATEMENTS } from '../config/tenantSchema';
import { CATEGORY_TEMPLATES } from '../data/categoryTemplates';
import { isValidPlanKey, DEFAULT_PLAN_KEY, FeatureKey } from '../data/plans';

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
