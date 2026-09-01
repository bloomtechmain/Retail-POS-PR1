import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

// ── node:sqlite is built into Node.js 22.5+ — zero native compilation needed ──
// Declare minimal types inline so we don't need @types for this built-in module.
type Row = Record<string, unknown>;
type Statement = {
  run: (...params: unknown[]) => { changes: number; lastInsertRowid: number | bigint };
  get: (...params: unknown[]) => Row | undefined;
  all: (...params: unknown[]) => Row[];
};
type DB = {
  exec: (sql: string) => void;
  prepare: (sql: string) => Statement;
  close: () => void;
};
/* eslint-disable @typescript-eslint/no-require-imports */
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => DB };

const dbPath = process.env.DB_PATH || './data/licenses.db';
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db: DB = new DatabaseSync(dbPath);

// Enable WAL mode for better performance
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT NOT NULL UNIQUE,
    customer_name TEXT,
    customer_email TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    activated_at TEXT,
    machine_fingerprint TEXT,
    machine_name TEXT,
    activation_token TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    is_used INTEGER NOT NULL DEFAULT 0,
    notes TEXT
  )
`);

// Set once by admin-dashboard at generation time (a marketing agent presets
// the customer's first login), served back exactly once on the license's
// first successful activation, then cleared — never persisted long-term.
// Plaintext, not a hash: the Electron app needs the plaintext once to call
// PUT /api/users/:id (which does its own bcrypt.hash()); a hash can't be
// un-hashed, so storing only a hash here wouldn't let the app use it.
// SQLite's ALTER TABLE ADD COLUMN has no IF NOT EXISTS clause (unlike
// Postgres), so check table_info first to stay idempotent across restarts.
const licenseColumns = db.prepare(`PRAGMA table_info(licenses)`).all() as Array<{ name: string }>;
const hasColumn = (name: string) => licenseColumns.some((c) => c.name === name);
if (!hasColumn('preset_admin_email')) {
  db.exec(`ALTER TABLE licenses ADD COLUMN preset_admin_email TEXT`);
}
if (!hasColumn('preset_admin_password')) {
  db.exec(`ALTER TABLE licenses ADD COLUMN preset_admin_password TEXT`);
}
// Hard cutoff (subscription_end_date + 1 week grace, computed by
// admin-dashboard) — embedded into the signed activation token's `exp`
// claim so an offline install can enforce it locally on every launch,
// with no live call back to this server after first activation.
if (!hasColumn('expires_at')) {
  db.exec(`ALTER TABLE licenses ADD COLUMN expires_at TEXT`);
}
// Which package this key should activate with — set by admin-dashboard at
// generation/upgrade time, embedded into the signed activation token's
// `plan_key` claim so an offline install knows its feature set with no live
// call back to this server after first activation (same reasoning as `exp`).
if (!hasColumn('plan_key')) {
  db.exec(`ALTER TABLE licenses ADD COLUMN plan_key TEXT`);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS activation_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT NOT NULL,
    machine_fingerprint TEXT NOT NULL,
    machine_name TEXT,
    ip_address TEXT,
    attempted_at TEXT NOT NULL DEFAULT (datetime('now')),
    success INTEGER NOT NULL DEFAULT 0,
    reason TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// Seed admin user if none exists
const adminRow = db.prepare('SELECT COUNT(*) as c FROM admin_users').get() as { c: number };
if (adminRow.c === 0) {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'change_this_password';
  const hash = bcrypt.hashSync(password, 12);
  db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(username, hash);
  console.log(`Admin user '${username}' created.`);
}

export default db;
