import { query } from '../config/database';

export const getDashboardStats = async () => {
  const today = new Date().toISOString().slice(0, 10);

  const [todayStats, monthStats, weekStats, lowStockCount, openShift, topProducts, revenueTrend] =
    await Promise.all([
      query(
        `SELECT
           COALESCE(SUM(total_amount),0) as revenue,
           COALESCE(SUM(profit),0) as profit,
           COUNT(*) as transactions,
           COALESCE(SUM(si.total_qty),0) as items_sold
         FROM sales s
         LEFT JOIN (
           SELECT sale_id, SUM(quantity) as total_qty FROM sale_items GROUP BY sale_id
         ) si ON si.sale_id = s.id
         WHERE s.status = 'completed' AND DATE(s.created_at) = $1`,
        [today]
      ),
      query(
        `SELECT COALESCE(SUM(total_amount),0) as revenue, COALESCE(SUM(profit),0) as profit
         FROM sales
         WHERE status='completed' AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`,
        []
      ),
      query(
        `SELECT COALESCE(SUM(total_amount),0) as revenue
         FROM sales
         WHERE status='completed' AND created_at >= NOW() - INTERVAL '7 days'`,
        []
      ),
      query(
        `SELECT COUNT(*) FROM products
         WHERE deleted_at IS NULL AND is_active = TRUE AND current_stock <= low_stock_level`,
        []
      ),
      query(
        `SELECT s.*, u.name as opened_by_name FROM shifts s
         JOIN users u ON s.opened_by = u.id
         WHERE s.status = 'open' ORDER BY s.open_time DESC LIMIT 1`,
        []
      ),
      query(
        `SELECT p.name as product_name, SUM(si.quantity) as qty_sold, SUM(si.subtotal) as revenue
         FROM sale_items si
         JOIN sales s ON si.sale_id = s.id
         JOIN products p ON si.product_id = p.id
         WHERE s.status = 'completed' AND DATE_TRUNC('month', s.created_at) = DATE_TRUNC('month', NOW())
         GROUP BY p.id, p.name
         ORDER BY revenue DESC LIMIT 5`,
        []
      ),
      query(
        `SELECT DATE(created_at) as date,
           COALESCE(SUM(total_amount),0) as revenue,
           COALESCE(SUM(profit),0) as profit
         FROM sales
         WHERE status='completed' AND created_at >= NOW() - INTERVAL '14 days'
         GROUP BY DATE(created_at)
         ORDER BY date ASC`,
        []
      ),
    ]);

  return {
    today_revenue: parseFloat(todayStats.rows[0]?.revenue || 0),
    today_profit: parseFloat(todayStats.rows[0]?.profit || 0),
    today_transactions: parseInt(todayStats.rows[0]?.transactions || 0),
    today_items_sold: parseInt(todayStats.rows[0]?.items_sold || 0),
    month_revenue: parseFloat(monthStats.rows[0]?.revenue || 0),
    month_profit: parseFloat(monthStats.rows[0]?.profit || 0),
    week_revenue: parseFloat(weekStats.rows[0]?.revenue || 0),
    low_stock_count: parseInt(lowStockCount.rows[0]?.count || 0),
    open_shift: openShift.rows[0] || null,
    top_products: topProducts.rows,
    revenue_trend: revenueTrend.rows,
  };
};

export const getSalesReport = async (params: {
  date_from: string;
  date_to: string;
  group_by?: 'day' | 'month';
}) => {
  const groupBy = params.group_by === 'month' ? "DATE_TRUNC('month', created_at)" : 'DATE(created_at)';

  const result = await query(
    `SELECT
       ${groupBy} as period,
       COUNT(CASE WHEN status='completed' THEN 1 END) as transactions,
       COALESCE(SUM(CASE WHEN status='completed' THEN total_amount END),0) as revenue,
       COALESCE(SUM(CASE WHEN status='completed' THEN profit END),0) as profit,
       COALESCE(SUM(CASE WHEN status='completed' THEN discount_amount END),0) as discounts,
       COALESCE(SUM(CASE WHEN status='completed' THEN tax_amount END),0) as tax
     FROM sales
     WHERE created_at BETWEEN $1 AND $2
     GROUP BY ${groupBy}
     ORDER BY period ASC`,
    [params.date_from, params.date_to + ' 23:59:59']
  );

  const summary = await query(
    `SELECT
       COUNT(CASE WHEN status='completed' THEN 1 END) as total_transactions,
       COALESCE(SUM(CASE WHEN status='completed' THEN total_amount END),0) as total_revenue,
       COALESCE(SUM(CASE WHEN status='completed' THEN profit END),0) as total_profit,
       COALESCE(SUM(CASE WHEN status='completed' THEN discount_amount END),0) as total_discounts
     FROM sales WHERE created_at BETWEEN $1 AND $2`,
    [params.date_from, params.date_to + ' 23:59:59']
  );

  return { periods: result.rows, summary: summary.rows[0] };
};

export const getProductSalesReport = async (params: { date_from: string; date_to: string }) => {
  const result = await query(
    `SELECT
       p.id, p.name as product_name, p.sku, c.name as category_name,
       SUM(si.quantity) as qty_sold,
       SUM(si.subtotal) as revenue,
       SUM(si.quantity * si.cost_price) as cost,
       SUM(si.subtotal - si.quantity * si.cost_price) as profit
     FROM sale_items si
     JOIN sales s ON si.sale_id = s.id
     JOIN products p ON si.product_id = p.id
     LEFT JOIN categories c ON p.category_id = c.id
     WHERE s.status = 'completed' AND s.created_at BETWEEN $1 AND $2
     GROUP BY p.id, p.name, p.sku, c.name
     ORDER BY revenue DESC`,
    [params.date_from, params.date_to + ' 23:59:59']
  );
  return result.rows;
};

export const getInventoryReport = async () => {
  const result = await query(
    `SELECT
       p.id, p.name, p.sku, p.barcode,
       c.name as category_name,
       p.current_stock, p.low_stock_level, p.avg_cost, p.selling_price,
       p.current_stock * p.avg_cost as stock_value,
       CASE WHEN p.current_stock <= p.low_stock_level THEN TRUE ELSE FALSE END as is_low_stock
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id
     WHERE p.deleted_at IS NULL AND p.is_active = TRUE
     ORDER BY p.name ASC`,
    []
  );
  return result.rows;
};

export const getCashierReport = async (params: { date_from: string; date_to: string }) => {
  const result = await query(
    `SELECT
       u.id, u.name as cashier_name,
       COUNT(CASE WHEN s.status='completed' THEN 1 END) as transactions,
       COALESCE(SUM(CASE WHEN s.status='completed' THEN s.total_amount END),0) as revenue,
       COALESCE(SUM(CASE WHEN s.status='completed' THEN s.profit END),0) as profit
     FROM users u
     LEFT JOIN sales s ON s.cashier_id = u.id
       AND s.created_at BETWEEN $1 AND $2
     WHERE u.deleted_at IS NULL
     GROUP BY u.id, u.name
     ORDER BY revenue DESC`,
    [params.date_from, params.date_to + ' 23:59:59']
  );
  return result.rows;
};
