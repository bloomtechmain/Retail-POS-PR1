// One-time migration: converts a single-schema Retail POS database into the
// schema-per-tenant model. Moves every existing business table into a new
// `tenant_1` schema (metadata-only ALTER TABLE ... SET SCHEMA, no data copy),
// creates the platform-level `public.tenants` registry, and links existing
// `public.users` rows to tenant_1 via a new `tenant_id` column.
//
// Run manually: `node scripts/migrate-to-tenant-schema.js`
// Reads DB connection info from apps/pos/backend/.env (same as the rest of the app).
// Safe to re-run: every step is idempotent (IF NOT EXISTS / guarded checks).

const { Client } = require('../apps/pos/backend/node_modules/pg');
require('../apps/pos/backend/node_modules/dotenv').config({ path: __dirname + '/../apps/pos/backend/.env' });

const TENANT_TABLES = [
  'categories', 'brands', 'tax_rates', 'products', 'suppliers',
  'grn', 'grn_items', 'product_batches', 'grn_returns', 'grn_return_items',
  'stock_movements', 'shifts', 'promotions', 'customers', 'customer_payments',
  'sales', 'sale_items', 'sale_item_taxes', 'sale_returns', 'sale_return_items',
  'inventory_adjustments', 'settings', 'vat_invoice_counter',
];

async function main() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  await client.query('BEGIN');
  try {
    const already = await client.query(`SELECT to_regclass('public.tenants') as exists`);
    if (already.rows[0].exists) {
      console.log('public.tenants already exists — this migration has already run. Aborting.');
      await client.query('ROLLBACK');
      await client.end();
      return;
    }

    console.log('Reading current business_name/plan_key from public.settings...');
    const settingsResult = await client.query('SELECT business_name, plan_key FROM settings WHERE id = 1');
    const businessName = settingsResult.rows[0]?.business_name || 'My Business';
    const planKey = settingsResult.rows[0]?.plan_key || 'basic';
    console.log(`  business_name=${businessName} plan_key=${planKey}`);

    console.log('Creating public.tenants...');
    await client.query(`
      CREATE TABLE tenants (
        id SERIAL PRIMARY KEY,
        schema_name VARCHAR(63) UNIQUE NOT NULL,
        business_name VARCHAR(255) NOT NULL,
        plan_key VARCHAR(20) NOT NULL DEFAULT 'basic',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const tenantResult = await client.query(
      `INSERT INTO tenants (schema_name, business_name, plan_key) VALUES ('tenant_1', $1, $2) RETURNING id`,
      [businessName, planKey]
    );
    const tenantId = tenantResult.rows[0].id;
    if (tenantId !== 1) {
      throw new Error(`Expected the first tenant to get id=1, got id=${tenantId} — aborting, schema_name would not match.`);
    }
    console.log(`  created tenants row id=${tenantId}, schema_name=tenant_1`);

    console.log('Creating schema tenant_1...');
    await client.query('CREATE SCHEMA tenant_1');

    console.log('Moving tenant tables into tenant_1 (metadata-only, instant)...');
    for (const table of TENANT_TABLES) {
      const check = await client.query(`SELECT to_regclass('public.${table}') as exists`);
      if (!check.rows[0].exists) {
        console.log(`  SKIP ${table} (does not exist in public — nothing to move)`);
        continue;
      }
      await client.query(`ALTER TABLE public.${table} SET SCHEMA tenant_1`);
      console.log(`  moved ${table}`);
    }

    console.log('Linking public.users to tenant_1...');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INTEGER');
    await client.query('UPDATE users SET tenant_id = 1 WHERE tenant_id IS NULL');
    await client.query('ALTER TABLE users ALTER COLUMN tenant_id SET NOT NULL');
    await client.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    `);
    console.log('  done');

    await client.query('COMMIT');
    console.log('\nMigration complete. tenant_1 now holds all business data; public has tenants/users/roles only.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ROLLED BACK due to error:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
