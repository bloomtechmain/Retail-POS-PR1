import { query } from '../config/database';

// Net refund amount/profit-impact for returns processed within a date range —
// shared by every report below so a partial return is never silently ignored.
const RETURNS_IN_RANGE_SUBQUERY = (dateCol: string) => `
  SELECT COALESCE(SUM(sr.total_refund_amount), 0) as total_refund,
         COALESCE(SUM(sr.total_refund_amount - COALESCE(sri_cost.cost, 0)), 0) as profit_impact
  FROM sale_returns sr
  LEFT JOIN (
    SELECT return_id, SUM(quantity * cost_price) as cost FROM sale_return_items GROUP BY return_id
  ) sri_cost ON sri_cost.return_id = sr.id
  WHERE ${dateCol}
`;

export const getDashboardStats = async () => {
  const today = new Date().toISOString().slice(0, 10);

  const [todayStats, monthStats, weekStats, lowStockCount, openShift, topProducts, revenueTrend] =
    await Promise.all([
      query(
        `SELECT
           COALESCE(sales_agg.revenue, 0) - COALESCE(returns_agg.total_refund, 0) as revenue,
           COALESCE(sales_agg.profit, 0) - COALESCE(returns_agg.profit_impact, 0) as profit,
           COALESCE(sales_agg.transactions, 0) as transactions,
           COALESCE(sales_agg.items_sold, 0) as items_sold
         FROM (
           SELECT
             COALESCE(SUM(s.total_amount),0) as revenue,
             COALESCE(SUM(s.profit),0) as profit,
             COUNT(*) as transactions,
             COALESCE(SUM(si.total_qty),0) as items_sold
           FROM sales s
           LEFT JOIN (
             SELECT sale_id, SUM(quantity) as total_qty FROM sale_items GROUP BY sale_id
           ) si ON si.sale_id = s.id
           WHERE s.status IN ('completed', 'refunded') AND DATE(s.created_at) = $1
         ) sales_agg
         LEFT JOIN (${RETURNS_IN_RANGE_SUBQUERY('DATE(sr.created_at) = $1')}) returns_agg ON TRUE`,
        [today]
      ),
      query(
        `SELECT
           COALESCE(sales_agg.revenue, 0) - COALESCE(returns_agg.total_refund, 0) as revenue,
           COALESCE(sales_agg.profit, 0) - COALESCE(returns_agg.profit_impact, 0) as profit
         FROM (
           SELECT COALESCE(SUM(total_amount),0) as revenue, COALESCE(SUM(profit),0) as profit
           FROM sales
           WHERE status IN ('completed','refunded') AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
         ) sales_agg
         LEFT JOIN (${RETURNS_IN_RANGE_SUBQUERY("DATE_TRUNC('month', sr.created_at) = DATE_TRUNC('month', NOW())")}) returns_agg ON TRUE`,
        []
      ),
      query(
        `SELECT
           COALESCE(sales_agg.revenue, 0) - COALESCE(returns_agg.total_refund, 0) as revenue
         FROM (
           SELECT COALESCE(SUM(total_amount),0) as revenue
           FROM sales
           WHERE status IN ('completed','refunded') AND created_at >= NOW() - INTERVAL '7 days'
         ) sales_agg
         LEFT JOIN (${RETURNS_IN_RANGE_SUBQUERY("sr.created_at >= NOW() - INTERVAL '7 days'")}) returns_agg ON TRUE`,
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
        `WITH sold AS (
           SELECT p.id, p.name as product_name, SUM(si.quantity) as qty, SUM(si.subtotal) as revenue
           FROM sale_items si
           JOIN sales s ON si.sale_id = s.id
           JOIN products p ON si.product_id = p.id
           WHERE s.status IN ('completed','refunded') AND DATE_TRUNC('month', s.created_at) = DATE_TRUNC('month', NOW())
           GROUP BY p.id, p.name
         ), returned AS (
           SELECT si.product_id, SUM(sri.quantity) as qty, SUM(sri.refund_subtotal) as revenue
           FROM sale_return_items sri
           JOIN sale_items si ON sri.sale_item_id = si.id
           JOIN sales s ON si.sale_id = s.id
           WHERE DATE_TRUNC('month', s.created_at) = DATE_TRUNC('month', NOW())
           GROUP BY si.product_id
         )
         SELECT sold.product_name,
           sold.qty - COALESCE(returned.qty, 0) as qty_sold,
           sold.revenue - COALESCE(returned.revenue, 0) as revenue
         FROM sold LEFT JOIN returned ON returned.product_id = sold.id
         ORDER BY revenue DESC LIMIT 5`,
        []
      ),
      query(
        `WITH daily_sales AS (
           SELECT DATE(created_at) as date, SUM(total_amount) as revenue, SUM(profit) as profit
           FROM sales WHERE status IN ('completed','refunded') AND created_at >= NOW() - INTERVAL '14 days'
           GROUP BY DATE(created_at)
         ), daily_returns AS (
           SELECT DATE(sr.created_at) as date,
             SUM(sr.total_refund_amount) as refund,
             SUM(sr.total_refund_amount - COALESCE(sri_cost.cost, 0)) as profit_impact
           FROM sale_returns sr
           LEFT JOIN (
             SELECT return_id, SUM(quantity * cost_price) as cost FROM sale_return_items GROUP BY return_id
           ) sri_cost ON sri_cost.return_id = sr.id
           WHERE sr.created_at >= NOW() - INTERVAL '14 days'
           GROUP BY DATE(sr.created_at)
         )
         SELECT COALESCE(ds.date, dr.date) as date,
           COALESCE(ds.revenue, 0) - COALESCE(dr.refund, 0) as revenue,
           COALESCE(ds.profit, 0) - COALESCE(dr.profit_impact, 0) as profit
         FROM daily_sales ds
         FULL OUTER JOIN daily_returns dr ON dr.date = ds.date
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
  const groupBySales = params.group_by === 'month' ? "DATE_TRUNC('month', created_at)" : 'DATE(created_at)';
  const groupByReturns = params.group_by === 'month' ? "DATE_TRUNC('month', sr.created_at)" : 'DATE(sr.created_at)';
  const range = [params.date_from, params.date_to + ' 23:59:59'];

  const result = await query(
    `SELECT
       sales_agg.period,
       sales_agg.transactions,
       COALESCE(sales_agg.revenue,0) - COALESCE(returns_agg.total_refund,0) as revenue,
       COALESCE(sales_agg.profit,0) - COALESCE(returns_agg.profit_impact,0) as profit,
       sales_agg.discounts,
       sales_agg.tax
     FROM (
       SELECT
         ${groupBySales} as period,
         COUNT(CASE WHEN status IN ('completed','refunded') THEN 1 END) as transactions,
         COALESCE(SUM(CASE WHEN status IN ('completed','refunded') THEN total_amount END),0) as revenue,
         COALESCE(SUM(CASE WHEN status IN ('completed','refunded') THEN profit END),0) as profit,
         COALESCE(SUM(CASE WHEN status IN ('completed','refunded') THEN discount_amount END),0) as discounts,
         COALESCE(SUM(CASE WHEN status IN ('completed','refunded') THEN tax_amount END),0) as tax
       FROM sales
       WHERE created_at BETWEEN $1 AND $2
       GROUP BY ${groupBySales}
     ) sales_agg
     LEFT JOIN (
       SELECT ${groupByReturns} as period,
         SUM(sr.total_refund_amount) as total_refund,
         SUM(sr.total_refund_amount - COALESCE(sri_cost.cost,0)) as profit_impact
       FROM sale_returns sr
       LEFT JOIN (
         SELECT return_id, SUM(quantity * cost_price) as cost FROM sale_return_items GROUP BY return_id
       ) sri_cost ON sri_cost.return_id = sr.id
       WHERE sr.created_at BETWEEN $1 AND $2
       GROUP BY ${groupByReturns}
     ) returns_agg ON returns_agg.period = sales_agg.period
     ORDER BY sales_agg.period ASC`,
    range
  );

  const summary = await query(
    `SELECT
       COALESCE(sales_agg.total_transactions,0) as total_transactions,
       COALESCE(sales_agg.total_revenue,0) - COALESCE(returns_agg.total_refund,0) as total_revenue,
       COALESCE(sales_agg.total_profit,0) - COALESCE(returns_agg.profit_impact,0) as total_profit,
       COALESCE(sales_agg.total_discounts,0) as total_discounts
     FROM (
       SELECT
         COUNT(CASE WHEN status IN ('completed','refunded') THEN 1 END) as total_transactions,
         COALESCE(SUM(CASE WHEN status IN ('completed','refunded') THEN total_amount END),0) as total_revenue,
         COALESCE(SUM(CASE WHEN status IN ('completed','refunded') THEN profit END),0) as total_profit,
         COALESCE(SUM(CASE WHEN status IN ('completed','refunded') THEN discount_amount END),0) as total_discounts
       FROM sales WHERE created_at BETWEEN $1 AND $2
     ) sales_agg
     LEFT JOIN (${RETURNS_IN_RANGE_SUBQUERY('sr.created_at BETWEEN $1 AND $2')}) returns_agg ON TRUE`,
    range
  );

  return { periods: result.rows, summary: summary.rows[0] };
};

export const getProductSalesReport = async (params: { date_from: string; date_to: string }) => {
  const result = await query(
    // si.subtotal is the line's post-item-discount, post-tax total — it does NOT
    // reflect the sale-level bill_discount, so it's distributed here proportionally
    // to each line's share of the sale, and returned quantities/amounts are netted out.
    `WITH line_adj AS (
       SELECT
         si.id as sale_item_id, si.product_id, si.quantity, si.cost_price, si.subtotal,
         si.subtotal - (s.bill_discount * si.subtotal / NULLIF(SUM(si.subtotal) OVER (PARTITION BY si.sale_id), 0)) as adj_revenue,
         p.name as product_name, p.sku, c.name as category_name
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       JOIN products p ON si.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE s.status IN ('completed', 'refunded') AND s.created_at BETWEEN $1 AND $2
     ),
     returns_adj AS (
       SELECT sale_item_id,
         SUM(refund_subtotal) as refunded_revenue,
         SUM(quantity) as refunded_qty
       FROM sale_return_items
       GROUP BY sale_item_id
     )
     SELECT
       la.product_id as id, la.product_name, la.sku, la.category_name,
       SUM(la.quantity - COALESCE(ra.refunded_qty, 0)) as qty_sold,
       SUM(la.adj_revenue - COALESCE(ra.refunded_revenue, 0)) as revenue,
       SUM((la.quantity - COALESCE(ra.refunded_qty, 0)) * la.cost_price) as cost,
       SUM(la.adj_revenue - COALESCE(ra.refunded_revenue, 0) - (la.quantity - COALESCE(ra.refunded_qty, 0)) * la.cost_price) as profit
     FROM line_adj la
     LEFT JOIN returns_adj ra ON ra.sale_item_id = la.sale_item_id
     GROUP BY la.product_id, la.product_name, la.sku, la.category_name
     ORDER BY revenue DESC`,
    [params.date_from, params.date_to + ' 23:59:59']
  );
  return result.rows;
};

export const getInventoryReport = async () => {
  const result = await query(
    `SELECT
       p.id, p.name, p.sku, p.barcode, p.unit_type, p.costing_method,
       c.name as category_name,
       p.current_stock, p.low_stock_level, p.avg_cost, p.selling_price,
       p.current_stock * p.avg_cost as stock_value,
       p.current_stock * p.selling_price as retail_value,
       CASE WHEN p.current_stock <= p.low_stock_level THEN TRUE ELSE FALSE END as is_low_stock
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id
     WHERE p.deleted_at IS NULL AND p.is_active = TRUE
     ORDER BY p.name ASC`,
    []
  );
  return result.rows;
};

export const getCreditReport = async () => {
  const customersResult = await query(
    `SELECT
       c.id, c.name, c.phone, c.email, c.credit_limit, c.current_balance, c.is_active,
       COUNT(s.id) FILTER (WHERE s.payment_method = 'credit' AND s.status IN ('completed','refunded')) as credit_sales_count,
       COALESCE(SUM(s.total_amount) FILTER (WHERE s.payment_method = 'credit' AND s.status IN ('completed','refunded')), 0) as lifetime_credit_sales,
       MAX(s.created_at) FILTER (WHERE s.payment_method = 'credit' AND s.status IN ('completed','refunded')) as last_sale_date,
       MAX(cp.created_at) as last_payment_date
     FROM customers c
     LEFT JOIN sales s ON s.customer_id = c.id
     LEFT JOIN customer_payments cp ON cp.customer_id = c.id
     WHERE c.deleted_at IS NULL
     GROUP BY c.id
     ORDER BY c.current_balance DESC, c.name ASC`,
    []
  );

  const summaryResult = await query(
    `SELECT
       COALESCE(SUM(current_balance), 0) as total_outstanding,
       COUNT(*) FILTER (WHERE current_balance > 0) as customers_with_balance,
       COUNT(*) as total_customers
     FROM customers WHERE deleted_at IS NULL`,
    []
  );

  return { customers: customersResult.rows, summary: summaryResult.rows[0] };
};

export const getCashierReport = async (params: { date_from: string; date_to: string }) => {
  const range = [params.date_from, params.date_to + ' 23:59:59'];
  const result = await query(
    // Returns are attributed to whichever cashier actually processed the return
    // (sale_returns.processed_by), not the original sale's cashier.
    `SELECT
       u.id, u.name as cashier_name,
       COALESCE(sales_agg.transactions, 0) as transactions,
       COALESCE(sales_agg.revenue, 0) - COALESCE(returns_agg.total_refund, 0) as revenue,
       COALESCE(sales_agg.profit, 0) - COALESCE(returns_agg.profit_impact, 0) as profit
     FROM users u
     LEFT JOIN (
       SELECT cashier_id,
         COUNT(CASE WHEN status IN ('completed','refunded') THEN 1 END) as transactions,
         SUM(CASE WHEN status IN ('completed','refunded') THEN total_amount END) as revenue,
         SUM(CASE WHEN status IN ('completed','refunded') THEN profit END) as profit
       FROM sales WHERE created_at BETWEEN $1 AND $2
       GROUP BY cashier_id
     ) sales_agg ON sales_agg.cashier_id = u.id
     LEFT JOIN (
       SELECT sr.processed_by,
         SUM(sr.total_refund_amount) as total_refund,
         SUM(sr.total_refund_amount - COALESCE(sri_cost.cost, 0)) as profit_impact
       FROM sale_returns sr
       LEFT JOIN (
         SELECT return_id, SUM(quantity * cost_price) as cost FROM sale_return_items GROUP BY return_id
       ) sri_cost ON sri_cost.return_id = sr.id
       WHERE sr.created_at BETWEEN $1 AND $2
       GROUP BY sr.processed_by
     ) returns_agg ON returns_agg.processed_by = u.id
     WHERE u.deleted_at IS NULL
     ORDER BY revenue DESC`,
    range
  );
  return result.rows;
};
