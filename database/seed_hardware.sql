-- ============================================================
-- RetailPOS — Hardware Store Sample Data
-- ============================================================
-- Run after schema.sql:
--   psql -U postgres -d retail_pos -f database/seed_hardware.sql
-- Safe to re-run — all inserts are idempotent (ON CONFLICT / guarded).

-- ── Roles & Users (idempotent) ──────────────────────────────────────────────
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

-- Admin user (password: admin123) — matches the default schema.sql admin, skipped if it already exists
INSERT INTO users (name, email, password, role_id, pin)
SELECT 'Admin User', 'admin@retailpos.com',
  '$2a$10$QAEPcYfxO6XBdk63cV.N4uFEJHHP6yqDagf2OZmkND2Oz6QQAk5sO',
  r.id, '1234'
FROM roles r WHERE r.name = 'admin'
ON CONFLICT (email) DO NOTHING;

-- Store Manager (password: manager123)
INSERT INTO users (name, email, password, role_id, pin)
SELECT 'Ruwan Jayasuriya', 'manager@retailpos.com',
  '$2a$10$4D018s4Hyc7wVgjTp0e4IuGU/pTT71NiroQXDho2LgAKW4lxekvzO',
  r.id, '5678'
FROM roles r WHERE r.name = 'manager'
ON CONFLICT (email) DO NOTHING;

-- Counter Cashier (password: cashier123)
INSERT INTO users (name, email, password, role_id, pin)
SELECT 'Nadeeka Bandara', 'cashier@retailpos.com',
  '$2a$10$qNcGxpduHeatVXWV1p0X9eGsSy4c3cF.MiF/n2MXEy8/bsf0xE3s.',
  r.id, '0000'
FROM roles r WHERE r.name = 'cashier'
ON CONFLICT (email) DO NOTHING;

-- ── Categories ────────────────────────────────────────────────────────────────
INSERT INTO categories (name, color) VALUES
('Hand Tools',            '#f59e0b'),
('Power Tools',           '#ef4444'),
('Plumbing',               '#3b82f6'),
('Electrical',             '#eab308'),
('Fasteners & Hardware',   '#64748b'),
('Paint & Supplies',       '#a855f7'),
('Building Materials',     '#78716c'),
('Safety Equipment',       '#f97316'),
('Garden & Outdoor',       '#22c55e'),
('Adhesives & Sealants',   '#06b6d4')
ON CONFLICT DO NOTHING;

-- ── Brands ────────────────────────────────────────────────────────────────────
INSERT INTO brands (name) VALUES
('No Brand'),
('Bosch'),
('DeWalt'),
('Makita'),
('Stanley'),
('Black+Decker'),
('Irwin'),
('3M'),
('Gorilla'),
('Total'),
('Ingco'),
('Tolsen'),
('Hilti'),
('Dulux'),
('Supra')
ON CONFLICT DO NOTHING;

-- ── Suppliers ─────────────────────────────────────────────────────────────────
INSERT INTO suppliers (name, contact_person, phone, email, address) VALUES
('BuildMart Distributors',        'Ranil Fernando',   '0112234455', 'sales@buildmart.lk',    'Colombo 10'),
('National Tool Supplies',        'Chamara Silva',     '0117788990', 'info@natltools.lk',     'Kandy'),
('SafeGuard Industrial Supplies', 'Dilani Perera',     '0113344556', 'orders@safeguard.lk',   'Ja-Ela'),
('ProPaint Distributors',         'Kavindu Jayasuriya','0114455667', 'trade@propaint.lk',     'Kelaniya'),
('Steel & Cement Wholesale',      'Nadeeka Bandara',   '0115566778', 'sales@steelcement.lk',  'Kaduwela')
ON CONFLICT DO NOTHING;

-- ── Products ─────────────────────────────────────────────────────────────────

-- Hand Tools
INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Claw Hammer 16oz', 'SKU-HAM001', '4900124000001', c.id, b.id, 'pcs', 1450.00, 1050.00, 1050.00, 40, 10, 0, true, false
FROM categories c, brands b WHERE c.name='Hand Tools' AND b.name='Stanley'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Adjustable Wrench 10"', 'SKU-WRE001', '4900124000002', c.id, b.id, 'pcs', 1850.00, 1350.00, 1350.00, 30, 8, 0, true, false
FROM categories c, brands b WHERE c.name='Hand Tools' AND b.name='Irwin'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Screwdriver Set (6pc)', 'SKU-SCR001', '4900124000003', c.id, b.id, 'pcs', 950.00, 650.00, 650.00, 45, 12, 0, true, false
FROM categories c, brands b WHERE c.name='Hand Tools' AND b.name='Tolsen'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Measuring Tape 5m', 'SKU-TAP001', '4900124000004', c.id, b.id, 'pcs', 450.00, 280.00, 280.00, 60, 15, 0, true, false
FROM categories c, brands b WHERE c.name='Hand Tools' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Utility Knife', 'SKU-UTK001', '4900124000005', c.id, b.id, 'pcs', 380.00, 240.00, 240.00, 70, 20, 0, true, false
FROM categories c, brands b WHERE c.name='Hand Tools' AND b.name='Stanley'
ON CONFLICT (sku) DO NOTHING;

