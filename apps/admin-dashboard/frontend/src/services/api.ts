import axios, { AxiosError } from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('staff_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('staff_token');
      localStorage.removeItem('staff_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export interface StaffUser {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'agent';
}

export interface Plan {
  key: string;
  name: string;
  tagline: string;
  max_users: number | null;
  features: string[];
}

export interface PlatformCustomer {
  id: number;
  agent_id: number;
  agent_name?: string;
  agent_email?: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  delivery_type: 'online' | 'offline';
  plan_key: string;
  custom_features: string[] | null;
  tenant_id: number | null;
  license_key: string | null;
  notes: string | null;
  created_at: string;
  subscription_end_date: string;
  last_payment_at: string | null;
  days_remaining: number;
  is_expired: boolean;
  is_active: boolean;
}

export interface Agent {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'agent';
  is_active: boolean;
  created_at: string;
}

export const login = async (email: string, password: string) => {
  const res = await api.post('/staff/login', { email, password });
  return res.data as { token: string; staff: StaffUser };
};

export const fetchPlans = async (): Promise<Plan[]> => {
  const res = await api.get('/settings/plans');
  return res.data.data;
};

export interface CreateCustomerInput {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  deliveryType: 'online' | 'offline';
  planKey: string;
  customFeatures?: string[];
  adminEmail: string;
  adminPassword: string;
  notes?: string;
}

export const createCustomer = async (input: CreateCustomerInput): Promise<PlatformCustomer & { adminEmail: string; adminPassword: string }> => {
  const res = await api.post('/staff/customers', input);
  return res.data.data;
};

export const listCustomers = async (): Promise<PlatformCustomer[]> => {
  const res = await api.get('/staff/customers');
  return res.data.data;
};

export const fetchCustomer = async (id: number): Promise<PlatformCustomer> => {
  const res = await api.get(`/staff/customers/${id}`);
  return res.data.data;
};

export const reactivateCustomer = async (id: number): Promise<PlatformCustomer> => {
  const res = await api.post(`/staff/customers/${id}/reactivate`);
  return res.data.data;
};

export const updateCustomerFeatures = async (id: number, customFeatures: string[] | null): Promise<PlatformCustomer> => {
  const res = await api.patch(`/staff/customers/${id}/features`, { customFeatures });
  return res.data.data;
};

export const setCustomerActive = async (id: number, isActive: boolean): Promise<PlatformCustomer> => {
  const res = await api.patch(`/staff/customers/${id}/status`, { is_active: isActive });
  return res.data.data;
};

export const deleteCustomerPermanently = async (id: number): Promise<void> => {
  await api.delete(`/staff/customers/${id}`);
};

export const listAgents = async (): Promise<Agent[]> => {
  const res = await api.get('/staff/agents');
  return res.data.data;
};

export const createAgent = async (input: { name: string; email: string; password: string }): Promise<Agent> => {
  const res = await api.post('/staff/agents', input);
  return res.data.data;
};

export const setAgentActive = async (id: number, isActive: boolean): Promise<Agent> => {
  const res = await api.patch(`/staff/agents/${id}`, { is_active: isActive });
  return res.data.data;
};

export interface CountByKey {
  count: number;
  [key: string]: string | number;
}

export interface RecentCustomer {
  id: number;
  customer_name: string;
  customer_email: string;
  delivery_type: 'online' | 'offline';
  plan_key: string;
  created_at: string;
  agent_name?: string;
}

export interface AdminDashboardStats {
  total_agents: number;
  active_agents: number;
  total_customers: number;
  delivery_breakdown: Array<{ delivery_type: string; count: number }>;
  plan_breakdown: Array<{ plan_key: string; count: number }>;
  total_tenants: number;
  total_pos_users: number;
  recent_customers: RecentCustomer[];
  top_agents: Array<{ id: number; name: string; email: string; customer_count: number }>;
  daily_signups_last_14_days: Array<{ day: string; count: number }>;
}

export interface AgentDashboardStats extends AdminDashboardStats {
  own: {
    total_customers: number;
    delivery_breakdown: Array<{ delivery_type: string; count: number }>;
    plan_breakdown: Array<{ plan_key: string; count: number }>;
    recent_customers: RecentCustomer[];
  };
}

export const fetchDashboard = async (): Promise<AdminDashboardStats | AgentDashboardStats> => {
  const res = await api.get('/staff/dashboard');
  return res.data.data;
};

export default api;
