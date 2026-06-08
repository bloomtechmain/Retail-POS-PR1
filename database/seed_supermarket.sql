-- ============================================================
-- BloomPOS — Supermarket Sample Data
-- ============================================================

-- ── Roles & Admin (idempotent) ────────────────────────────────────────────────
INSERT INTO roles (name, permissions) VALUES
('admin', '{
  "dashboard": true, "pos": true,
  "products": {"view": true, "create": true, "edit": true, "delete": true},
  "inventory": {"view": true, "adjust": true},
  "grn": {"view": true, "create": true, "edit": true},
  "promotions": {"view": true, "create": true, "edit": true, "delete": true},
  "reports": true, "shifts": true,
  "users": {"view": true, "create": true, "edit": true, "delete": true},
  "price_override": true
}'),
('manager', '{
  "dashboard": true, "pos": true,
  "products": {"view": true, "create": true, "edit": true, "delete": false},
  "inventory": {"view": true, "adjust": true},
  "grn": {"view": true, "create": true, "edit": true},
  "promotions": {"view": true, "create": true, "edit": true, "delete": false},
  "reports": true, "shifts": true,
  "users": {"view": true, "create": false, "edit": false, "delete": false},
  "price_override": true
}'),
('cashier', '{
  "dashboard": false, "pos": true,
  "products": {"view": true, "create": false, "edit": false, "delete": false},
  "inventory": {"view": false, "adjust": false},
  "grn": {"view": false, "create": false, "edit": false},
  "promotions": {"view": false, "create": false, "edit": false, "delete": false},
  "reports": false, "shifts": true,
  "users": {"view": false, "create": false, "edit": false, "delete": false},
  "price_override": false
}')
ON CONFLICT (name) DO NOTHING;

-- Admin user (password: admin123)
INSERT INTO users (name, email, password, role_id, pin)
SELECT 'Admin User', 'admin@bloompos.com',
  '$2a$10$3OL4r2TIxSn.3hEl7HCOR.Gj5w2ANxIbtJXU910TlLH5m1eoHFn/6',
  r.id, '1234'
FROM roles r WHERE r.name = 'admin'
ON CONFLICT (email) DO NOTHING;

-- Manager user (password: manager123)
INSERT INTO users (name, email, password, role_id, pin)
SELECT 'Store Manager', 'manager@bloompos.com',
  '$2a$10$XGmj8rvBFpjxv7fPTxBFRON2e.KqzK2QpY/7L9EpJGVzL43LvFSHG',
  r.id, '5678'
FROM roles r WHERE r.name = 'manager'
ON CONFLICT (email) DO NOTHING;

-- Cashier user (password: cashier123)
INSERT INTO users (name, email, password, role_id, pin)
SELECT 'Kasun Perera', 'cashier@bloompos.com',
  '$2a$10$8K1p/a0dR8gB4YgBRGMScOQ7W6N7eMSi8z7G2D6f4bFMz9vH3u6Hy',
  r.id, '0000'
FROM roles r WHERE r.name = 'cashier'
ON CONFLICT (email) DO NOTHING;

-- ── Categories ────────────────────────────────────────────────────────────────
INSERT INTO categories (name, color) VALUES
('Fresh Produce',     '#22c55e'),
('Dairy & Eggs',      '#f59e0b'),
('Bakery',            '#d97706'),
('Meat & Seafood',    '#ef4444'),
('Beverages',         '#3b82f6'),
('Snacks & Confectionery', '#a855f7'),
('Rice & Grains',     '#84cc16'),
('Cooking Essentials','#f97316'),
('Frozen Foods',      '#06b6d4'),
('Personal Care',     '#ec4899'),
('Household',         '#8b5cf6'),
('Baby Products',     '#fbbf24')
ON CONFLICT DO NOTHING;

-- ── Brands ────────────────────────────────────────────────────────────────────
INSERT INTO brands (name) VALUES
('No Brand'),
('Maliban'),
('Munchee'),
('Elephant House'),
('Nestle'),
('Unilever'),
('Fonterra'),
('Keells'),
('Cargills'),
('Prima'),
('Araliya'),
('MD'),
('Delmege'),
('Kotmale'),
('Bairaha'),
('Highland'),
('Sunlight'),
('Lifebuoy'),
('Colgate'),
('Johnson''s')
ON CONFLICT DO NOTHING;

