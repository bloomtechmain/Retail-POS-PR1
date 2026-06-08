import fs from 'fs';
import path from 'path';
import { query } from './database';

export const runMigrations = async (): Promise<void> => {
  // Check whether the schema has been applied yet
  const check = await query(
    `SELECT EXISTS (
       SELECT FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'users'
     )`,
    []
  );

  const schemaExists = check.rows[0].exists;

  if (!schemaExists) {
    console.log('[migrate] Fresh database — applying schema...');
    // From backend/dist/config/ → ../../../database/schema.sql = repo root
    const schemaPath = path.join(__dirname, '..', '..', '..', 'database', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf-8');
    await query(sql, []);
    console.log('[migrate] Schema applied.');
  } else {
    // Safe incremental alterations for databases that already exist
    const alterations = [
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS name_en VARCHAR(255)`,
      `CREATE TABLE IF NOT EXISTS sale_returns (
        id SERIAL PRIMARY KEY,
        return_number VARCHAR(100) UNIQUE NOT NULL,
        sale_id INTEGER NOT NULL REFERENCES sales(id),
        shift_id INTEGER NOT NULL REFERENCES shifts(id),
        processed_by INTEGER NOT NULL REFERENCES users(id),
        return_reason TEXT,
        refund_method VARCHAR(20) NOT NULL DEFAULT 'cash',
        total_refund_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS sale_return_items (
        id SERIAL PRIMARY KEY,
        return_id INTEGER NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
        sale_item_id INTEGER NOT NULL REFERENCES sale_items(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        product_name VARCHAR(255) NOT NULL,
        quantity DECIMAL(12,3) NOT NULL,
        unit_price DECIMAL(12,2) NOT NULL,
        cost_price DECIMAL(12,4) NOT NULL,
        refund_subtotal DECIMAL(12,2) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sale_returns_sale ON sale_returns(sale_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sale_returns_shift ON sale_returns(shift_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sale_return_items_ret ON sale_return_items(return_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sale_return_items_si ON sale_return_items(sale_item_id)`,
    ];
    for (const sql of alterations) {
      await query(sql, []);
    }
    console.log('[migrate] Incremental migrations done.');
  }
};
