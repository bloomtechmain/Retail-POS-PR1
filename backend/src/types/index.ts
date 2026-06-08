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
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
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
  payment_method: 'cash' | 'card' | 'mixed';
  cash_tendered: number;
  card_amount: number;
  change_amount: number;
  status: 'completed' | 'voided' | 'refunded' | 'held';
  void_reason?: string;
  notes?: string;
  customer_name?: string;
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
  created_at: Date;
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
  payment_method: 'cash' | 'card' | 'mixed';
  cash_tendered: number;
  card_amount: number;
  customer_name?: string;
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
