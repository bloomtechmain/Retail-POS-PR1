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
  setup_completed: boolean;
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
}

export interface VatInvoiceCartItem {
  product_id: number;
  product_name: string;
  barcode?: string;
  sku: string;
  quantity: number;
  unit_price: number;
  original_price: number;
  cost_price: number;
  item_discount: number;
  // One or more named taxes applied to this line, each computed on the same
  // taxable (post item-discount) amount and summed — not compounded.
  taxes: Array<{ tax_rate_id?: number; name: string; rate: number }>;
}

export interface CreateVatInvoicePayload {
  cart_items: VatInvoiceCartItem[];
  bill_discount: number;
  payment_method: 'cash' | 'card' | 'mixed' | 'credit';
  cash_tendered: number;
  card_amount: number;
  customer_name?: string;
  customer_id?: number;
  buyer_vat_reg_no?: string;
  buyer_address?: string;
  buyer_phone?: string;
  delivery_date?: string;
  place_of_supply?: string;
  notes?: string;
}

export interface AuthPayload {
  id: number;
  email: string;
  role_id: number;
  role_name: string;
  permissions: Record<string, unknown>;
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
