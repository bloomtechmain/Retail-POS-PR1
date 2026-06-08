export interface User {
  id: number;
  name: string;
  email: string;
  role_name: string;
  permissions: Record<string, unknown>;
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
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: number;
  name: string;
  description?: string;
  color: string;
}

export interface Brand {
  id: number;
  name: string;
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
  category_id?: number;
  promotion_id?: number;
  tax_amount?: number;
  subtotal?: number;
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
  created_at: string;
  items?: SaleItem[];
}

export interface SaleItem {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  item_discount: number;
  tax_amount: number;
  subtotal: number;
}

export interface Shift {
  id: number;
  shift_number: string;
  opened_by: number;
  opened_by_name?: string;
  closed_by?: number;
  open_time: string;
  close_time?: string;
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
}

export interface Supplier {
  id: number;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface GRN {
  id: number;
  grn_number: string;
  supplier_name?: string;
  invoice_number?: string;
  received_date: string;
  total_amount: number;
  status: string;
  notes?: string;
  created_by_name?: string;
  created_at: string;
  items?: GRNItem[];
}

export interface GRNItem {
  id?: number;
  product_id: number;
  product_name?: string;
  quantity: number;
  buying_price: number;
  subtotal?: number;
}

export interface Promotion {
  id: number;
  name: string;
  description?: string;
  type: 'percentage' | 'fixed_amount' | 'buy_x_get_y' | 'free_item';
  discount_value?: number;
  min_purchase_amount?: number;
  buy_quantity?: number;
  get_quantity?: number;
  applies_to: 'all' | 'category' | 'product';
  category_id?: number;
  category_name?: string;
  product_id?: number;
  product_name?: string;
  start_date?: string;
  end_date?: string;
  is_active: boolean;
  priority: number;
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

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}
