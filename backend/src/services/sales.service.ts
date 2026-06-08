import { PoolClient } from 'pg';
import { query, transaction } from '../config/database';
import { createError } from '../middleware/error';
import { generateSaleNumber, round2 } from '../utils/helpers';
import { Sale, CreateSalePayload } from '../types';

export const createSale = async (data: CreateSalePayload, cashierId: number): Promise<Sale> => {
  return transaction(async (client: PoolClient) => {
    // Get active shift for cashier
    const shiftResult = await client.query(
      `SELECT id FROM shifts WHERE opened_by = $1 AND status = 'open' ORDER BY open_time DESC LIMIT 1`,
      [cashierId]
    );
    if (shiftResult.rows.length === 0) {
      throw createError('No open shift found. Please open a shift first.', 400);
    }
    const shiftId = shiftResult.rows[0].id;

    // Calculate totals
    let subtotal = 0;
    let itemDiscountTotal = 0;
    let taxTotal = 0;
    let costTotal = 0;

    const processedItems = [];

    for (const item of data.cart_items) {
      // Get current product avg_cost
      const productResult = await client.query(
        'SELECT id, avg_cost, current_stock, allow_negative_stock FROM products WHERE id = $1',
        [item.product_id]
      );
      if (productResult.rows.length === 0) {
        throw createError(`Product ${item.product_id} not found`, 404);
      }
      const product = productResult.rows[0];

      const costPrice = parseFloat(product.avg_cost) || item.cost_price || 0;
      const lineSubtotal = round2(item.unit_price * item.quantity);
      const lineDiscount = round2(item.item_discount * item.quantity);
      const taxableAmount = lineSubtotal - lineDiscount;
      const lineTax = round2((taxableAmount * item.tax_rate) / 100);
      const lineTotal = round2(taxableAmount + lineTax);

      subtotal += lineSubtotal;
      itemDiscountTotal += lineDiscount;
      taxTotal += lineTax;
      costTotal += round2(costPrice * item.quantity);

      processedItems.push({
        ...item,
        cost_price: costPrice,
        line_subtotal: lineTotal,
      });
    }

    const billDiscountAmount = round2(data.bill_discount || 0);
    const discountTotal = round2(itemDiscountTotal + billDiscountAmount);
    const totalAmount = round2(subtotal - discountTotal + taxTotal);
    const profit = round2(totalAmount - costTotal);
    const changeAmount = round2(
      data.payment_method === 'cash'
        ? Math.max(0, data.cash_tendered - totalAmount)
        : data.payment_method === 'mixed'
        ? Math.max(0, data.cash_tendered + data.card_amount - totalAmount)
        : 0
    );

    const saleNumber = generateSaleNumber();

    // Insert sale
    const saleResult = await client.query(
      `INSERT INTO sales (
         sale_number, shift_id, cashier_id, subtotal, item_discount, bill_discount,
         discount_amount, tax_amount, total_amount, cost_total, profit,
         payment_method, cash_tendered, card_amount, change_amount,
         status, customer_name, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'completed',$16,$17)
       RETURNING *`,
      [
        saleNumber, shiftId, cashierId, subtotal, itemDiscountTotal, billDiscountAmount,
        discountTotal, taxTotal, totalAmount, costTotal, profit,
        data.payment_method, data.cash_tendered || 0, data.card_amount || 0, changeAmount,
        data.customer_name || null, data.notes || null,
      ]
    );

    const sale = saleResult.rows[0];

    // Insert sale items and update stock
    for (const item of processedItems) {
      await client.query(
        `INSERT INTO sale_items (
           sale_id, product_id, product_name, barcode, quantity,
           unit_price, original_price, cost_price, item_discount,
           tax_rate, tax_amount, subtotal, promotion_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          sale.id, item.product_id, item.product_name, item.barcode || null, item.quantity,
          item.unit_price, item.original_price, item.cost_price, item.item_discount || 0,
          item.tax_rate || 0, round2(((item.unit_price - item.item_discount) * item.quantity * item.tax_rate) / 100),
          item.line_subtotal, item.promotion_id || null,
        ]
      );

      // Get balance before
      const stockResult = await client.query(
        'SELECT current_stock FROM products WHERE id = $1 FOR UPDATE',
        [item.product_id]
      );
      const balanceBefore = parseFloat(stockResult.rows[0].current_stock);
      const balanceAfter = round2(balanceBefore - item.quantity);

      // Update stock (allow negative)
      await client.query(
        'UPDATE products SET current_stock = $1, updated_at = NOW() WHERE id = $2',
        [balanceAfter, item.product_id]
      );

      // Stock movement record
      await client.query(
        `INSERT INTO stock_movements
           (product_id, movement_type, quantity, balance_before, balance_after, unit_cost, reference_type, reference_id, created_by)
         VALUES ($1,'sale_out',$2,$3,$4,$5,'sale',$6,$7)`,
        [item.product_id, item.quantity, balanceBefore, balanceAfter, item.cost_price, sale.id, cashierId]
      );
    }

    // Update shift totals
    await client.query(
      `UPDATE shifts SET
         total_sales = total_sales + $1,
         total_cash_sales = total_cash_sales + $2,
         total_card_sales = total_card_sales + $3,
         total_transactions = total_transactions + 1
       WHERE id = $4`,
      [
        totalAmount,
        data.payment_method !== 'card' ? round2(data.cash_tendered - changeAmount) : 0,
        data.payment_method !== 'cash' ? data.card_amount : 0,
        shiftId,
      ]
    );

    return sale;
  });
};

export const getSales = async (params: {
  page?: number;
  limit?: number;
  date_from?: string;
  date_to?: string;
  cashier_id?: number;
  shift_id?: number;
  status?: string;
}) => {
  const page = params.page || 1;
  const limit = params.limit || 20;
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (params.date_from) {
    conditions.push(`s.created_at >= $${i++}`);
    values.push(params.date_from);
  }
  if (params.date_to) {
    conditions.push(`s.created_at <= $${i++}`);
    values.push(params.date_to + ' 23:59:59');
  }
  if (params.cashier_id) {
    conditions.push(`s.cashier_id = $${i++}`);
    values.push(params.cashier_id);
  }
  if (params.shift_id) {
    conditions.push(`s.shift_id = $${i++}`);
    values.push(params.shift_id);
  }
  if (params.status) {
    conditions.push(`s.status = $${i++}`);
    values.push(params.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(`SELECT COUNT(*) FROM sales s ${where}`, values);
  const dataResult = await query(
    `SELECT s.*, u.name as cashier_name
     FROM sales s
     JOIN users u ON s.cashier_id = u.id
     ${where}
     ORDER BY s.created_at DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    [...values, limit, offset]
  );

  const total = parseInt(countResult.rows[0].count);
  return { data: dataResult.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getSaleById = async (id: number): Promise<Sale> => {
  const saleResult = await query(
    `SELECT s.*, u.name as cashier_name
     FROM sales s JOIN users u ON s.cashier_id = u.id
     WHERE s.id = $1`,
    [id]
  );
  if (saleResult.rows.length === 0) throw createError('Sale not found', 404);

  const itemsResult = await query(
    'SELECT * FROM sale_items WHERE sale_id = $1',
    [id]
  );

  return { ...saleResult.rows[0], items: itemsResult.rows };
};

export const voidSale = async (id: number, reason: string, userId: number): Promise<Sale> => {
  return transaction(async (client: PoolClient) => {
    const saleResult = await client.query(
      'SELECT * FROM sales WHERE id = $1 AND status = $2',
      [id, 'completed']
    );
    if (saleResult.rows.length === 0) throw createError('Sale not found or cannot be voided', 404);

    const sale = saleResult.rows[0];

    // Restore stock for each item
    const items = await client.query('SELECT * FROM sale_items WHERE sale_id = $1', [id]);
    for (const item of items.rows) {
      const stockResult = await client.query(
        'SELECT current_stock FROM products WHERE id = $1 FOR UPDATE',
        [item.product_id]
      );
      const balanceBefore = parseFloat(stockResult.rows[0].current_stock);
      const balanceAfter = round2(balanceBefore + parseFloat(item.quantity));

      await client.query(
        'UPDATE products SET current_stock = $1, updated_at = NOW() WHERE id = $2',
        [balanceAfter, item.product_id]
      );

      await client.query(
        `INSERT INTO stock_movements
           (product_id, movement_type, quantity, balance_before, balance_after, reference_type, reference_id, created_by)
         VALUES ($1,'return_in',$2,$3,$4,'sale_void',$5,$6)`,
        [item.product_id, item.quantity, balanceBefore, balanceAfter, id, userId]
      );
    }

    // Update shift totals (reverse)
    await client.query(
      `UPDATE shifts SET
         total_sales = total_sales - $1,
         total_transactions = total_transactions - 1
       WHERE id = $2`,
      [sale.total_amount, sale.shift_id]
    );

    const updated = await client.query(
      `UPDATE sales SET status = 'voided', void_reason = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [reason, id]
    );

    return updated.rows[0];
  });
};
