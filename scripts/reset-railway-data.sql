-- ============================================================
-- Empty all tables (keeps schema/structure intact) and reseed
-- the essentials so the app stays usable: roles, default admin
-- login, default categories, and a fresh (unconfigured) settings row.
--
-- Run this in Railway's Postgres "Data"/"Query" console.
-- ============================================================

-- 1. Empty every table in the public schema, reset SERIAL sequences
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
    EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE;', r.tablename);
  END LOOP;
END $$;

-- 2. Re-seed roles
INSERT INTO roles (name, permissions) VALUES
('admin', '{
  "dashboard": true,
  "pos": true,
  "products": {"view": true, "create": true, "edit": true, "delete": true},
  "inventory": {"view": true, "adjust": true},
  "grn": {"view": true, "create": true, "edit": true},
  "promotions": {"view": true, "create": true, "edit": true, "delete": true},
  "reports": true,
  "shifts": true,
  "users": {"view": true, "create": true, "edit": true, "delete": true},
  "price_override": true
}'),
('manager', '{
  "dashboard": true,
  "pos": true,
  "products": {"view": true, "create": true, "edit": true, "delete": false},
  "inventory": {"view": true, "adjust": true},
  "grn": {"view": true, "create": true, "edit": true},
  "promotions": {"view": true, "create": true, "edit": true, "delete": false},
  "reports": true,
  "shifts": true,
  "users": {"view": true, "create": false, "edit": false, "delete": false},
  "price_override": true
}'),
('cashier', '{
  "dashboard": false,
  "pos": true,
  "products": {"view": true, "create": false, "edit": false, "delete": false},
  "inventory": {"view": false, "adjust": false},
  "grn": {"view": false, "create": false, "edit": false},
  "promotions": {"view": false, "create": false, "edit": false, "delete": false},
  "reports": false,
  "shifts": true,
  "users": {"view": false, "create": false, "edit": false, "delete": false},
  "price_override": false
}');

-- 3. Re-seed default admin login (password: admin123 — change it after logging in)
INSERT INTO users (name, email, password, role_id, pin)
SELECT 'Admin User', 'admin@retailpos.com',
  '$2a$10$3OL4r2TIxSn.3hEl7HCOR.Gj5w2ANxIbtJXU910TlLH5m1eoHFn/6',
  r.id, '1234'
FROM roles r WHERE r.name = 'admin';

-- 4. Re-seed generic default categories
INSERT INTO categories (name, color) VALUES
('General', '#6366f1'),
('Food & Beverage', '#f59e0b'),
('Electronics', '#3b82f6'),
('Clothing', '#ec4899'),
('Health & Beauty', '#10b981'),
('Home & Office', '#8b5cf6');

-- 5. Re-seed the settings singleton row (unconfigured — shop will hit the Setup wizard on next admin login)
INSERT INTO settings (id, business_name, currency_code, currency_symbol, setup_completed)
VALUES (1, 'My Business', 'USD', '$', FALSE);
