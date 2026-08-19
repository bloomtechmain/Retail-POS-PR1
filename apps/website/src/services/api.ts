import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

export interface Plan {
  key: string;
  name: string;
  tagline: string;
  max_users: number | null;
  features: string[];
}

export const fetchPlans = async (): Promise<Plan[]> => {
  const res = await api.get('/settings/plans');
  return res.data.data;
};

export interface SignupInput {
  businessName: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  planKey: string;
}

export interface SignupResult {
  tenantId: number;
  schemaName: string;
  adminEmail: string;
}

export const signupTenant = async (input: SignupInput): Promise<SignupResult> => {
  const res = await api.post('/tenants', input);
  return res.data.data;
};

export default api;
