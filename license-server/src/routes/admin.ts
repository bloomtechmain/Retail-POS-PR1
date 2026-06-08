import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db';
import { generateLicenseKey, isValidKeyFormat } from '../licenseUtils';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// POST /api/admin/login
router.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }

  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username) as
    | { id: number; username: string; password_hash: string }
    | undefined;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'JWT_SECRET not configured' });
    return;
  }

  const token = jwt.sign({ username: user.username }, secret, { expiresIn: '8h' });
  res.json({ token, username: user.username });
});

// POST /api/admin/licenses/generate
router.post('/licenses/generate', requireAuth, (req: AuthRequest, res: Response) => {
  const {
    customer_name,
    customer_email,
    count = 1,
    notes,
  } = req.body as {
    customer_name?: string;
    customer_email?: string;
    count?: number;
    notes?: string;
  };

  const qty = Math.min(Math.max(1, Number(count) || 1), 100);
  const keys: string[] = [];

  const insert = db.prepare(
    `INSERT INTO licenses (license_key, customer_name, customer_email, notes)
     VALUES (?, ?, ?, ?)`
  );

  db.exec('BEGIN');
  try {
    for (let i = 0; i < qty; i++) {
      let key = generateLicenseKey();
      // Ensure uniqueness (extremely unlikely collision, but be safe)
      let attempts = 0;
      while (db.prepare('SELECT 1 FROM licenses WHERE license_key = ?').get(key) && attempts < 10) {
        key = generateLicenseKey();
        attempts++;
      }
      insert.run(key, customer_name || null, customer_email || null, notes || null);
      keys.push(key);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  res.json({ generated: keys.length, keys });
});

// GET /api/admin/licenses
router.get('/licenses', requireAuth, (req: AuthRequest, res: Response) => {
  const search = (req.query.search as string) || '';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 50;
  const offset = (page - 1) * limit;

  const where = search
    ? `WHERE license_key LIKE ? OR customer_name LIKE ? OR customer_email LIKE ?`
    : '';
  const params = search
    ? [`%${search}%`, `%${search}%`, `%${search}%`, limit, offset]
    : [limit, offset];

  const licenses = db
    .prepare(`SELECT * FROM licenses ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params);

  const totalRow = db
    .prepare(`SELECT COUNT(*) as c FROM licenses ${where}`)
    .get(...(search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [])) as { c: number };

  res.json({ licenses, total: totalRow.c, page, limit });
});

// GET /api/admin/licenses/:key
router.get('/licenses/:key', requireAuth, (req: AuthRequest, res: Response) => {
  const key = req.params.key.toUpperCase();
  const license = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(key);
  if (!license) {
    res.status(404).json({ error: 'License not found' });
    return;
  }

  const logs = db
    .prepare(
      'SELECT * FROM activation_log WHERE license_key = ? ORDER BY attempted_at DESC LIMIT 20'
    )
    .all(key);

  res.json({ license, logs });
});

// PATCH /api/admin/licenses/:key — revoke or re-enable
router.patch('/licenses/:key', requireAuth, (req: AuthRequest, res: Response) => {
  const key = req.params.key.toUpperCase();
  const { is_active } = req.body as { is_active?: boolean };

  const license = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(key);
  if (!license) {
    res.status(404).json({ error: 'License not found' });
    return;
  }

  db.prepare('UPDATE licenses SET is_active = ? WHERE license_key = ?').run(
    is_active ? 1 : 0,
    key
  );

  res.json({ success: true });
});

// DELETE /api/admin/licenses/:key
router.delete('/licenses/:key', requireAuth, (req: AuthRequest, res: Response) => {
  const key = req.params.key.toUpperCase();
  const result = db.prepare('DELETE FROM licenses WHERE license_key = ?').run(key);
  if (result.changes === 0) {
    res.status(404).json({ error: 'License not found' });
    return;
  }
  res.json({ success: true });
});

// GET /api/admin/stats
router.get('/stats', requireAuth, (_req: AuthRequest, res: Response) => {
  const total = (db.prepare('SELECT COUNT(*) as c FROM licenses').get() as { c: number }).c;
  const used = (
    db.prepare('SELECT COUNT(*) as c FROM licenses WHERE is_used = 1').get() as { c: number }
  ).c;
  const active = (
    db.prepare('SELECT COUNT(*) as c FROM licenses WHERE is_active = 1').get() as { c: number }
  ).c;
  const revoked = (
    db.prepare('SELECT COUNT(*) as c FROM licenses WHERE is_active = 0').get() as { c: number }
  ).c;

  res.json({ total, used, active, revoked, unused: total - used });
});

export default router;
