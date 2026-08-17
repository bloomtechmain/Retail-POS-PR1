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
      `CREATE TABLE IF NOT EXISTS grn_returns (
        id SERIAL PRIMARY KEY,
        return_number VARCHAR(100) UNIQUE NOT NULL,
        grn_id INTEGER NOT NULL REFERENCES grn(id),
        notes TEXT,
        total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS grn_return_items (
        id SERIAL PRIMARY KEY,
        grn_return_id INTEGER NOT NULL REFERENCES grn_returns(id) ON DELETE CASCADE,
        grn_item_id INTEGER NOT NULL REFERENCES grn_items(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity DECIMAL(12,3) NOT NULL,
        buying_price DECIMAL(12,4) NOT NULL,
        subtotal DECIMAL(12,2) NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_grn_returns_grn ON grn_returns(grn_id)`,
      `CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        email VARCHAR(255),
        address TEXT,
        credit_limit DECIMAL(12,2),
        current_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
        notes TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        deleted_at TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)`,
      `CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone) WHERE phone IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_customers_balance ON customers(current_balance)`,
      `CREATE TABLE IF NOT EXISTS customer_payments (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        amount DECIMAL(12,2) NOT NULL,
        payment_method VARCHAR(20) NOT NULL DEFAULT 'cash',
        notes TEXT,
        received_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments(customer_id)`,
      `CREATE INDEX IF NOT EXISTS idx_customer_payments_date ON customer_payments(created_at)`,
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id)`,
      `CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id) WHERE customer_id IS NOT NULL`,
      `CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        business_name VARCHAR(255) NOT NULL DEFAULT 'My Business',
        business_type VARCHAR(100) DEFAULT '',
        logo_data_url TEXT,
        address TEXT,
        phone VARCHAR(50),
        email VARCHAR(255),
        currency_code VARCHAR(10) NOT NULL DEFAULT 'USD',
        currency_symbol VARCHAR(10) NOT NULL DEFAULT '$',
        setup_completed BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT settings_singleton CHECK (id = 1)
      )`,
      `INSERT INTO settings (id, business_name, currency_code, currency_symbol, setup_completed)
       VALUES (1, 'My Business', 'USD', '$', FALSE) ON CONFLICT (id) DO NOTHING`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS costing_method VARCHAR(20)`,
      `CREATE TABLE IF NOT EXISTS product_batches (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id),
        grn_item_id INTEGER REFERENCES grn_items(id),
        batch_number VARCHAR(100) NOT NULL,
        quantity_received DECIMAL(12,3) NOT NULL,
        quantity_remaining DECIMAL(12,3) NOT NULL,
        unit_cost DECIMAL(12,4) NOT NULL,
        expiry_date DATE,
        received_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_product_batches_product ON product_batches(product_id)`,
      `CREATE INDEX IF NOT EXISTS idx_product_batches_grn_item ON product_batches(grn_item_id)`,
    ];
    for (const sql of alterations) {
      await query(sql, []);
    }
    console.log('[migrate] Incremental migrations done.');
  }
};
