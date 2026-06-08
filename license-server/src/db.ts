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