-- Power Tools
INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Impact Drill GSB 13RE', 'SKU-DRL001', '4900124000101', c.id, b.id, 'pcs', 18500.00, 14200.00, 14200.00, 12, 3, 0, true, false
FROM categories c, brands b WHERE c.name='Power Tools' AND b.name='Bosch'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Angle Grinder 4"', 'SKU-GRN001', '4900124000102', c.id, b.id, 'pcs', 15900.00, 12100.00, 12100.00, 15, 4, 0, true, false
FROM categories c, brands b WHERE c.name='Power Tools' AND b.name='DeWalt'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Circular Saw 7"', 'SKU-SAW001', '4900124000103', c.id, b.id, 'pcs', 22500.00, 17800.00, 17800.00, 8, 2, 0, true, false
FROM categories c, brands b WHERE c.name='Power Tools' AND b.name='Makita'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Jigsaw', 'SKU-JIG001', '4900124000104', c.id, b.id, 'pcs', 12800.00, 9600.00, 9600.00, 10, 3, 0, true, false
FROM categories c, brands b WHERE c.name='Power Tools' AND b.name='Black+Decker'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Cordless Screwdriver', 'SKU-CSD001', '4900124000105', c.id, b.id, 'pcs', 9500.00, 7200.00, 7200.00, 18, 5, 0, true, false
FROM categories c, brands b WHERE c.name='Power Tools' AND b.name='Bosch'
ON CONFLICT (sku) DO NOTHING;

-- Plumbing
INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'PVC Pipe 1" (3m length)', 'SKU-PVC001', '4900124000201', c.id, b.id, 'pcs', 650.00, 450.00, 450.00, 80, 20, 0, true, false
FROM categories c, brands b WHERE c.name='Plumbing' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Ball Valve 1/2"', 'SKU-VAL001', '4900124000202', c.id, b.id, 'pcs', 480.00, 320.00, 320.00, 55, 15, 0, true, false
FROM categories c, brands b WHERE c.name='Plumbing' AND b.name='Supra'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Pipe Wrench 14"', 'SKU-PWR001', '4900124000203', c.id, b.id, 'pcs', 1650.00, 1150.00, 1150.00, 25, 6, 0, true, false
FROM categories c, brands b WHERE c.name='Plumbing' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Teflon Tape (10pcs pack)', 'SKU-TEF001', '4900124000204', c.id, b.id, 'pcs', 250.00, 150.00, 150.00, 100, 25, 0, true, false
FROM categories c, brands b WHERE c.name='Plumbing' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Bib Tap', 'SKU-TAP002', '4900124000205', c.id, b.id, 'pcs', 890.00, 620.00, 620.00, 40, 10, 0, true, false
FROM categories c, brands b WHERE c.name='Plumbing' AND b.name='Supra'
ON CONFLICT (sku) DO NOTHING;

-- Electrical
INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Electrical Wire 1.5mm (100m roll)', 'SKU-WIR001', '4900124000301', c.id, b.id, 'pcs', 8500.00, 6800.00, 6800.00, 20, 5, 0, true, false
FROM categories c, brands b WHERE c.name='Electrical' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Circuit Breaker MCB 20A', 'SKU-MCB001', '4900124000302', c.id, b.id, 'pcs', 650.00, 450.00, 450.00, 50, 12, 0, true, false
FROM categories c, brands b WHERE c.name='Electrical' AND b.name='Total'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Switch Socket Combo', 'SKU-SSC001', '4900124000303', c.id, b.id, 'pcs', 320.00, 210.00, 210.00, 90, 20, 0, true, false
FROM categories c, brands b WHERE c.name='Electrical' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Electrical Tape', 'SKU-ETP001', '4900124000304', c.id, b.id, 'pcs', 180.00, 110.00, 110.00, 120, 30, 0, true, false
FROM categories c, brands b WHERE c.name='Electrical' AND b.name='3M'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'LED Bulb 9W', 'SKU-LED001', '4900124000305', c.id, b.id, 'pcs', 350.00, 220.00, 220.00, 100, 25, 0, true, false
FROM categories c, brands b WHERE c.name='Electrical' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

