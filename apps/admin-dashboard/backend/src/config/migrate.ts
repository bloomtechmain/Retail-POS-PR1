import { query } from './database';

// Creates public.staff / public.platform_customers in the SAME Postgres
// database apps/pos/backend already manages (its migrate.ts creates
// public.tenants/roles/users). This service only ever needs those two
// tables — everything else in `public` and every tenant schema is owned
// and created by apps/pos/backend, never by this service.
export const runMigrations = async (): Promise<void> => {
  const tenantsCheck = await query(
    `SELECT EXISTS (
       SELECT FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'tenants'
     )`,
    []
  );
  if (!tenantsCheck.rows[0].exists) {
    // platform_customers.tenant_id references tenants(id) — apps/pos/backend
    // must have bootstrapped at least once before this can run. In normal
    // local/deployed startup order this is already true by the time this
    // runs; if not, fail loudly rather than silently skip the FK.
    console.warn('[migrate] public.tenants does not exist yet — start apps/pos/backend at least once first. Skipping.');
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS staff (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'agent')),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INTEGER REFERENCES staff(id),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )
  `, []);

  await query(`
    CREATE TABLE IF NOT EXISTS platform_customers (
      id SERIAL PRIMARY KEY,
      agent_id INTEGER NOT NULL REFERENCES staff(id),
      customer_name VARCHAR(255) NOT NULL,
      customer_email VARCHAR(255) NOT NULL,
      customer_phone VARCHAR(50),
      delivery_type VARCHAR(10) NOT NULL CHECK (delivery_type IN ('online', 'offline')),
      plan_key VARCHAR(20) NOT NULL DEFAULT 'basic',
      custom_features JSONB,
      tenant_id INTEGER REFERENCES tenants(id),
      license_key VARCHAR(50),
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `, []);
  await query(`CREATE INDEX IF NOT EXISTS idx_platform_customers_agent ON platform_customers(agent_id)`, []);

  // Subscription renewal tracking — expired/active is always derived from
  // subscription_end_date < NOW() (no separate status column to drift out
  // of sync). Backfill existing rows to their created_at + 1 month so
  // nothing already in the ledger is treated as expired the moment this
  // migration runs.
  await query(`ALTER TABLE platform_customers ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMP`, []);
  await query(`ALTER TABLE platform_customers ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMP`, []);
  await query(
    `UPDATE platform_customers SET subscription_end_date = created_at + INTERVAL '1 month' WHERE subscription_end_date IS NULL`,
    []
  );

  console.log('[migrate] staff/platform_customers ready.');
};

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
