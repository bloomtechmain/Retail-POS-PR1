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
  // Get shift with totals — sales aggregated separately from returns to avoid
  // join fan-out, then combined; returns are attributed to the shift that
  // actually processed them (cash left/re-entered the drawer during THIS
  // shift, regardless of which shift the original sale happened in).
  const shiftResult = await query(
    `SELECT s.*,
       COALESCE(sales_agg.calculated_total, 0) - COALESCE(returns_agg.total_refund, 0) as calculated_total,
       COALESCE(sales_agg.calculated_cash, 0) - COALESCE(returns_agg.cash_refund, 0) as calculated_cash
     FROM shifts s
     LEFT JOIN (
       SELECT shift_id,
         SUM(CASE WHEN status IN ('completed','refunded') THEN total_amount ELSE 0 END) as calculated_total,
         SUM(CASE WHEN status IN ('completed','refunded') AND payment_method IN ('cash','mixed') THEN cash_tendered - change_amount ELSE 0 END) as calculated_cash
       FROM sales GROUP BY shift_id
     ) sales_agg ON sales_agg.shift_id = s.id
     LEFT JOIN (
       SELECT shift_id,
         SUM(total_refund_amount) as total_refund,
         SUM(CASE WHEN refund_method = 'cash' THEN total_refund_amount ELSE 0 END) as cash_refund
       FROM sale_returns GROUP BY shift_id
     ) returns_agg ON returns_agg.shift_id = s.id
     WHERE s.id = $1 AND s.status = 'open'`,
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
       sales_agg.total_transactions,
       sales_agg.voided_count,
       COALESCE(sales_agg.total_revenue, 0) - COALESCE(returns_agg.total_refund, 0) as total_revenue,
       COALESCE(sales_agg.total_profit, 0) - COALESCE(returns_agg.total_refund_profit_impact, 0) as total_profit,
       COALESCE(sales_agg.total_cash, 0) - COALESCE(returns_agg.cash_refund, 0) as total_cash,
       COALESCE(sales_agg.total_card, 0) - COALESCE(returns_agg.card_refund, 0) as total_card
     FROM (
       SELECT
         COUNT(*) as total_transactions,
         SUM(CASE WHEN status IN ('completed','refunded') THEN total_amount END) as total_revenue,
         SUM(CASE WHEN status IN ('completed','refunded') THEN profit END) as total_profit,
         SUM(CASE WHEN status IN ('completed','refunded') AND payment_method IN ('cash','mixed') THEN cash_tendered - change_amount END) as total_cash,
         SUM(CASE WHEN status IN ('completed','refunded') AND payment_method IN ('card','mixed') THEN card_amount END) as total_card,
         COUNT(CASE WHEN status='voided' THEN 1 END) as voided_count
       FROM sales WHERE shift_id = $1
     ) sales_agg
     LEFT JOIN (
       SELECT sr.shift_id,
         SUM(sr.total_refund_amount) as total_refund,
         SUM(CASE WHEN sr.refund_method = 'cash' THEN sr.total_refund_amount ELSE 0 END) as cash_refund,
         SUM(CASE WHEN sr.refund_method = 'card' THEN sr.total_refund_amount ELSE 0 END) as card_refund,
         SUM(sr.total_refund_amount - COALESCE(sri_cost.cost, 0)) as total_refund_profit_impact
       FROM sale_returns sr
       LEFT JOIN (
         SELECT return_id, SUM(quantity * cost_price) as cost FROM sale_return_items GROUP BY return_id
       ) sri_cost ON sri_cost.return_id = sr.id
       WHERE sr.shift_id = $1
       GROUP BY sr.shift_id
     ) returns_agg ON TRUE`,
    [shiftId]
  );

  const topProducts = await query(
    `WITH sold AS (
       SELECT p.id, p.name, SUM(si.quantity) as qty, SUM(si.subtotal) as revenue
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       JOIN products p ON si.product_id = p.id
       WHERE s.shift_id = $1 AND s.status IN ('completed','refunded')
       GROUP BY p.id, p.name
     ), returned AS (
       SELECT si.product_id, SUM(sri.quantity) as qty, SUM(sri.refund_subtotal) as revenue
       FROM sale_return_items sri
       JOIN sale_items si ON sri.sale_item_id = si.id
       JOIN sale_returns sr ON sri.return_id = sr.id
       WHERE sr.shift_id = $1
       GROUP BY si.product_id
     )
     SELECT sold.name,
       sold.qty - COALESCE(returned.qty, 0) as qty_sold,
       sold.revenue - COALESCE(returned.revenue, 0) as revenue
     FROM sold LEFT JOIN returned ON returned.product_id = sold.id
     ORDER BY revenue DESC LIMIT 10`,
    [shiftId]
  );

  return {
    shift: shiftResult.rows[0],
    summary: salesResult.rows[0],
    topProducts: topProducts.rows,
  };
};