-- Fasteners & Hardware
INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Wood Screws 1" (Box of 100)', 'SKU-WSC001', '4900124000401', c.id, b.id, 'pcs', 320.00, 200.00, 200.00, 70, 15, 0, true, false
FROM categories c, brands b WHERE c.name='Fasteners & Hardware' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Machine Bolts M8 (Box of 50)', 'SKU-BLT001', '4900124000402', c.id, b.id, 'pcs', 580.00, 400.00, 400.00, 55, 12, 0, true, false
FROM categories c, brands b WHERE c.name='Fasteners & Hardware' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Concrete Nails 3" (1kg)', 'SKU-NAI001', '4900124000403', c.id, b.id, 'kg', 450.00, 320.00, 320.00, 60, 15, 0, true, false
FROM categories c, brands b WHERE c.name='Fasteners & Hardware' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Door Hinges 4" (pair)', 'SKU-HIN001', '4900124000404', c.id, b.id, 'pcs', 380.00, 260.00, 260.00, 45, 10, 0, true, false
FROM categories c, brands b WHERE c.name='Fasteners & Hardware' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Padlock 50mm', 'SKU-LCK001', '4900124000405', c.id, b.id, 'pcs', 650.00, 440.00, 440.00, 40, 10, 0, true, false
FROM categories c, brands b WHERE c.name='Fasteners & Hardware' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

-- Paint & Supplies
INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Weathershield Paint 4L White', 'SKU-PNT001', '4900124000501', c.id, b.id, 'pcs', 6800.00, 5200.00, 5200.00, 20, 5, 0, true, false
FROM categories c, brands b WHERE c.name='Paint & Supplies' AND b.name='Dulux'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Paint Roller Set', 'SKU-ROL001', '4900124000502', c.id, b.id, 'pcs', 480.00, 320.00, 320.00, 50, 12, 0, true, false
FROM categories c, brands b WHERE c.name='Paint & Supplies' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Paint Brush 2"', 'SKU-BRU001', '4900124000503', c.id, b.id, 'pcs', 220.00, 140.00, 140.00, 80, 20, 0, true, false
FROM categories c, brands b WHERE c.name='Paint & Supplies' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Primer 1L', 'SKU-PRI001', '4900124000504', c.id, b.id, 'pcs', 1450.00, 1050.00, 1050.00, 30, 8, 0, true, false
FROM categories c, brands b WHERE c.name='Paint & Supplies' AND b.name='Dulux'
ON CONFLICT (sku) DO NOTHING;

-- Building Materials
INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Cement Bag 50kg', 'SKU-CEM001', '4900124000601', c.id, b.id, 'pcs', 2200.00, 1850.00, 1850.00, 100, 25, 0, true, true
FROM categories c, brands b WHERE c.name='Building Materials' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Sand (per bag)', 'SKU-SND001', '4900124000602', c.id, b.id, 'pcs', 850.00, 650.00, 650.00, 60, 15, 0, true, true
FROM categories c, brands b WHERE c.name='Building Materials' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Plywood Sheet 4x8 18mm', 'SKU-PLY001', '4900124000603', c.id, b.id, 'pcs', 8500.00, 6900.00, 6900.00, 25, 6, 0, true, false
FROM categories c, brands b WHERE c.name='Building Materials' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Steel Rod 10mm (per length)', 'SKU-STL001', '4900124000604', c.id, b.id, 'pcs', 1650.00, 1300.00, 1300.00, 80, 20, 0, true, true
FROM categories c, brands b WHERE c.name='Building Materials' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

-- Safety Equipment
INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Safety Goggles', 'SKU-GOG001', '4900124000701', c.id, b.id, 'pcs', 650.00, 420.00, 420.00, 50, 12, 0, true, false
FROM categories c, brands b WHERE c.name='Safety Equipment' AND b.name='3M'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Work Gloves (pair)', 'SKU-GLV001', '4900124000702', c.id, b.id, 'pcs', 350.00, 220.00, 220.00, 90, 20, 0, true, false
FROM categories c, brands b WHERE c.name='Safety Equipment' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Dust Mask (Box of 10)', 'SKU-MSK001', '4900124000703', c.id, b.id, 'pcs', 950.00, 680.00, 680.00, 40, 10, 0, true, false
FROM categories c, brands b WHERE c.name='Safety Equipment' AND b.name='3M'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Safety Helmet', 'SKU-HEL001', '4900124000704', c.id, b.id, 'pcs', 1250.00, 850.00, 850.00, 30, 8, 0, true, false
FROM categories c, brands b WHERE c.name='Safety Equipment' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

