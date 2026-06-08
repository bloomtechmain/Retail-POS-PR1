import { PoolClient } from 'pg';
import { query, transaction } from '../config/database';
import { createError } from '../middleware/error';
import { generateGRNNumber, generateReturnNumber, calculateWeightedAvgCost, round2 } from '../utils/helpers';
import { GRN, GRNItem } from '../types';

export const getGRNs = async (params: { page?: number; limit?: number; search?: string }) => {
  const page = params.page || 1;
  const limit = params.limit || 20;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (params.search) {
    conditions.push(`(g.grn_number ILIKE $${i} OR s.name ILIKE $${i + 1})`);
    values.push(`%${params.search}%`, `%${params.search}%`);
    i += 2;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*) FROM grn g LEFT JOIN suppliers s ON g.supplier_id = s.id ${where}`,
    values
  );

  const dataResult = await query(
    `SELECT g.*, s.name as supplier_name, u.name as created_by_name
     FROM grn g
     LEFT JOIN suppliers s ON g.supplier_id = s.id
     LEFT JOIN users u ON g.created_by = u.id
     ${where}
     ORDER BY g.created_at DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    [...values, limit, offset]
  );

  const total = parseInt(countResult.rows[0].count);
  return { data: dataResult.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getGRNById = async (id: number): Promise<GRN> => {
  const grnResult = await query(
    `SELECT g.*, s.name as supplier_name, u.name as created_by_name
     FROM grn g
     LEFT JOIN suppliers s ON g.supplier_id = s.id
     LEFT JOIN users u ON g.created_by = u.id
     WHERE g.id = $1`,
    [id]
  );
  if (grnResult.rows.length === 0) throw createError('GRN not found', 404);

  const itemsResult = await query(
    `SELECT gi.*, p.name as product_name, p.sku
     FROM grn_items gi
     JOIN products p ON gi.product_id = p.id
     WHERE gi.grn_id = $1`,
    [id]
  );

  return { ...grnResult.rows[0], items: itemsResult.rows };
};

export const createGRN = async (
  data: {
    supplier_id?: number;
    invoice_number?: string;
    received_date: string;
    notes?: string;
    items: Array<{ product_id: number; quantity: number; buying_price: number }>;
  },
  userId: number
): Promise<GRN> => {
  return transaction(async (client: PoolClient) => {
    const grnNumber = generateGRNNumber();
    let totalAmount = 0;

    // Calculate total
    for (const item of data.items) {
      totalAmount += round2(item.quantity * item.buying_price);
    }

    // Insert GRN
    const grnResult = await client.query(
      `INSERT INTO grn (grn_number, supplier_id, invoice_number, received_date, total_amount, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        grnNumber,
        data.supplier_id || null,
        data.invoice_number || null,
        data.received_date,
        totalAmount,
        data.notes || null,
        userId,
      ]
    );

    const grn = grnResult.rows[0];

    // Process each item
    for (const item of data.items) {
      const subtotal = round2(item.quantity * item.buying_price);

      // Insert GRN item
      await client.query(
        `INSERT INTO grn_items (grn_id, product_id, quantity, buying_price, subtotal)
         VALUES ($1,$2,$3,$4,$5)`,
        [grn.id, item.product_id, item.quantity, item.buying_price, subtotal]
      );

      // Get current product stock and avg cost
      const productResult = await client.query(
        'SELECT current_stock, avg_cost FROM products WHERE id = $1 FOR UPDATE',
        [item.product_id]
      );
      if (productResult.rows.length === 0) throw createError(`Product ${item.product_id} not found`, 404);

      const product = productResult.rows[0];
      const currentStock = parseFloat(product.current_stock);
      const currentAvgCost = parseFloat(product.avg_cost);
      const balanceBefore = currentStock;
      const balanceAfter = round2(currentStock + item.quantity);

      // Calculate new weighted average cost
      const newAvgCost = calculateWeightedAvgCost(
        currentStock,
        currentAvgCost,
        item.quantity,
        item.buying_price
      );

      // Update product stock and avg cost
      await client.query(
        `UPDATE products
         SET current_stock = $1, avg_cost = $2, cost_price = $3, updated_at = NOW()
         WHERE id = $4`,
        [balanceAfter, newAvgCost, item.buying_price, item.product_id]
      );

      // Record stock movement
      await client.query(
        `INSERT INTO stock_movements
           (product_id, movement_type, quantity, balance_before, balance_after, unit_cost, reference_type, reference_id, created_by)
         VALUES ($1,'grn_in',$2,$3,$4,$5,'grn',$6,$7)`,
        [item.product_id, item.quantity, balanceBefore, balanceAfter, item.buying_price, grn.id, userId]
      );
    }

    return grn;
  });
};

export const getGRNReturns = async (grnId: number) => {
  const result = await query(
    `SELECT gr.*, u.name as created_by_name,
            json_agg(json_build_object(
              'id', gri.id, 'product_id', gri.product_id,
              'product_name', p.name, 'sku', p.sku,
              'quantity', gri.quantity, 'buying_price', gri.buying_price, 'subtotal', gri.subtotal
            )) as items
     FROM grn_returns gr
     LEFT JOIN users u ON gr.created_by = u.id
     LEFT JOIN grn_return_items gri ON gri.grn_return_id = gr.id
     LEFT JOIN products p ON p.id = gri.product_id
     WHERE gr.grn_id = $1
     GROUP BY gr.id, u.name
     ORDER BY gr.created_at DESC`,
    [grnId]
  );
  return result.rows;
};

export const createGRNReturn = async (
  grnId: number,
  items: Array<{ grn_item_id: number; product_id: number; quantity: number; buying_price: number }>,
  notes: string | undefined,
  userId: number
) => {
  return transaction(async (client: PoolClient) => {
    const returnNumber = generateReturnNumber();
    const totalAmount = round2(items.reduce((s, i) => s + i.quantity * i.buying_price, 0));

    const retResult = await client.query(
      `INSERT INTO grn_returns (return_number, grn_id, notes, total_amount, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [returnNumber, grnId, notes || null, totalAmount, userId]
    );
    const ret = retResult.rows[0];

    for (const item of items) {
      const subtotal = round2(item.quantity * item.buying_price);
      await client.query(
        `INSERT INTO grn_return_items (grn_return_id, grn_item_id, product_id, quantity, buying_price, subtotal)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [ret.id, item.grn_item_id, item.product_id, item.quantity, item.buying_price, subtotal]
      );

      // Deduct stock
      const prodResult = await client.query(
        'SELECT current_stock FROM products WHERE id = $1 FOR UPDATE',
        [item.product_id]
      );
      const balanceBefore = round2(Number(prodResult.rows[0].current_stock));
      const balanceAfter  = round2(balanceBefore - item.quantity);

      await client.query(
        'UPDATE products SET current_stock = $1, updated_at = NOW() WHERE id = $2',
        [balanceAfter, item.product_id]
      );

      await client.query(
        `INSERT INTO stock_movements
           (product_id, movement_type, quantity, balance_before, balance_after, unit_cost, reference_type, reference_id, created_by)
         VALUES ($1,'grn_return',$2,$3,$4,$5,'grn_return',$6,$7)`,
        [item.product_id, item.quantity, balanceBefore, balanceAfter, item.buying_price, ret.id, userId]
      );
    }

    return ret;
  });
};

export const getSuppliers = async () => {
  const result = await query(
    'SELECT * FROM suppliers WHERE deleted_at IS NULL AND is_active = TRUE ORDER BY name',
    []
  );
  return result.rows;
};

export const createSupplier = async (data: Partial<{ name: string; contact_person: string; phone: string; email: string; address: string; notes: string }>) => {
  const result = await query(
    `INSERT INTO suppliers (name, contact_person, phone, email, address, notes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [data.name, data.contact_person || null, data.phone || null, data.email || null, data.address || null, data.notes || null]
  );
  return result.rows[0];
};