-- ── Suppliers ─────────────────────────────────────────────────────────────────
INSERT INTO suppliers (name, contact_person, phone, email, address) VALUES
('Fresh Farm Supplies', 'Nimal Silva', '0112345678', 'fresh@farm.lk', 'Colombo 7'),
('Lanka Distributors', 'Kamal Perera', '0119876543', 'sales@lankadist.lk', 'Kandy Road, Colombo'),
('Metro Wholesale', 'Suresh Kumar', '0117654321', 'info@metro.lk', 'Pettah, Colombo 11'),
('Maliban Biscuits', 'Roshan Fernando', '0113456789', 'trade@maliban.lk', 'Ratmalana'),
('Nestle Lanka', 'Priya Jayawardena', '0112987654', 'trade@nestle.lk', 'Colombo 3')
ON CONFLICT DO NOTHING;

-- ── Products ─────────────────────────────────────────────────────────────────
-- Fresh Produce
INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Tomato (1kg)', 'SKU-TOM001', '4901234560001', c.id, b.id, 'kg', 180.00, 120.00, 120.00, 50, 10, 0, true, false
FROM categories c, brands b WHERE c.name='Fresh Produce' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Carrot (1kg)', 'SKU-CAR001', '4901234560002', c.id, b.id, 'kg', 160.00, 100.00, 100.00, 40, 10, 0, true, false
FROM categories c, brands b WHERE c.name='Fresh Produce' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Potato (1kg)', 'SKU-POT001', '4901234560003', c.id, b.id, 'kg', 200.00, 140.00, 140.00, 60, 15, 0, true, false
FROM categories c, brands b WHERE c.name='Fresh Produce' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Banana (Bunch)', 'SKU-BAN001', '4901234560004', c.id, b.id, 'pcs', 120.00, 80.00, 80.00, 30, 10, 0, true, false
FROM categories c, brands b WHERE c.name='Fresh Produce' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Cabbage (1 Head)', 'SKU-CAB001', '4901234560005', c.id, b.id, 'pcs', 90.00, 55.00, 55.00, 25, 8, 0, true, false
FROM categories c, brands b WHERE c.name='Fresh Produce' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Leeks (500g)', 'SKU-LEE001', '4901234560006', c.id, b.id, 'pcs', 75.00, 45.00, 45.00, 20, 5, 0, true, false
FROM categories c, brands b WHERE c.name='Fresh Produce' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Onion (1kg)', 'SKU-ONI001', '4901234560007', c.id, b.id, 'kg', 250.00, 180.00, 180.00, 45, 10, 0, true, false
FROM categories c, brands b WHERE c.name='Fresh Produce' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

-- Dairy & Eggs
INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Kotmale Full Cream Milk 1L', 'SKU-KML001', '4900123000101', c.id, b.id, 'pcs', 390.00, 310.00, 310.00, 48, 12, 0, true, false
FROM categories c, brands b WHERE c.name='Dairy & Eggs' AND b.name='Kotmale'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Highland Full Cream Milk 1L', 'SKU-HIG001', '4900123000102', c.id, b.id, 'pcs', 375.00, 295.00, 295.00, 36, 12, 0, true, false
FROM categories c, brands b WHERE c.name='Dairy & Eggs' AND b.name='Highland'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Eggs (Tray of 30)', 'SKU-EGG001', '4900123000103', c.id, b.id, 'pcs', 1350.00, 1050.00, 1050.00, 20, 5, 0, true, false
FROM categories c, brands b WHERE c.name='Dairy & Eggs' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Anchor Butter 200g', 'SKU-ANC001', '4900123000104', c.id, b.id, 'pcs', 680.00, 540.00, 540.00, 24, 8, 0, true, false
FROM categories c, brands b WHERE c.name='Dairy & Eggs' AND b.name='Fonterra'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Nestle Yoghurt Strawberry 80g', 'SKU-NYG001', '4900123000105', c.id, b.id, 'pcs', 95.00, 68.00, 68.00, 60, 15, 0, true, false
FROM categories c, brands b WHERE c.name='Dairy & Eggs' AND b.name='Nestle'
ON CONFLICT (sku) DO NOTHING;

