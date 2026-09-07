import { PoolClient } from 'pg';
import { query } from '../config/database';
import { createError } from '../middleware/error';
import { DiningTable } from '../types';

export const getTables = async (): Promise<DiningTable[]> => {
  const result = await query('SELECT * FROM tables WHERE deleted_at IS NULL ORDER BY name ASC', []);
  return result.rows;
};

const validate = (data: Partial<DiningTable>) => {
  if (!data.name?.trim()) throw createError('Table name is required', 400);
};

export const createTable = async (data: Partial<DiningTable>): Promise<DiningTable> => {
  validate(data);
  const result = await query(
    `INSERT INTO tables (name, capacity) VALUES ($1,$2) RETURNING *`,
    [data.name!.trim(), data.capacity || null]
  );
  return result.rows[0];
};

export const updateTable = async (id: number, data: Partial<DiningTable>): Promise<DiningTable> => {
  validate(data);
  const result = await query(
    `UPDATE tables SET name = $1, capacity = $2, updated_at = NOW() WHERE id = $3 AND deleted_at IS NULL RETURNING *`,
    [data.name!.trim(), data.capacity || null, id]
  );
  if (result.rows.length === 0) throw createError('Table not found', 404);
  return result.rows[0];
};

// Not called directly by a route — the sale lifecycle (table.service is
// intentionally table-metadata-only) drives this: createHeldSale marks a
// table 'occupied', completeHeldSale/cancelHeldSale mark it back
// 'available'. Takes the sale's own transaction client (not the pooled
// `query` helper) so a table's status can never drift out of sync with
// the sale write it belongs to — either both commit or neither does.
export const setTableStatus = async (client: PoolClient, id: number, status: DiningTable['status']) => {
  await client.query('UPDATE tables SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
};

export const deleteTable = async (id: number): Promise<void> => {
  const result = await query(
    'UPDATE tables SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  if (result.rowCount === 0) throw createError('Table not found', 404);
};
