import { PoolClient } from 'pg';
import fs from 'fs';
import { query, transaction } from '../config/database';
import { createError } from '../middleware/error';
import { Settings } from '../types';
import { CATEGORY_TEMPLATES } from '../data/categoryTemplates';
import { getPlanCatalog, isValidPlanKey, DEFAULT_PLAN_KEY } from '../data/plans';

// settings is per-tenant on the hosted backend (public.* only for the
// Electron flat-schema app, which has no tenant context at all by design —
// see AuthPayload.schema_name). With NO valid token at all (the frontend
// calls this eagerly on every app mount, including the login screen before
// any token exists), there is no tenant to resolve — the caller (see
// settings.controller.ts) returns this without ever reaching the DB.
export const GENERIC_DEFAULTS: Settings = {
  id: 1,
  business_name: 'BloomPOS',
  business_type: '',
  currency_code: 'USD',
  currency_symbol: '$',
  plan_key: DEFAULT_PLAN_KEY,
  setup_completed: false,
  created_at: new Date(0),
  updated_at: new Date(0),
};

export const getSettings = async (): Promise<Settings> => {
  const result = await query('SELECT * FROM settings WHERE id = 1', []);
  if (result.rows.length === 0) throw createError('Settings not found', 404);
  return result.rows[0];
};

// Electron-only: a marketing agent presets a customer's first login for an
// offline sale, embedded in the license activation (see main.js's
// activation-complete handler, which writes this file). Read once, then
// deleted — a hosted/self-service install has no PRESET_CREDENTIALS_PATH
// env var at all, so this is a no-op there.
export const consumePresetAdminCredentials = (): { email: string; password: string } | null => {
  const filePath = process.env.PRESET_CREDENTIALS_PATH;
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as { email: string; password: string };
    fs.unlinkSync(filePath);
    return parsed;
  } catch {
    return null;
  }
};

export const updateSettings = async (
  data: Partial<{
    business_name: string;
    business_type: string;
    logo_data_url: string;
    address: string;
    phone: string;
    email: string;
    currency_code: string;
    currency_symbol: string;
    vat_registration_number: string;
    plan_key: string;
  }>
): Promise<Settings> => {
  const existing = await getSettings();

  if (data.plan_key !== undefined && !isValidPlanKey(data.plan_key)) {
    throw createError('Invalid plan', 400);
  }

  const result = await query(
    `UPDATE settings SET
       business_name = $1, business_type = $2, logo_data_url = $3, address = $4,
       phone = $5, email = $6, currency_code = $7, currency_symbol = $8,
       vat_registration_number = $9, plan_key = $10, updated_at = NOW()
     WHERE id = 1 RETURNING *`,
    [
      data.business_name?.trim() || existing.business_name,
      data.business_type ?? existing.business_type,
      data.logo_data_url ?? existing.logo_data_url,
      data.address ?? existing.address,
      data.phone ?? existing.phone,
      data.email ?? existing.email,
      data.currency_code?.trim() || existing.currency_code,
      data.currency_symbol?.trim() || existing.currency_symbol,
      data.vat_registration_number ?? existing.vat_registration_number,
      data.plan_key ?? existing.plan_key,
    ]
  );
  return result.rows[0];
};

export const listTemplates = () => {
  return Object.entries(CATEGORY_TEMPLATES).map(([key, template]) => ({
    key,
    label: template.label,
    categories: template.categories,
  }));
};

export const listPlans = () => getPlanCatalog();

export const completeSetup = async (data: {
  business_name?: string;
  business_type?: string;
  logo_data_url?: string;
  address?: string;
  phone?: string;
  email?: string;
  currency_code?: string;
  currency_symbol?: string;
  template_key?: string;
  plan_key?: string;
}): Promise<Settings> => {
  if (data.plan_key !== undefined && !isValidPlanKey(data.plan_key)) {
    throw createError('Invalid plan', 400);
  }

  return transaction(async (client: PoolClient) => {
    const existingResult = await client.query('SELECT * FROM settings WHERE id = 1 FOR UPDATE');
    if (existingResult.rows.length === 0) throw createError('Settings not found', 404);
    const existing = existingResult.rows[0];

    const updateResult = await client.query(
      `UPDATE settings SET
         business_name = $1, business_type = $2, logo_data_url = $3, address = $4,
         phone = $5, email = $6, currency_code = $7, currency_symbol = $8,
         plan_key = $9, setup_completed = TRUE, updated_at = NOW()
       WHERE id = 1 RETURNING *`,
      [
        data.business_name?.trim() || existing.business_name,
        data.business_type ?? existing.business_type,
        data.logo_data_url ?? existing.logo_data_url,
        data.address ?? existing.address,
        data.phone ?? existing.phone,
        data.email ?? existing.email,
        data.currency_code?.trim() || existing.currency_code,
        data.currency_symbol?.trim() || existing.currency_symbol,
        data.plan_key || existing.plan_key || DEFAULT_PLAN_KEY,
      ]
    );

    const template = data.template_key ? CATEGORY_TEMPLATES[data.template_key] : undefined;
    if (template) {
      for (const cat of template.categories) {
        const exists = await client.query('SELECT id FROM categories WHERE name = $1', [cat.name]);
        if (exists.rows.length === 0) {
          await client.query('INSERT INTO categories (name, color) VALUES ($1, $2)', [cat.name, cat.color]);
        }
      }
    }

    return updateResult.rows[0];
  });
};
