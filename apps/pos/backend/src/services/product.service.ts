import { PoolClient } from 'pg';
import { query, transaction } from '../config/database';
import { createError } from '../middleware/error';
import { generateSKU, addBatch } from '../utils/helpers';
import { Product, PaginatedResult } from '../types';
import { planIncludes, DEFAULT_PLAN_KEY } from '../data/plans';

const assertFifoAllowed = async () => {
  const settingsResult = await query('SELECT plan_key, custom_features FROM settings WHERE id = 1', []);
  const planKey = settingsResult.rows[0]?.plan_key || DEFAULT_PLAN_KEY;
  const customFeatures = settingsResult.rows[0]?.custom_features ?? null;
  if (!planIncludes(planKey, 'fifo_costing', customFeatures)) {
    throw createError('FIFO / Batch-wise costing isn\'t included in your current plan. Upgrade in Settings to unlock it.', 403);
  }
};

export const getProducts = async (params: {
  search?: string;
  category_id?: number;
  brand_id?: number;
  page?: number;
  limit?: number;
  active_only?: boolean;
}): Promise<PaginatedResult<Product>> => {
  const page = params.page || 1;
  const limit = params.limit || 50;
  const offset = (page - 1) * limit;

  const conditions: string[] = ['p.deleted_at IS NULL'];
  const values: unknown[] = [];
  let i = 1;

  if (params.active_only !== false) {
    conditions.push('p.is_active = TRUE');
  }
  if (params.search) {
    conditions.push(
      `(p.name ILIKE $${i} OR p.name_en ILIKE $${i} OR p.barcode = $${i + 1} OR p.sku ILIKE $${i + 2})`
    );
    values.push(`%${params.search}%`, params.search, `%${params.search}%`);
    i += 3;
  }
  if (params.category_id) {
    conditions.push(`p.category_id = $${i++}`);
    values.push(params.category_id);
  }
  if (params.brand_id) {
    conditions.push(`p.brand_id = $${i++}`);
    values.push(params.brand_id);
  }

  const where = conditions.join(' AND ');

  const countResult = await query(
    `SELECT COUNT(*) FROM products p WHERE ${where}`,
    values
  );

  const dataResult = await query(
    `SELECT p.*, c.name as category_name, b.name as brand_name
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id
     LEFT JOIN brands b ON p.brand_id = b.id
     WHERE ${where}
     ORDER BY p.name ASC
     LIMIT $${i} OFFSET $${i + 1}`,
    [...values, limit, offset]
  );

  const total = parseInt(countResult.rows[0].count);
  return {
    data: dataResult.rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

export const getProductById = async (id: number): Promise<Product> => {
  const result = await query(
    `SELECT p.*, c.name as category_name, b.name as brand_name
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id
     LEFT JOIN brands b ON p.brand_id = b.id
     WHERE p.id = $1 AND p.deleted_at IS NULL`,
    [id]
  );
  if (result.rows.length === 0) throw createError('Product not found', 404);
  return result.rows[0];
};

export const getProductByBarcode = async (barcode: string): Promise<Product> => {
  const result = await query(
    `SELECT p.*, c.name as category_name, b.name as brand_name
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id
     LEFT JOIN brands b ON p.brand_id = b.id
     WHERE (p.barcode = $1 OR p.sku = $1) AND p.deleted_at IS NULL AND p.is_active = TRUE`,
    [barcode]
  );
  if (result.rows.length === 0) throw createError('Product not found', 404);
  return result.rows[0];
};

export const createProduct = async (data: Partial<Product>): Promise<Product> => {
  const sku = data.sku || generateSKU();

  // Check SKU uniqueness
  const existing = await query('SELECT id FROM products WHERE sku = $1', [sku]);
  if (existing.rows.length > 0) throw createError('SKU already exists', 400);

  const costingMethod = data.costing_method === 'fifo' ? 'fifo' : 'weighted_average';
  if (costingMethod === 'fifo') await assertFifoAllowed();
  const openingStock = data.current_stock || 0;
  const openingCost = data.cost_price || 0;

  return transaction(async (client: PoolClient) => {
    const result = await client.query(
      `INSERT INTO products (
         name, name_en, barcode, sku, description, selling_price, cost_price, avg_cost,
         category_id, brand_id, unit_type, current_stock, low_stock_level,
         tax_rate, image_url, is_active, allow_negative_stock, costing_method
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [
        data.name,
        data.name_en || null,
        data.barcode || null,
        sku,
        data.description || null,
        data.selling_price,
        openingCost,
        openingCost,
        data.category_id || null,
        data.brand_id || null,
        data.unit_type || 'piece',
        openingStock,
        data.low_stock_level || 5,
        data.tax_rate || 0,
        data.image_url || null,
        data.is_active !== false,
        data.allow_negative_stock !== false,
        costingMethod,
      ]
    );
    const product = result.rows[0];

    // FIFO products get their opening stock recorded as a batch too, so it's
    // priced and tracked the same way as everything received afterward
    // (rather than falling back to avg_cost as unbatched legacy stock).
    if (costingMethod === 'fifo' && openingStock > 0) {
      await addBatch(client, {
        productId: product.id,
        quantity: openingStock,
        unitCost: openingCost,
      });
    }

    // Records the starting cost point for the cost-history view — every
    // product gets one, even with zero opening stock (the far more common
    // case — most products get their first real stock via GRN). Without
    // this, the cost entered at creation is lost the moment the first GRN
    // receipt overwrites products.cost_price, with no trace it ever existed.
    await client.query(
      `INSERT INTO stock_movements
         (product_id, movement_type, quantity, balance_before, balance_after, unit_cost, reference_type)
       VALUES ($1,'opening',$2,0,$2,$3,'product_creation')`,
      [product.id, openingStock, openingCost]
    );

    return product;
  });
};

export const updateProduct = async (id: number, data: Partial<Product>): Promise<Product> => {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (data.costing_method === 'fifo') await assertFifoAllowed();

  // Editable going forward, not retroactive: switching costing_method never
  // rewrites past batches/avg_cost history, it only changes which one the
  // NEXT GRN receipt / sale looks at. This is safe by construction —
  // switching to weighted_average just stops touching product_batches (avg_cost
  // is already kept live for every product regardless of method); switching
  // to fifo with no batches yet falls back to avg_cost for any un-batched
  // stock until the next GRN receipt starts building real batches.
  const allowed = [
    'name', 'name_en', 'barcode', 'sku', 'description', 'selling_price', 'cost_price',
    'category_id', 'brand_id', 'unit_type', 'low_stock_level',
    'tax_rate', 'image_url', 'is_active', 'allow_negative_stock', 'costing_method',
  ];

  if (data.costing_method !== undefined && !['weighted_average', 'fifo'].includes(data.costing_method as string)) {
    throw createError('Invalid costing method', 400);
  }

  for (const key of allowed) {
    if (key in data && data[key as keyof Product] !== undefined) {
      fields.push(`${key} = $${i++}`);
      values.push(data[key as keyof Product]);
    }
  }

  if (fields.length === 0) throw createError('No fields to update', 400);

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query(
    `UPDATE products SET ${fields.join(', ')} WHERE id = $${i} AND deleted_at IS NULL RETURNING *`,
    values
  );
  if (result.rows.length === 0) throw createError('Product not found', 404);
  return result.rows[0];
};

export const deleteProduct = async (id: number): Promise<void> => {
  const result = await query(
    'UPDATE products SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  if (result.rowCount === 0) throw createError('Product not found', 404);
};

export const getLowStockProducts = async (): Promise<Product[]> => {
  const result = await query(
    `SELECT p.*, c.name as category_name
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id
     WHERE p.deleted_at IS NULL AND p.is_active = TRUE
       AND p.current_stock <= p.low_stock_level
     ORDER BY p.current_stock ASC`,
    []
  );
  return result.rows;
};

export const getCategories = async () => {
  const result = await query(
    'SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY name',
    []
  );
  return result.rows;
};

export const createCategory = async (input: { name: string; color?: string; description?: string }) => {
  if (!input.name?.trim()) throw createError('Category name is required', 400);
  const result = await query(
    `INSERT INTO categories (name, color, description) VALUES ($1, $2, $3) RETURNING *`,
    [input.name.trim(), input.color || '#6366f1', input.description || null]
  );
  return result.rows[0];
};

export const getBrands = async () => {
  const result = await query(
    'SELECT * FROM brands WHERE deleted_at IS NULL ORDER BY name',
    []
  );
  return result.rows;
};

// Chronological trail of what this product's cost was set to at each
// purchase — the opening stock entry (if any) plus every GRN receipt.
// Deliberately excludes adjustments/returns/GRN-returns: none of those
// change avg_cost, so they aren't "buys" that moved the cost.
export const getProductCostHistory = async (productId: number) => {
  const result = await query(
    `SELECT sm.id, sm.movement_type, sm.quantity, sm.unit_cost, sm.created_at,
            g.grn_number
     FROM stock_movements sm
     LEFT JOIN grn g ON sm.reference_type = 'grn' AND sm.reference_id = g.id
     WHERE sm.product_id = $1 AND sm.movement_type IN ('opening', 'grn_in')
     ORDER BY sm.created_at ASC, sm.id ASC`,
    [productId]
  );
  return result.rows;
};

// Same order batches are consumed in (nearest-expiry-first, then oldest-received-first)
// so the list reads top-to-bottom as "what sells next".
export const getProductBatches = async (productId: number) => {
  const result = await query(
    `SELECT * FROM product_batches
     WHERE product_id = $1
     ORDER BY (expiry_date IS NULL), expiry_date ASC, created_at ASC, id ASC`,
    [productId]
  );
  return result.rows;
};
