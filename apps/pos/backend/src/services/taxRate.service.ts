import { query } from '../config/database';
import { createError } from '../middleware/error';
import { TaxRate } from '../types';

export const getTaxRates = async (activeOnly = false): Promise<TaxRate[]> => {
  const where = activeOnly ? 'WHERE is_active = TRUE' : '';
  const result = await query(`SELECT * FROM tax_rates ${where} ORDER BY name ASC`, []);
  return result.rows;
};

const validate = (data: Partial<TaxRate>) => {
  if (!data.name?.trim()) throw createError('Tax name is required', 400);
  const rate = Number(data.rate);
  if (data.rate == null || Number.isNaN(rate) || rate < 0 || rate > 100) {
    throw createError('Tax rate must be between 0 and 100', 400);
  }
};

export const createTaxRate = async (data: Partial<TaxRate>): Promise<TaxRate> => {
  validate(data);
  const result = await query(
    `INSERT INTO tax_rates (name, rate, is_active) VALUES ($1,$2,$3) RETURNING *`,
    [data.name!.trim(), data.rate, data.is_active !== false]
  );
  return result.rows[0];
};

export const updateTaxRate = async (id: number, data: Partial<TaxRate>): Promise<TaxRate> => {
  validate(data);
  const result = await query(
    `UPDATE tax_rates SET name = $1, rate = $2, is_active = $3, updated_at = NOW() WHERE id = $4 RETURNING *`,
    [data.name!.trim(), data.rate, data.is_active !== false, id]
  );
  if (result.rows.length === 0) throw createError('Tax rate not found', 404);
  return result.rows[0];
};

export const deleteTaxRate = async (id: number): Promise<void> => {
  // Hard delete is safe — sale_item_taxes snapshots the name/rate at the
  // time of sale (tax_rate_id is only a soft, nullable reference), so
  // historical VAT invoices are unaffected by removing a tax from the
  // registry.
  const result = await query('DELETE FROM tax_rates WHERE id = $1', [id]);
  if (result.rowCount === 0) throw createError('Tax rate not found', 404);
};