-- Bakery
INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'White Bread Loaf', 'SKU-BRD001', '4900123000201', c.id, b.id, 'pcs', 120.00, 85.00, 85.00, 30, 10, 0, true, false
FROM categories c, brands b WHERE c.name='Bakery' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Maliban Marie Biscuits 200g', 'SKU-MAR001', '4900123000202', c.id, b.id, 'pcs', 155.00, 110.00, 110.00, 72, 20, 0, true, false
FROM categories c, brands b WHERE c.name='Bakery' AND b.name='Maliban'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Munchee Butter Cake 180g', 'SKU-MBC001', '4900123000203', c.id, b.id, 'pcs', 245.00, 185.00, 185.00, 36, 10, 0, true, false
FROM categories c, brands b WHERE c.name='Bakery' AND b.name='Munchee'
ON CONFLICT (sku) DO NOTHING;

-- Meat & Seafood
INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Bairaha Chicken Breast 500g', 'SKU-CHK001', '4900123000301', c.id, b.id, 'pcs', 680.00, 520.00, 520.00, 25, 8, 0, true, false
FROM categories c, brands b WHERE c.name='Meat & Seafood' AND b.name='Bairaha'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Keells Sausages 400g', 'SKU-SAU001', '4900123000302', c.id, b.id, 'pcs', 590.00, 450.00, 450.00, 30, 8, 0, true, false
FROM categories c, brands b WHERE c.name='Meat & Seafood' AND b.name='Keells'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Canned Tuna (185g)', 'SKU-TUN001', '4900123000303', c.id, b.id, 'pcs', 295.00, 215.00, 215.00, 60, 15, 0, true, false
FROM categories c, brands b WHERE c.name='Meat & Seafood' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

-- Beverages
INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Elephant House Ginger Beer 400ml', 'SKU-EHG001', '4900123000401', c.id, b.id, 'pcs', 165.00, 115.00, 115.00, 96, 24, 0, true, false
FROM categories c, brands b WHERE c.name='Beverages' AND b.name='Elephant House'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Coca Cola 1.5L', 'SKU-COK001', '4900123000402', c.id, b.id, 'pcs', 285.00, 210.00, 210.00, 48, 12, 0, true, false
FROM categories c, brands b WHERE c.name='Beverages' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Nestle Pure Life Water 1.5L', 'SKU-WAT001', '4900123000403', c.id, b.id, 'pcs', 95.00, 62.00, 62.00, 120, 30, 0, true, false
FROM categories c, brands b WHERE c.name='Beverages' AND b.name='Nestle'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Nescafe 3-in-1 (10 Sachet)', 'SKU-NES001', '4900123000404', c.id, b.id, 'pcs', 380.00, 290.00, 290.00, 60, 15, 0, true, false
FROM categories c, brands b WHERE c.name='Beverages' AND b.name='Nestle'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Orange Juice 1L', 'SKU-OJU001', '4900123000405', c.id, b.id, 'pcs', 320.00, 240.00, 240.00, 36, 10, 0, true, false
FROM categories c, brands b WHERE c.name='Beverages' AND b.name='MD'
ON CONFLICT (sku) DO NOTHING;

-- Snacks & Confectionery
INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Munchee Chocolate Chip Cookies 200g', 'SKU-CHC001', '4900123000501', c.id, b.id, 'pcs', 285.00, 210.00, 210.00, 48, 12, 0, true, false
FROM categories c, brands b WHERE c.name='Snacks & Confectionery' AND b.name='Munchee'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Maliban Cream Cracker 190g', 'SKU-MCC001', '4900123000502', c.id, b.id, 'pcs', 175.00, 125.00, 125.00, 72, 18, 0, true, false
FROM categories c, brands b WHERE c.name='Snacks & Confectionery' AND b.name='Maliban'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Lays Classic Chips 75g', 'SKU-LAY001', '4900123000503', c.id, b.id, 'pcs', 220.00, 160.00, 160.00, 60, 15, 0, true, false
FROM categories c, brands b WHERE c.name='Snacks & Confectionery' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Kit Kat 4-Finger 45g', 'SKU-KIT001', '4900123000504', c.id, b.id, 'pcs', 195.00, 140.00, 140.00, 80, 20, 0, true, false
FROM categories c, brands b WHERE c.name='Snacks & Confectionery' AND b.name='Nestle'
ON CONFLICT (sku) DO NOTHING;

