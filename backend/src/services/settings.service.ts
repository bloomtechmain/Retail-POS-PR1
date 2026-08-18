import { PoolClient } from 'pg';
import { query, transaction } from '../config/database';
import { createError } from '../middleware/error';
import { Settings } from '../types';
import { CATEGORY_TEMPLATES } from '../data/categoryTemplates';

export const getSettings = async (): Promise<Settings> => {
  const result = await query('SELECT * FROM settings WHERE id = 1', []);
  if (result.rows.length === 0) throw createError('Settings not found', 404);
  return result.rows[0];
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
  }>
): Promise<Settings> => {
  const existing = await getSettings();

  const result = await query(
    `UPDATE settings SET
       business_name = $1, business_type = $2, logo_data_url = $3, address = $4,
       phone = $5, email = $6, currency_code = $7, currency_symbol = $8,
       vat_registration_number = $9, updated_at = NOW()
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
}): Promise<Settings> => {
  return transaction(async (client: PoolClient) => {
    const existingResult = await client.query('SELECT * FROM settings WHERE id = 1 FOR UPDATE');
    if (existingResult.rows.length === 0) throw createError('Settings not found', 404);
    const existing = existingResult.rows[0];

    const updateResult = await client.query(
      `UPDATE settings SET
         business_name = $1, business_type = $2, logo_data_url = $3, address = $4,
         phone = $5, email = $6, currency_code = $7, currency_symbol = $8,
         setup_completed = TRUE, updated_at = NOW()
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
