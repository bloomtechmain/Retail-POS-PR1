export interface User {
  id: number;
  name: string;
  email: string;
  password?: string;
  role_id: number;
  role_name?: string;
  permissions?: Record<string, unknown>;
  pin?: string;
  is_active: boolean;
  last_login?: Date;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

export interface Role {
  id: number;
  name: string;
  permissions: Record<string, unknown>;
  created_at: Date;
}

export interface Category {
  id: number;
  name: string;
  description?: string;
  color: string;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

export interface Brand {
  id: number;
  name: string;
  description?: string;
  created_at: Date;
  deleted_at?: Date;
}

export interface Settings {
  id: number;
  business_name: string;
  business_type: string;
  logo_data_url?: string;
  address?: string;
  phone?: string;
  email?: string;
  currency_code: string;
  currency_symbol: string;
  vat_registration_number?: string;
  plan_key: string;
  setup_completed: boolean;
  restaurant_mode_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface TaxRate {
  id: number;
  name: string;
  rate: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Product {
  id: number;
  name: string;
  name_en?: string;
  barcode?: string;
  sku: string;
  description?: string;
  selling_price: number;
  cost_price: number;
  avg_cost: number;
  category_id?: number;
  category_name?: string;
  brand_id?: number;
  brand_name?: string;
  station_id?: number;
  station_name?: string;
  unit_type: string;
  current_stock: number;
  low_stock_level: number;
  tax_rate: number;
  image_url?: string;
  is_active: boolean;
  allow_negative_stock: boolean;
  costing_method?: 'weighted_average' | 'fifo' | null;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

export interface ProductBatch {
  id: number;
  product_id: number;
  grn_item_id?: number;
  batch_number: string;
  quantity_received: number;
  quantity_remaining: number;
  unit_cost: number;
  expiry_date?: Date;
  received_date: Date;
  created_at: Date;
}

export interface Supplier {
  id: number;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

export interface GRN {
  id: number;
  grn_number: string;
  supplier_id?: number;
  supplier_name?: string;
  invoice_number?: string;
  received_date: string;
  total_amount: number;
  status: string;
  notes?: string;
  created_by: number;
  created_by_name?: string;
  created_at: Date;
  updated_at: Date;
  items?: GRNItem[];
}

export interface GRNItem {
  id: number;
  grn_id: number;
  product_id: number;
  product_name?: string;
  quantity: number;
  buying_price: number;
  subtotal: number;
  created_at: Date;
}

export interface StockMovement {
  id: number;
  product_id: number;
  product_name?: string;
  movement_type: string;
  quantity: number;
  balance_before: number;
  balance_after: number;
  unit_cost?: number;
  reference_type?: string;
  reference_id?: number;
  notes?: string;
  created_by?: number;
  created_by_name?: string;
  created_at: Date;
}

export interface Shift {
  id: number;
  shift_number: string;
  opened_by: number;
  opened_by_name?: string;
  closed_by?: number;
  closed_by_name?: string;
  open_time: Date;
  close_time?: Date;
  opening_cash: number;
  expected_cash?: number;
  actual_cash?: number;
  cash_difference?: number;
  total_sales: number;
  total_cash_sales: number;
  total_card_sales: number;
  total_transactions: number;
  status: 'open' | 'closed';
  notes?: string;
  created_at: Date;
}

export interface Promotion {
  id: number;
  name: string;
  description?: string;
  type: 'percentage' | 'fixed_amount' | 'buy_x_get_y' | 'free_item';
  discount_value?: number;
  min_purchase_amount?: number;
  min_purchase_qty?: number;
  buy_quantity?: number;
  get_quantity?: number;
  get_product_id?: number;
  applies_to: 'all' | 'category' | 'product';
  category_id?: number;
  category_name?: string;
  product_id?: number;
  product_name?: string;
  start_date?: string;
  end_date?: string;
  is_active: boolean;
  priority: number;
  created_by?: number;
  created_at: Date;
  updated_at: Date;
}

export interface Terminal {
  id: number;
  fingerprint: string;
  name?: string;
  last_seen_at: Date;
  created_at: Date;
}

export interface KitchenStation {
  id: number;
  name: string;
  is_active: boolean;
  created_at: Date;
}

export interface DiningTable {
  id: number;
  name: string;
  capacity?: number;
  status: 'available' | 'occupied' | 'reserved';
  created_at: Date;
  updated_at: Date;
}

export interface Coupon {
  id: number;
  code: string;
  type: 'percent' | 'fixed';
  discount_value: number;
  min_purchase_amount?: number;
  max_uses?: number;
  uses_count: number;
  max_uses_per_customer?: number;
  start_date?: string;
  end_date?: string;
  is_active: boolean;
  created_by?: number;
  created_at: Date;
  updated_at: Date;
}

export interface Customer {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  credit_limit?: number | null;
  current_balance: number;
  notes?: string;
  is_active: boolean;
  is_vat_customer: boolean;
  vat_reg_no?: string;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

export interface CustomerPayment {
  id: number;
  customer_id: number;
  amount: number;
  payment_method: 'cash' | 'card';
  notes?: string;
  received_by?: number;
  received_by_name?: string;
  created_at: Date;
}

export interface Sale {
  id: number;
  sale_number: string;
  shift_id: number;
  cashier_id: number;
  cashier_name?: string;
  subtotal: number;
  item_discount: number;
  bill_discount: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  cost_total: number;
  profit: number;
  payment_method: 'cash' | 'card' | 'mixed' | 'credit';
  cash_tendered: number;
  card_amount: number;
  change_amount: number;
  status: 'completed' | 'voided' | 'refunded' | 'held';
  void_reason?: string;
  notes?: string;
  customer_name?: string;
  customer_id?: number;
  coupon_id?: number;
  coupon_discount?: number;
  table_id?: number;
  order_type: 'retail' | 'dine_in' | 'takeaway' | 'delivery';
  kot_printed_at?: Date;
  is_vat_invoice?: boolean;
  vat_invoice_number?: string;
  buyer_vat_reg_no?: string;
  buyer_address?: string;
  buyer_phone?: string;
  delivery_date?: string;
  place_of_supply?: string;
  created_at: Date;
  updated_at: Date;
  items?: SaleItem[];
}

export interface SaleItem {
  id: number;
  sale_id: number;
  product_id: number;
  product_name: string;
  barcode?: string;
  quantity: number;
  unit_price: number;
  original_price: number;
  cost_price: number;
  item_discount: number;
  tax_rate: number;
  tax_amount: number;
  subtotal: number;
  promotion_id?: number;
  already_returned?: number;
  created_at: Date;
  taxes?: SaleItemTax[];
}

export interface SaleItemTax {
  id: number;
  sale_item_id: number;
  tax_rate_id?: number;
  tax_name: string;
  tax_rate: number;
  tax_amount: number;
}

export interface SaleReturn {
  id: number;
  return_number: string;
  sale_id: number;
  shift_id: number;
  processed_by: number;
  return_reason?: string;
  refund_method: 'cash' | 'card' | 'store_credit';
  total_refund_amount: number;
  notes?: string;
  created_at: Date;
  items?: SaleReturnItem[];
}

export interface SaleReturnItem {
  id: number;
  return_id: number;
  sale_item_id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  refund_subtotal: number;
}

export interface ReturnSaleItemsPayload {
  items: Array<{ sale_item_id: number; quantity: number }>;
  return_reason?: string;
  refund_method: 'cash' | 'card' | 'store_credit';
  notes?: string;
}

export interface CartItem {
  product_id: number;
  product_name: string;
  barcode?: string;
  sku: string;
  quantity: number;
  unit_price: number;
  original_price: number;
  cost_price: number;
  item_discount: number;
  tax_rate: number;
  promotion_id?: number;
}

export interface CreateSalePayload {
  cart_items: CartItem[];
  bill_discount: number;
  payment_method: 'cash' | 'card' | 'mixed' | 'credit';
  cash_tendered: number;
  card_amount: number;
  customer_name?: string;
  customer_id?: number;
  notes?: string;
  coupon_code?: string;
  table_id?: number;
  order_type?: 'retail' | 'dine_in' | 'takeaway' | 'delivery';
  is_vat_invoice?: boolean;
}

export interface CreateHeldSalePayload {
  cart_items: CartItem[];
  // 'retail' covers a plain "hold this bill, start a new one" on a normal
  // POS till — unlike dine_in/takeaway/delivery it needs no restaurant_mode
  // feature (see the inline check in createHeldSale).
  order_type: 'retail' | 'dine_in' | 'takeaway' | 'delivery';
  table_id?: number;
  customer_name?: string;
  customer_id?: number;
  notes?: string;
}

export interface CompleteHeldSalePayload {
  payment_method: 'cash' | 'card' | 'mixed' | 'credit';
  cash_tendered: number;
  card_amount: number;
  bill_discount?: number;
  coupon_code?: string;
  customer_name?: string;
  customer_id?: number;
  notes?: string;
  is_vat_invoice?: boolean;
}

// A VAT invoice is generated FROM an existing completed sale (marked
// is_vat_invoice at checkout — see CreateSalePayload/CompleteHeldSalePayload)
// — this is the "generate" step: assign named tax(es) per item (for the
// printed breakdown) and record buyer details, then allocate the invoice
// number. It does not re-charge or change what the customer already paid.
export interface GenerateVatInvoicePayload {
  customer_id?: number;
  customer_name?: string;
  buyer_vat_reg_no?: string;
  buyer_address?: string;
  buyer_phone?: string;
  delivery_date?: string;
  place_of_supply?: string;
  tax_mode: 'uniform' | 'per_item';
  // Applied to every sale_item when tax_mode='uniform'.
  uniform_tax_ids?: number[];
  // One entry per sale_item when tax_mode='per_item'; items with no entry
  // (or an empty tax_ids array) get no tax applied.
  item_taxes?: Array<{ sale_item_id: number; tax_ids: number[] }>;
}

export interface AuthPayload {
  id: number;
  email: string;
  role_id: number;
  role_name: string;
  permissions: Record<string, unknown>;
  // Absent for the Electron desktop app, whose local database is a single
  // flat schema with no `tenants` table at all — present only for the
  // hosted multi-tenant backend.
  tenant_id?: number;
  schema_name?: string;
  // Set via POST /auth/sandbox, never at login. When true, requests run
  // against a sibling "<schema_name>_sandbox" schema (or the fixed schema
  // "sandbox" for Electron, which has no schema_name at all) instead of
  // the real one — see middleware/auth.ts's effective-schema computation.
  sandbox?: boolean;
  // Added automatically by jsonwebtoken's sign()/verify() — declared here so
  // token-revocation checks can read them without an unsafe cast.
  iat?: number;
  exp?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DashboardStats {
  today_revenue: number;
  today_profit: number;
  today_transactions: number;
  today_items_sold: number;
  month_revenue: number;
  month_profit: number;
  week_revenue: number;
  low_stock_count: number;
  open_shift: Shift | null;
  top_products: Array<{ product_name: string; qty_sold: number; revenue: number }>;
  revenue_trend: Array<{ date: string; revenue: number; profit: number }>;
}