-- Rice & Grains
INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Araliya Red Raw Rice 5kg', 'SKU-RIC001', '4900123000601', c.id, b.id, 'pcs', 1450.00, 1100.00, 1100.00, 40, 10, 0, true, false
FROM categories c, brands b WHERE c.name='Rice & Grains' AND b.name='Araliya'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Araliya White Basmati 1kg', 'SKU-BAS001', '4900123000602', c.id, b.id, 'pcs', 580.00, 440.00, 440.00, 30, 8, 0, true, false
FROM categories c, brands b WHERE c.name='Rice & Grains' AND b.name='Araliya'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Prima Spaghetti 400g', 'SKU-SPA001', '4900123000603', c.id, b.id, 'pcs', 285.00, 210.00, 210.00, 36, 10, 0, true, false
FROM categories c, brands b WHERE c.name='Rice & Grains' AND b.name='Prima'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Rolled Oats 500g', 'SKU-OAT001', '4900123000604', c.id, b.id, 'pcs', 350.00, 265.00, 265.00, 24, 8, 0, true, false
FROM categories c, brands b WHERE c.name='Rice & Grains' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

-- Cooking Essentials
INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Coconut Oil 1L', 'SKU-COO001', '4900123000701', c.id, b.id, 'pcs', 750.00, 580.00, 580.00, 36, 10, 0, true, false
FROM categories c, brands b WHERE c.name='Cooking Essentials' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'MD Tomato Sauce 400g', 'SKU-TOS001', '4900123000702', c.id, b.id, 'pcs', 295.00, 215.00, 215.00, 48, 12, 0, true, false
FROM categories c, brands b WHERE c.name='Cooking Essentials' AND b.name='MD'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Sugar 1kg', 'SKU-SUG001', '4900123000703', c.id, b.id, 'kg', 220.00, 165.00, 165.00, 50, 15, 0, true, false
FROM categories c, brands b WHERE c.name='Cooking Essentials' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Salt 1kg', 'SKU-SAL001', '4900123000704', c.id, b.id, 'kg', 85.00, 55.00, 55.00, 60, 15, 0, true, false
FROM categories c, brands b WHERE c.name='Cooking Essentials' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Delmege Soya Sauce 625ml', 'SKU-SOY001', '4900123000705', c.id, b.id, 'pcs', 320.00, 240.00, 240.00, 30, 8, 0, true, false
FROM categories c, brands b WHERE c.name='Cooking Essentials' AND b.name='Delmege'
ON CONFLICT (sku) DO NOTHING;

-- Frozen Foods
INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Keells Chicken Nuggets 500g', 'SKU-NUG001', '4900123000801', c.id, b.id, 'pcs', 780.00, 610.00, 610.00, 20, 6, 0, true, false
FROM categories c, brands b WHERE c.name='Frozen Foods' AND b.name='Keells'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Ice Cream Vanilla 750ml', 'SKU-ICE001', '4900123000802', c.id, b.id, 'pcs', 650.00, 490.00, 490.00, 18, 6, 0, true, false
FROM categories c, brands b WHERE c.name='Frozen Foods' AND b.name='Elephant House'
ON CONFLICT (sku) DO NOTHING;

