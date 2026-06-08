import { query } from '../config/database';
import { createError } from '../middleware/error';
import { generateSKU } from '../utils/helpers';
import { Product, PaginatedResult } from '../types';

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

  const result = await query(
    `INSERT INTO products (
       name, name_en, barcode, sku, description, selling_price, cost_price, avg_cost,
       category_id, brand_id, unit_type, current_stock, low_stock_level,
       tax_rate, image_url, is_active, allow_negative_stock
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING *`,
    [
      data.name,
      data.name_en || null,
      data.barcode || null,
      sku,
      data.description || null,
      data.selling_price,
      data.cost_price || 0,
      data.cost_price || 0,
      data.category_id || null,
      data.brand_id || null,
      data.unit_type || 'piece',
      data.current_stock || 0,
      data.low_stock_level || 5,
      data.tax_rate || 0,
      data.image_url || null,
      data.is_active !== false,
      data.allow_negative_stock !== false,
    ]
  );
  return result.rows[0];
};

export const updateProduct = async (id: number, data: Partial<Product>): Promise<Product> => {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  const allowed = [
    'name', 'name_en', 'barcode', 'sku', 'description', 'selling_price', 'cost_price',
    'category_id', 'brand_id', 'unit_type', 'low_stock_level',
    'tax_rate', 'image_url', 'is_active', 'allow_negative_stock',
  ];

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

export const getBrands = async () => {
  const result = await query(
    'SELECT * FROM brands WHERE deleted_at IS NULL ORDER BY name',
    []
  );
  return result.rows;
};
