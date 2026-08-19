import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';
import { getCurrentSchema } from './tenantContext';

dotenv.config();

// Defense in depth: schema names only ever come from our own tenant
// provisioning ("tenant_<id>") or a signature-verified JWT, but SET
// search_path can't be parameterized like a normal query, so validate the
// shape before ever interpolating it into SQL text.
const isSafeSchemaName = (name: string): boolean => /^[a-z_][a-z0-9_]*$/.test(name);

const setSearchPath = async (client: PoolClient, schema: string) => {
  if (!isSafeSchemaName(schema)) {
    throw new Error(`Refusing to use unsafe schema name: ${schema}`);
  }
  await client.query(`SET search_path TO "${schema}", public`);
};

// `SET search_path` persists for the lifetime of the physical connection,
// not just one query — a connection released back to the pool after a
// tenant-scoped query keeps that tenant's search_path until something
// explicitly changes it. So every checkout, tenant or not, must set it
// explicitly; "no tenant context" must mean "explicitly public", never
// "whatever this connection was last used for" (which could silently
// resolve queries against a completely different tenant's data).
const resetSearchPath = async (client: PoolClient) => {
  await client.query(`SET search_path TO public`);
};

// Railway (and most cloud PG providers) expose a DATABASE_URL connection string.
// Fall back to individual vars for local / Electron use.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'retail_pos',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

pool.on('error', (err) => {
  console.error('Unexpected error on idle client:', err);
});

export const query = async (text: string, params?: unknown[]) => {
  const start = Date.now();
  const schema = getCurrentSchema();

  // Every checkout explicitly controls its own search_path — pin one
  // connection just long enough to set it and run this one query, then
  // release it back to the pool. A pooled connection can be handed to a
  // completely different request next time it's checked out (tenant or
  // not), so the search_path is never assumed to already be correct.
  const client = await pool.connect();
  try {
    if (schema) {
      await setSearchPath(client, schema);
    } else {
      await resetSearchPath(client);
    }
    const res = await client.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development' && duration > 100) {
      console.log('Slow query:', { text: text.substring(0, 80), duration, rows: res.rowCount, schema: schema || 'public' });
    }
    return res;
  } finally {
    client.release();
  }
};

export const getClient = async (): Promise<PoolClient> => {
  const client = await pool.connect();
  const schema = getCurrentSchema();
  if (schema) {
    await setSearchPath(client, schema);
  } else {
    await resetSearchPath(client);
  }
  return client;
};

export const transaction = async <T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();
  try {
    const schema = getCurrentSchema();
    if (schema) {
      await setSearchPath(client, schema);
    } else {
      await resetSearchPath(client);
    }
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export default pool;
