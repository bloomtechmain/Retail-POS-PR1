-- ============================================================
-- SAMPLE SEED DATA FOR TESTING
-- ============================================================
-- Run after schema.sql

-- Sample Brands
INSERT INTO brands (name) VALUES
  ('Generic'), ('Samsung'), ('Apple'), ('LG'), ('Sony')
ON CONFLICT DO NOTHING;

-- Sample Suppliers
INSERT INTO suppliers (name, contact_person, phone, email) VALUES
  ('ABC Distributors', 'John Smith', '+1-555-0101', 'john@abcdist.com'),
  ('Metro Wholesale', 'Sarah Lee', '+1-555-0102', 'sarah@metro.com'),
  ('Fresh Supplies Co.', 'Mike Wong', '+1-555-0103', 'mike@fresh.com')
ON CONFLICT DO NOTHING;

-- Sample Products
INSERT INTO products (name, barcode, sku, selling_price, cost_price, avg_cost, category_id, unit_type, current_stock, low_stock_level, tax_rate)
SELECT
  'Mineral Water 500ml', '8850999000017', 'BEV-001', 1.50, 0.80, 0.80,
  c.id, 'piece', 100, 20, 0
FROM categories c WHERE c.name = 'Food & Beverage'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, barcode, sku, selling_price, cost_price, avg_cost, category_id, unit_type, current_stock, low_stock_level, tax_rate)
SELECT
  'Coca-Cola 330ml', '5449000000996', 'BEV-002', 2.00, 1.10, 1.10,
  c.id, 'piece', 50, 10, 0
FROM categories c WHERE c.name = 'Food & Beverage'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, barcode, sku, selling_price, cost_price, avg_cost, category_id, unit_type, current_stock, low_stock_level, tax_rate)
SELECT
  'Bread Loaf', '1234567890123', 'FOOD-001', 3.50, 1.80, 1.80,
  c.id, 'piece', 30, 5, 0
FROM categories c WHERE c.name = 'Food & Beverage'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, barcode, sku, selling_price, cost_price, avg_cost, category_id, unit_type, current_stock, low_stock_level, tax_rate)
SELECT
  'USB-C Cable 1m', '9876543210123', 'ELEC-001', 15.99, 6.00, 6.00,
  c.id, 'piece', 25, 5, 7
FROM categories c WHERE c.name = 'Electronics'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, barcode, sku, selling_price, cost_price, avg_cost, category_id, unit_type, current_stock, low_stock_level, tax_rate)
SELECT
  'Phone Screen Protector', '1111111111111', 'ELEC-002', 8.99, 2.50, 2.50,
  c.id, 'piece', 40, 10, 7
FROM categories c WHERE c.name = 'Electronics'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, barcode, sku, selling_price, cost_price, avg_cost, category_id, unit_type, current_stock, low_stock_level, tax_rate)
SELECT
  'Rice 1kg', '2222222222222', 'FOOD-002', 2.50, 1.20, 1.20,
  c.id, 'kg', 200, 50, 0
FROM categories c WHERE c.name = 'Food & Beverage'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, sku, selling_price, cost_price, avg_cost, category_id, unit_type, current_stock, low_stock_level)
SELECT
  'T-Shirt Basic', 'CLOTH-001', 12.99, 5.00, 5.00,
  c.id, 'piece', 50, 10
FROM categories c WHERE c.name = 'Clothing'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (name, barcode, sku, selling_price, cost_price, avg_cost, category_id, unit_type, current_stock, low_stock_level)
SELECT
  'Shampoo 400ml', '3333333333333', 'HEALTH-001', 6.99, 3.00, 3.00,
  c.id, 'piece', 35, 8
FROM categories c WHERE c.name = 'Health & Beauty'
ON CONFLICT (sku) DO NOTHING;
