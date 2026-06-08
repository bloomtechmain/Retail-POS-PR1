import { query } from '../config/database';
import { createError } from '../middleware/error';
import { round2 } from '../utils/helpers';

export const getStockMovements = async (params: {
  product_id?: number;
  movement_type?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}) => {
  const page = params.page || 1;
  const limit = params.limit || 50;
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (params.product_id) { conditions.push(`sm.product_id = $${i++}`); values.push(params.product_id); }
  if (params.movement_type) { conditions.push(`sm.movement_type = $${i++}`); values.push(params.movement_type); }
  if (params.date_from) { conditions.push(`sm.created_at >= $${i++}`); values.push(params.date_from); }
  if (params.date_to) { conditions.push(`sm.created_at <= $${i++}`); values.push(params.date_to + ' 23:59:59'); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(`SELECT COUNT(*) FROM stock_movements sm ${where}`, values);
  const dataResult = await query(
    `SELECT sm.*, p.name as product_name, p.sku, u.name as created_by_name
     FROM stock_movements sm
     JOIN products p ON sm.product_id = p.id
     LEFT JOIN users u ON sm.created_by = u.id
     ${where}
     ORDER BY sm.created_at DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    [...values, limit, offset]
  );

  const total = parseInt(countResult.rows[0].count);
  return { data: dataResult.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const adjustInventory = async (
  productId: number,
  adjustmentType: 'add' | 'subtract' | 'set',
  quantity: number,
  reason: string,
  userId: number
) => {
  const productResult = await query(
    'SELECT id, name, current_stock FROM products WHERE id = $1 AND deleted_at IS NULL',
    [productId]
  );
  if (productResult.rows.length === 0) throw createError('Product not found', 404);

  const product = productResult.rows[0];
  const currentStock = parseFloat(product.current_stock);
  let newStock: number;
  let movementQty: number;
  let movementType: string;

  switch (adjustmentType) {
    case 'add':
      newStock = round2(currentStock + quantity);
      movementQty = quantity;
      movementType = 'adjustment_in';
      break;
    case 'subtract':
      newStock = round2(currentStock - quantity);
      movementQty = quantity;
      movementType = 'adjustment_out';
      break;
    case 'set':
      movementQty = Math.abs(quantity - currentStock);
      movementType = quantity >= currentStock ? 'adjustment_in' : 'adjustment_out';
      newStock = round2(quantity);
      break;
    default:
      throw createError('Invalid adjustment type', 400);
  }

  await query(
    'UPDATE products SET current_stock = $1, updated_at = NOW() WHERE id = $2',
    [newStock, productId]
  );

  await query(
    `INSERT INTO stock_movements
       (product_id, movement_type, quantity, balance_before, balance_after, notes, reference_type, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'adjustment',$7)`,
    [productId, movementType, movementQty, currentStock, newStock, reason, userId]
  );

  await query(
    `INSERT INTO inventory_adjustments
       (product_id, adjustment_type, quantity, quantity_before, quantity_after, reason, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [productId, adjustmentType, movementQty, currentStock, newStock, reason, userId]
  );

  return { product_id: productId, quantity_before: currentStock, quantity_after: newStock };
};
