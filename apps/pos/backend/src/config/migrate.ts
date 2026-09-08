import { query } from './database';
import { runWithTenant } from './tenantContext';

// Hosted backend is multi-tenant: `public` only ever holds the platform
// registry (tenants/roles/users) — every business table lives inside that
// tenant's own "tenant_<id>" schema (see tenantSchema.ts / tenant.service.ts
// for how a schema gets its tables in the first place, at sign-up). This
// function's job is purely *incremental*: apply the same set of ALTER/CREATE
// statements — unchanged from before multi-tenancy — to every existing
// tenant's schema, once each, whenever the app starts up in production.
export const runMigrations = async (): Promise<void> => {
  const check = await query(
    `SELECT EXISTS (
       SELECT FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'tenants'
     )`,
    []
  );

  const platformBootstrapped = check.rows[0].exists;

  // `tenants` is public-schema, platform-wide, and safe to create
  // unconditionally on every startup (idempotent CREATE TABLE IF NOT
  // EXISTS), not just at first bootstrap. `staff`/`platform_customers` are
  // no longer created here — apps/admin-dashboard/backend owns those now
  // (same shared Postgres database, separate service/codebase).
  await query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id SERIAL PRIMARY KEY,
      schema_name VARCHAR(63) UNIQUE NOT NULL,
      business_name VARCHAR(255) NOT NULL,
      plan_key VARCHAR(20) NOT NULL DEFAULT 'basic',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `, []);

  if (!platformBootstrapped) {
    console.log('[migrate] Fresh platform database — bootstrapping public.roles/users...');
    await query(`
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        permissions JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `, []);
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role_id INTEGER NOT NULL REFERENCES roles(id),
        pin VARCHAR(10),
        is_active BOOLEAN DEFAULT TRUE,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        deleted_at TIMESTAMP
      )
    `, []);
    await query(`
      INSERT INTO roles (name, permissions) VALUES
      ('admin', '{"dashboard":true,"pos":true,"products":{"view":true,"create":true,"edit":true,"delete":true},"inventory":{"view":true,"adjust":true},"grn":{"view":true,"create":true,"edit":true},"promotions":{"view":true,"create":true,"edit":true,"delete":true},"reports":true,"shifts":true,"users":{"view":true,"create":true,"edit":true,"delete":true},"price_override":true}'),
      ('manager', '{"dashboard":true,"pos":true,"products":{"view":true,"create":true,"edit":true,"delete":false},"inventory":{"view":true,"adjust":true},"grn":{"view":true,"create":true,"edit":true},"promotions":{"view":true,"create":true,"edit":true,"delete":false},"reports":true,"shifts":true,"users":{"view":true,"create":false,"edit":false,"delete":false},"price_override":true}'),
      ('cashier', '{"dashboard":false,"pos":true,"products":{"view":true,"create":false,"edit":false,"delete":false},"inventory":{"view":false,"adjust":false},"grn":{"view":false,"create":false,"edit":false},"promotions":{"view":false,"create":false,"edit":false,"delete":false},"reports":false,"shifts":true,"users":{"view":false,"create":false,"edit":false,"delete":false},"price_override":false}')
      ON CONFLICT (name) DO NOTHING
    `, []);
    console.log('[migrate] Platform tables bootstrapped. No tenants yet — sign up to create the first one.');
    return;
  }

  const tenantsResult = await query('SELECT schema_name FROM tenants WHERE is_active = TRUE', []);
  if (tenantsResult.rows.length === 0) {
    console.log('[migrate] No tenants yet — nothing to migrate.');
    return;
  }

  for (const { schema_name: schemaName } of tenantsResult.rows) {
    console.log(`[migrate] Applying incremental migrations to ${schemaName}...`);
    await runWithTenant(schemaName, async () => {
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
      `CREATE TABLE IF NOT EXISTS tax_rates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        rate DECIMAL(5,2) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_vat_invoice BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS vat_invoice_number VARCHAR(50)`,
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS buyer_vat_reg_no VARCHAR(100)`,
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS buyer_address TEXT`,
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS buyer_phone VARCHAR(50)`,
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_date DATE`,
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS place_of_supply VARCHAR(255)`,
      `CREATE TABLE IF NOT EXISTS sale_item_taxes (
        id SERIAL PRIMARY KEY,
        sale_item_id INTEGER NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
        tax_rate_id INTEGER REFERENCES tax_rates(id),
        tax_name VARCHAR(100) NOT NULL,
        tax_rate DECIMAL(5,2) NOT NULL,
        tax_amount DECIMAL(12,2) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sale_item_taxes_item ON sale_item_taxes(sale_item_id)`,
      `ALTER TABLE settings ADD COLUMN IF NOT EXISTS vat_registration_number VARCHAR(100)`,
      `ALTER TABLE settings ADD COLUMN IF NOT EXISTS plan_key VARCHAR(20) NOT NULL DEFAULT 'basic'`,
      `ALTER TABLE settings ADD COLUMN IF NOT EXISTS custom_features JSONB`,
      `CREATE TABLE IF NOT EXISTS vat_invoice_counter (
        id INTEGER PRIMARY KEY DEFAULT 1,
        next_number INTEGER NOT NULL DEFAULT 1,
        CONSTRAINT vat_invoice_counter_singleton CHECK (id = 1)
      )`,
      `INSERT INTO vat_invoice_counter (id, next_number) VALUES (1, 1) ON CONFLICT (id) DO NOTHING`,
      `CREATE TABLE IF NOT EXISTS coupons (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        type VARCHAR(20) NOT NULL,
        discount_value DECIMAL(10,4) NOT NULL,
        min_purchase_amount DECIMAL(12,2),
        max_uses INTEGER,
        uses_count INTEGER NOT NULL DEFAULT 0,
        max_uses_per_customer INTEGER,
        start_date DATE,
        end_date DATE,
        is_active BOOLEAN DEFAULT TRUE,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code)`,
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS coupon_id INTEGER REFERENCES coupons(id)`,
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS coupon_discount DECIMAL(12,2) DEFAULT 0`,
      `CREATE TABLE IF NOT EXISTS kitchen_stations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS station_id INTEGER REFERENCES kitchen_stations(id) ON DELETE SET NULL`,
      `CREATE INDEX IF NOT EXISTS idx_products_station ON products(station_id) WHERE station_id IS NOT NULL`,
      `CREATE TABLE IF NOT EXISTS tables (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        capacity INTEGER,
        status VARCHAR(20) NOT NULL DEFAULT 'available',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        deleted_at TIMESTAMP
      )`,
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS table_id INTEGER REFERENCES tables(id)`,
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS order_type VARCHAR(20) NOT NULL DEFAULT 'retail'`,
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS kot_printed_at TIMESTAMP`,
      `CREATE INDEX IF NOT EXISTS idx_sales_table ON sales(table_id) WHERE table_id IS NOT NULL`,
      `ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS kot_sent_at TIMESTAMP`,
      `CREATE TABLE IF NOT EXISTS terminals (
        id SERIAL PRIMARY KEY,
        fingerprint VARCHAR(64) UNIQUE NOT NULL,
        name VARCHAR(255),
        last_seen_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `ALTER TABLE settings ADD COLUMN IF NOT EXISTS restaurant_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_vat_customer BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE customers ADD COLUMN IF NOT EXISTS vat_reg_no VARCHAR(100)`,
      `ALTER TABLE settings ADD COLUMN IF NOT EXISTS backup_schedule_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE settings ADD COLUMN IF NOT EXISTS backup_schedule_frequency VARCHAR(10) NOT NULL DEFAULT 'daily'`,
      `ALTER TABLE settings ADD COLUMN IF NOT EXISTS backup_schedule_time VARCHAR(5) NOT NULL DEFAULT '23:00'`,
      `ALTER TABLE settings ADD COLUMN IF NOT EXISTS backup_schedule_day_of_week INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE settings ADD COLUMN IF NOT EXISTS backup_schedule_day_of_month INTEGER NOT NULL DEFAULT 1`,
      `ALTER TABLE settings ADD COLUMN IF NOT EXISTS backup_last_run_at TIMESTAMP`,
      ];
      for (const sql of alterations) {
        await query(sql, []);
      }
    });
  }
  console.log('[migrate] Incremental migrations done for all tenants.');
};
