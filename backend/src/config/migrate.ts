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
    ];
    for (const sql of alterations) {
      await query(sql, []);
    }
    console.log('[migrate] Incremental migrations done.');
  }
};
