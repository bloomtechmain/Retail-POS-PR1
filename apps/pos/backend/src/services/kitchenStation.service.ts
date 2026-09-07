import { query } from '../config/database';
import { createError } from '../middleware/error';
import { KitchenStation } from '../types';

export const getKitchenStations = async (activeOnly = false): Promise<KitchenStation[]> => {
  const where = activeOnly ? 'WHERE is_active = TRUE' : '';
  const result = await query(`SELECT * FROM kitchen_stations ${where} ORDER BY name ASC`, []);
  return result.rows;
};

const validate = (data: Partial<KitchenStation>) => {
  if (!data.name?.trim()) throw createError('Station name is required', 400);
};

export const createKitchenStation = async (data: Partial<KitchenStation>): Promise<KitchenStation> => {
  validate(data);
  const result = await query(
    `INSERT INTO kitchen_stations (name, is_active) VALUES ($1,$2) RETURNING *`,
    [data.name!.trim(), data.is_active !== false]
  );
  return result.rows[0];
};

export const updateKitchenStation = async (id: number, data: Partial<KitchenStation>): Promise<KitchenStation> => {
  validate(data);
  const result = await query(
    `UPDATE kitchen_stations SET name = $1, is_active = $2 WHERE id = $3 RETURNING *`,
    [data.name!.trim(), data.is_active !== false, id]
  );
  if (result.rows.length === 0) throw createError('Kitchen station not found', 404);
  return result.rows[0];
};

export const deleteKitchenStation = async (id: number): Promise<void> => {
  // products.station_id is a soft, nullable reference — deleting a station
  // leaves its products with no station rather than blocking the delete;
  // those items simply stop appearing on any KOT until reassigned.
  const result = await query('DELETE FROM kitchen_stations WHERE id = $1', [id]);
  if (result.rowCount === 0) throw createError('Kitchen station not found', 404);
};
