-- ============================================================
-- RETAIL POS - PostgreSQL Database Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ROLES & USERS
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
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
);

-- ============================================================
-- CATEGORIES & BRANDS
-- ============================================================

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  color VARCHAR(20) DEFAULT '#6366f1',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS brands (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- ============================================================
-- PRODUCTS
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  name_en VARCHAR(255),
  barcode VARCHAR(100),
  sku VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  selling_price DECIMAL(12,2) NOT NULL,
  cost_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  avg_cost DECIMAL(12,4) NOT NULL DEFAULT 0,
  category_id INTEGER REFERENCES categories(id),
  brand_id INTEGER REFERENCES brands(id),
  unit_type VARCHAR(50) DEFAULT 'piece',
  current_stock DECIMAL(12,3) DEFAULT 0,
  low_stock_level DECIMAL(12,3) DEFAULT 5,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  image_url VARCHAR(500),
  is_active BOOLEAN DEFAULT TRUE,
  allow_negative_stock BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_name ON products USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

-- ============================================================
-- SUPPLIERS
-- ============================================================

CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  address TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- ============================================================
-- GRN (GOODS RECEIVED NOTE)
-- ============================================================

CREATE TABLE IF NOT EXISTS grn (
  id SERIAL PRIMARY KEY,
  grn_number VARCHAR(100) UNIQUE NOT NULL,
  supplier_id INTEGER REFERENCES suppliers(id),
  invoice_number VARCHAR(100),
  received_date DATE NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) DEFAULT 'completed',
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grn_items (
  id SERIAL PRIMARY KEY,
  grn_id INTEGER NOT NULL REFERENCES grn(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity DECIMAL(12,3) NOT NULL,
  buying_price DECIMAL(12,4) NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grn_supplier ON grn(supplier_id);
CREATE INDEX IF NOT EXISTS idx_grn_date ON grn(received_date);
CREATE INDEX IF NOT EXISTS idx_grn_items_product ON grn_items(product_id);

-- ============================================================
-- STOCK MOVEMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_movements (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  movement_type VARCHAR(50) NOT NULL,
  -- Types: 'grn_in', 'sale_out', 'adjustment_in', 'adjustment_out', 'return_in', 'opening'
  quantity DECIMAL(12,3) NOT NULL,
  balance_before DECIMAL(12,3) NOT NULL,
  balance_after DECIMAL(12,3) NOT NULL,
  unit_cost DECIMAL(12,4),
  reference_type VARCHAR(50),
  reference_id INTEGER,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(created_at);

-- ============================================================
-- SHIFTS
-- ============================================================

CREATE TABLE IF NOT EXISTS shifts (
  id SERIAL PRIMARY KEY,
  shift_number VARCHAR(50) UNIQUE NOT NULL,
  opened_by INTEGER NOT NULL REFERENCES users(id),
  closed_by INTEGER REFERENCES users(id),
  open_time TIMESTAMP NOT NULL DEFAULT NOW(),
  close_time TIMESTAMP,
  opening_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
  expected_cash DECIMAL(12,2),
  actual_cash DECIMAL(12,2),
  cash_difference DECIMAL(12,2),
  total_sales DECIMAL(12,2) DEFAULT 0,
  total_cash_sales DECIMAL(12,2) DEFAULT 0,
  total_card_sales DECIMAL(12,2) DEFAULT 0,
  total_transactions INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'open',
  -- Status: 'open', 'closed'
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_shifts_opened_by ON shifts(opened_by);

-- ============================================================
-- PROMOTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS promotions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL,
  -- Types: 'percentage', 'fixed_amount', 'buy_x_get_y', 'free_item'
  discount_value DECIMAL(10,4),
  min_purchase_amount DECIMAL(12,2),
  min_purchase_qty INTEGER,
  buy_quantity INTEGER,
  get_quantity INTEGER,
  get_product_id INTEGER REFERENCES products(id),
  applies_to VARCHAR(50) DEFAULT 'all',
  -- Applies: 'all', 'category', 'product'
  category_id INTEGER REFERENCES categories(id),
  product_id INTEGER REFERENCES products(id),
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(is_active, start_date, end_date);

-- ============================================================
-- SALES
-- ============================================================

CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  sale_number VARCHAR(100) UNIQUE NOT NULL,
  shift_id INTEGER NOT NULL REFERENCES shifts(id),
  cashier_id INTEGER NOT NULL REFERENCES users(id),
  subtotal DECIMAL(12,2) NOT NULL,
  item_discount DECIMAL(12,2) DEFAULT 0,
  bill_discount DECIMAL(12,2) DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL,
  cost_total DECIMAL(12,2) DEFAULT 0,
  profit DECIMAL(12,2) DEFAULT 0,
  payment_method VARCHAR(20) NOT NULL DEFAULT 'cash',
  -- Methods: 'cash', 'card', 'mixed'
  cash_tendered DECIMAL(12,2) DEFAULT 0,
  card_amount DECIMAL(12,2) DEFAULT 0,
  change_amount DECIMAL(12,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'completed',
  -- Status: 'completed', 'voided', 'refunded', 'held'
  void_reason TEXT,
  notes TEXT,
  customer_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name VARCHAR(255) NOT NULL,
  barcode VARCHAR(100),
  quantity DECIMAL(12,3) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  original_price DECIMAL(12,2) NOT NULL,
  cost_price DECIMAL(12,4) NOT NULL DEFAULT 0,
  item_discount DECIMAL(12,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  subtotal DECIMAL(12,2) NOT NULL,
  promotion_id INTEGER REFERENCES promotions(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_shift ON sales(shift_id);
CREATE INDEX IF NOT EXISTS idx_sales_cashier ON sales(cashier_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);

-- ============================================================
-- SALE RETURNS
-- ============================================================

CREATE TABLE IF NOT EXISTS sale_returns (
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
);

CREATE TABLE IF NOT EXISTS sale_return_items (
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
);

CREATE INDEX IF NOT EXISTS idx_sale_returns_sale ON sale_returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_returns_shift ON sale_returns(shift_id);
CREATE INDEX IF NOT EXISTS idx_sale_return_items_ret ON sale_return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_sale_return_items_si ON sale_return_items(sale_item_id);

-- ============================================================
-- INVENTORY ADJUSTMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  adjustment_type VARCHAR(30) NOT NULL,
  -- Types: 'add', 'subtract', 'set'
  quantity DECIMAL(12,3) NOT NULL,
  quantity_before DECIMAL(12,3) NOT NULL,
  quantity_after DECIMAL(12,3) NOT NULL,
  reason VARCHAR(255),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- SEED DATA
-- ============================================================

-- Insert default roles
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
}')
ON CONFLICT (name) DO NOTHING;

-- Insert default admin user (password: admin123)
INSERT INTO users (name, email, password, role_id, pin)
SELECT 'Admin User', 'admin@retailpos.com',
  '$2a$10$3OL4r2TIxSn.3hEl7HCOR.Gj5w2ANxIbtJXU910TlLH5m1eoHFn/6',
  r.id, '1234'
FROM roles r WHERE r.name = 'admin'
ON CONFLICT (email) DO NOTHING;

-- Insert default categories
INSERT INTO categories (name, color) VALUES
('General', '#6366f1'),
('Food & Beverage', '#f59e0b'),
('Electronics', '#3b82f6'),
('Clothing', '#ec4899'),
('Health & Beauty', '#10b981'),
('Home & Office', '#8b5cf6')
ON CONFLICT DO NOTHING;
