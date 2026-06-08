import { query } from '../config/database';
import { createError } from '../middleware/error';
import { generateShiftNumber, round2 } from '../utils/helpers';
import { Shift } from '../types';

export const getOpenShift = async (userId?: number): Promise<Shift | null> => {
  const conditions = ["status = 'open'"];
  const values: unknown[] = [];
  if (userId) {
    conditions.push('opened_by = $1');
    values.push(userId);
  }
  const result = await query(
    `SELECT s.*, u.name as opened_by_name
     FROM shifts s
     JOIN users u ON s.opened_by = u.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY s.open_time DESC LIMIT 1`,
    values
  );
  return result.rows[0] || null;
};

export const openShift = async (userId: number, openingCash: number): Promise<Shift> => {
  // Check if user already has an open shift
  const existing = await getOpenShift(userId);
  if (existing) throw createError('You already have an open shift. Close it first.', 400);

  const shiftNumber = generateShiftNumber();
  const result = await query(
    `INSERT INTO shifts (shift_number, opened_by, opening_cash, open_time, status)
     VALUES ($1,$2,$3,NOW(),'open') RETURNING *`,
    [shiftNumber, userId, openingCash]
  );
  return result.rows[0];
};

export const closeShift = async (
  shiftId: number,
  userId: number,
  actualCash: number,
  notes?: string
): Promise<Shift> => {
  // Get shift with totals
  const shiftResult = await query(
    `SELECT s.*,
       COALESCE(SUM(CASE WHEN sa.status='completed' THEN sa.total_amount ELSE 0 END), 0) as calculated_total,
       COALESCE(SUM(CASE WHEN sa.status='completed' AND sa.payment_method IN ('cash','mixed') THEN sa.cash_tendered - sa.change_amount ELSE 0 END), 0) as calculated_cash
     FROM shifts s
     LEFT JOIN sales sa ON sa.shift_id = s.id
     WHERE s.id = $1 AND s.status = 'open'
     GROUP BY s.id`,
    [shiftId]
  );

  if (shiftResult.rows.length === 0) {
    throw createError('Shift not found or already closed', 404);
  }

  const shift = shiftResult.rows[0];
  const expectedCash = round2(
    parseFloat(shift.opening_cash) + parseFloat(shift.calculated_cash)
  );
  const cashDifference = round2(actualCash - expectedCash);

  const result = await query(
    `UPDATE shifts SET
       closed_by = $1, close_time = NOW(), actual_cash = $2,
       expected_cash = $3, cash_difference = $4, status = 'closed', notes = $5
     WHERE id = $6 RETURNING *`,
    [userId, actualCash, expectedCash, cashDifference, notes || null, shiftId]
  );

  return result.rows[0];
};

export const getShifts = async (params: { page?: number; limit?: number }) => {
  const page = params.page || 1;
  const limit = params.limit || 20;
  const offset = (page - 1) * limit;

  const countResult = await query('SELECT COUNT(*) FROM shifts', []);
  const dataResult = await query(
    `SELECT s.*,
       uo.name as opened_by_name, uc.name as closed_by_name,
       COUNT(sa.id) as transaction_count,
       COALESCE(SUM(CASE WHEN sa.status='completed' THEN sa.total_amount ELSE 0 END),0) as total_sales_amount
     FROM shifts s
     JOIN users uo ON s.opened_by = uo.id
     LEFT JOIN users uc ON s.closed_by = uc.id
     LEFT JOIN sales sa ON sa.shift_id = s.id
     GROUP BY s.id, uo.name, uc.name
     ORDER BY s.open_time DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const total = parseInt(countResult.rows[0].count);
  return { data: dataResult.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getShiftReport = async (shiftId: number) => {
  const shiftResult = await query(
    `SELECT s.*, uo.name as opened_by_name, uc.name as closed_by_name
     FROM shifts s
     JOIN users uo ON s.opened_by = uo.id
     LEFT JOIN users uc ON s.closed_by = uc.id
     WHERE s.id = $1`,
    [shiftId]
  );
  if (shiftResult.rows.length === 0) throw createError('Shift not found', 404);

  const salesResult = await query(
    `SELECT
       COUNT(*) as total_transactions,
       COALESCE(SUM(CASE WHEN status='completed' THEN total_amount END), 0) as total_revenue,
       COALESCE(SUM(CASE WHEN status='completed' THEN profit END), 0) as total_profit,
       COALESCE(SUM(CASE WHEN status='completed' AND payment_method IN ('cash','mixed') THEN cash_tendered - change_amount END), 0) as total_cash,
       COALESCE(SUM(CASE WHEN status='completed' AND payment_method IN ('card','mixed') THEN card_amount END), 0) as total_card,
       COUNT(CASE WHEN status='voided' THEN 1 END) as voided_count
     FROM sales WHERE shift_id = $1`,
    [shiftId]
  );

  const topProducts = await query(
    `SELECT p.name, SUM(si.quantity) as qty_sold, SUM(si.subtotal) as revenue
     FROM sale_items si
     JOIN sales s ON si.sale_id = s.id
     JOIN products p ON si.product_id = p.id
     WHERE s.shift_id = $1 AND s.status = 'completed'
     GROUP BY p.id, p.name
     ORDER BY revenue DESC LIMIT 10`,
    [shiftId]
  );

  return {
    shift: shiftResult.rows[0],
    summary: salesResult.rows[0],
    topProducts: topProducts.rows,
  };
};