-- Garden & Outdoor
INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Garden Hose 15m', 'SKU-HOS001', '4900124000801', c.id, b.id, 'pcs', 2450.00, 1800.00, 1800.00, 25, 6, 0, true, false
FROM categories c, brands b WHERE c.name='Garden & Outdoor' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Pruning Shears', 'SKU-PRU001', '4900124000802', c.id, b.id, 'pcs', 890.00, 620.00, 620.00, 35, 8, 0, true, false
FROM categories c, brands b WHERE c.name='Garden & Outdoor' AND b.name='Ingco'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Wheelbarrow', 'SKU-WHB001', '4900124000803', c.id, b.id, 'pcs', 8900.00, 6900.00, 6900.00, 10, 3, 0, true, false
FROM categories c, brands b WHERE c.name='Garden & Outdoor' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Garden Spade', 'SKU-SPD001', '4900124000804', c.id, b.id, 'pcs', 1250.00, 850.00, 850.00, 30, 8, 0, true, false
FROM categories c, brands b WHERE c.name='Garden & Outdoor' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

-- Adhesives & Sealants
INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Gorilla Glue 60g', 'SKU-GLU001', '4900124000901', c.id, b.id, 'pcs', 890.00, 620.00, 620.00, 45, 10, 0, true, false
FROM categories c, brands b WHERE c.name='Adhesives & Sealants' AND b.name='Gorilla'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Silicone Sealant 300ml', 'SKU-SIL001', '4900124000902', c.id, b.id, 'pcs', 650.00, 420.00, 420.00, 55, 12, 0, true, false
FROM categories c, brands b WHERE c.name='Adhesives & Sealants' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Epoxy Resin Kit', 'SKU-EPX001', '4900124000903', c.id, b.id, 'pcs', 1450.00, 1050.00, 1050.00, 20, 5, 0, true, false
FROM categories c, brands b WHERE c.name='Adhesives & Sealants' AND b.name='No Brand'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_type, selling_price, cost_price, avg_cost, current_stock, low_stock_level, tax_rate, is_active, allow_negative_stock)
SELECT 'Double Sided Tape', 'SKU-DST001', '4900124000904', c.id, b.id, 'pcs', 380.00, 240.00, 240.00, 70, 15, 0, true, false
FROM categories c, brands b WHERE c.name='Adhesives & Sealants' AND b.name='3M'
ON CONFLICT (sku) DO NOTHING;

-- ── Sample Promotions ─────────────────────────────────────────────────────────
INSERT INTO promotions (name, description, type, discount_value, min_purchase_amount, applies_to, is_active, priority, start_date, end_date, created_by)
SELECT '10% Off Power Tools', '10% discount on all power tools', 'percentage', 10.00, 0, 'category',
  true, 1, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
  (SELECT id FROM users WHERE email='admin@retailpos.com' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM promotions WHERE name='10% Off Power Tools');

UPDATE promotions SET category_id = (SELECT id FROM categories WHERE name='Power Tools')
WHERE name='10% Off Power Tools' AND category_id IS NULL;

INSERT INTO promotions (name, description, type, discount_value, min_purchase_amount, applies_to, is_active, priority, start_date, end_date, created_by)
SELECT 'Safety Gear Bundle — Flat LKR 100 Off', 'LKR 100 off orders over LKR 1000', 'fixed_amount', 100.00, 1000, 'all',
  true, 2, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
  (SELECT id FROM users WHERE email='admin@retailpos.com' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM promotions WHERE name='Safety Gear Bundle — Flat LKR 100 Off');

INSERT INTO promotions (name, description, type, discount_value, min_purchase_amount, applies_to, is_active, priority, start_date, end_date, created_by)
SELECT '5% Off Paint & Supplies', '5% off all paint and painting supplies', 'percentage', 5.00, 0, 'category',
  true, 1, CURRENT_DATE, CURRENT_DATE + INTERVAL '14 days',
  (SELECT id FROM users WHERE email='admin@retailpos.com' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM promotions WHERE name='5% Off Paint & Supplies');

UPDATE promotions SET category_id = (SELECT id FROM categories WHERE name='Paint & Supplies')
WHERE name='5% Off Paint & Supplies' AND category_id IS NULL;

-- ── Sample Credit Customers (contractor accounts) ───────────────────────────
-- Requires the customers table (see database/schema.sql). Hardware stores commonly
-- extend credit to contractors who settle their account monthly or per project.
INSERT INTO customers (name, phone, email, address, credit_limit, notes) VALUES
  ('Silva Construction (Pvt) Ltd', '0771234567', 'accounts@silvaconstruction.lk', '45 Industrial Rd, Kaduwela', 50000.00, 'Monthly contractor account, net 30'),
  ('Perera Builders',               '0779876543', 'perera.builders@gmail.com',    '12 Temple Rd, Malabe',       25000.00, 'Pays on project completion'),
  ('City Renovations',              '0765554433', NULL,                           NULL,                          15000.00, NULL)
ON CONFLICT DO NOTHING;
