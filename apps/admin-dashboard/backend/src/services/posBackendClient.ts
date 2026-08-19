// The only place this service talks to apps/pos/backend — for the two
// things that are genuinely pos-domain data it must not duplicate: the
// plan catalog, and tenant provisioning (which needs the tenant-schema DDL
// and public.tenants row that only pos-backend owns).
import { createError } from '../middleware/error';

const POS_BACKEND_URL = process.env.POS_BACKEND_URL || 'http://localhost:5000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

export const fetchPlans = async (): Promise<unknown> => {
  const res = await fetch(`${POS_BACKEND_URL}/api/settings/plans`);
  if (!res.ok) throw createError('Could not reach the POS backend for the plan catalog.', 502);
  const data = (await res.json()) as { data: unknown };
  return data.data;
};

export interface ProvisionOnlineTenantInput {
  businessName: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  planKey: string;
  customFeatures?: string[];
}

export const provisionOnlineTenant = async (
  input: ProvisionOnlineTenantInput
): Promise<{ tenantId: number; schemaName: string; adminEmail: string }> => {
  if (!INTERNAL_API_KEY) {
    throw createError('Online provisioning is not configured on this server (INTERNAL_API_KEY missing).', 500);
  }
  const res = await fetch(`${POS_BACKEND_URL}/api/tenants/provision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Api-Key': INTERNAL_API_KEY },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw createError(body.message || 'Could not provision the tenant on the POS backend.', res.status);
  }
  const data = (await res.json()) as { data: { tenantId: number; schemaName: string; adminEmail: string } };
  return data.data;
};