-- Personal Care
INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Lifebuoy Soap 90g', 'SKU-LBS001', '4900123000901', c.id, b.id, 'pcs', 110.00, 75.00, 75.00, 96, 24, 0, true, false
FROM categories c, brands b WHERE c.name='Personal Care' AND b.name='Lifebuoy'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Colgate Toothpaste 150g', 'SKU-COL001', '4900123000902', c.id, b.id, 'pcs', 345.00, 265.00, 265.00, 60, 15, 0, true, false
FROM categories c, brands b WHERE c.name='Personal Care' AND b.name='Colgate'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Sunsilk Shampoo 200ml', 'SKU-SSH001', '4900123000903', c.id, b.id, 'pcs', 420.00, 320.00, 320.00, 48, 12, 0, true, false
FROM categories c, brands b WHERE c.name='Personal Care' AND b.name='Unilever'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Johnson''s Baby Powder 200g', 'SKU-JBP001', '4900123000904', c.id, b.id, 'pcs', 580.00, 440.00, 440.00, 30, 8, 0, true, false
FROM categories c, brands b WHERE c.name='Personal Care' AND b.name='Johnson''s'
ON CONFLICT (sku) DO NOTHING;

-- Household
INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Sunlight Dish Wash 500ml', 'SKU-SDW001', '4900123001001', c.id, b.id, 'pcs', 195.00, 140.00, 140.00, 60, 15, 0, true, false
FROM categories c, brands b WHERE c.name='Household' AND b.name='Sunlight'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Garbage Bags Roll (30pcs)', 'SKU-GAR001', '4900123001002', c.id, b.id, 'pcs', 285.00, 210.00, 210.00, 36, 10, 0, true, false
FROM categories c, brands b WHERE c.name='Household' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Tissue Roll (10 Pack)', 'SKU-TIS001', '4900123001003', c.id, b.id, 'pcs', 420.00, 315.00, 315.00, 40, 10, 0, true, false
FROM categories c, brands b WHERE c.name='Household' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

-- Baby Products
INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Nestle Cerelac (400g)', 'SKU-CER001', '4900123001101', c.id, b.id, 'pcs', 850.00, 660.00, 660.00, 24, 6, 0, true, false
FROM categories c, brands b WHERE c.name='Baby Products' AND b.name='Nestle'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Pampers Baby Diapers (20pcs)', 'SKU-PAM001', '4900123001102', c.id, b.id, 'pcs', 1450.00, 1120.00, 1120.00, 20, 5, 0, true, false
FROM categories c, brands b WHERE c.name='Baby Products' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

-- ── Sample Promotions ─────────────────────────────────────────────────────────
INSERT INTO promotions (name, description, type, discount_value, min_purchase_amount, applies_to, is_active, priority, start_date, end_date, created_by)
SELECT '10% Off Beverages', '10% discount on all beverages', 'percentage', 10.00, 0, 'category',
  true, 1, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
  (SELECT id FROM users WHERE email='admin@bloompos.com' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM promotions WHERE name='10% Off Beverages');

UPDATE promotions SET category_id = (SELECT id FROM categories WHERE name='Beverages')
WHERE name='10% Off Beverages' AND category_id IS NULL;

INSERT INTO promotions (name, description, type, discount_value, min_purchase_amount, applies_to, is_active, priority, start_date, end_date, created_by)
SELECT 'Weekend Flat Discount LKR 50', 'LKR 50 off on any purchase', 'fixed_amount', 50.00, 500, 'all',
  true, 2, CURRENT_DATE, CURRENT_DATE + INTERVAL '60 days',
  (SELECT id FROM users WHERE email='admin@bloompos.com' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM promotions WHERE name='Weekend Flat Discount LKR 50');

INSERT INTO promotions (name, description, type, discount_value, min_purchase_amount, applies_to, is_active, priority, start_date, end_date, created_by)
SELECT '5% Off Fresh Produce', '5% off on all fresh vegetables and fruits', 'percentage', 5.00, 0, 'category',
  true, 1, CURRENT_DATE, CURRENT_DATE + INTERVAL '14 days',
  (SELECT id FROM users WHERE email='admin@bloompos.com' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM promotions WHERE name='5% Off Fresh Produce');

UPDATE promotions SET category_id = (SELECT id FROM categories WHERE name='Fresh Produce')
WHERE name='5% Off Fresh Produce' AND category_id IS NULL;
