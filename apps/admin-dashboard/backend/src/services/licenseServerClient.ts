// Thin server-to-server client for apps/license-server, used only by the
// offline-customer path in staff.service.ts. Reuses license-server's
// existing human admin login (POST /api/admin/login) with a service
// account, rather than adding a new auth mechanism there — the JWT it
// issues is cached in memory and refreshed on expiry/401.
import { createError } from '../middleware/error';

const LICENSE_SERVER_URL = process.env.LICENSE_SERVER_URL;
const LICENSE_SERVER_ADMIN_USERNAME = process.env.LICENSE_SERVER_ADMIN_USERNAME;
const LICENSE_SERVER_ADMIN_PASSWORD = process.env.LICENSE_SERVER_ADMIN_PASSWORD;

let cachedToken: string | null = null;

const login = async (): Promise<string> => {
  if (!LICENSE_SERVER_URL || !LICENSE_SERVER_ADMIN_USERNAME || !LICENSE_SERVER_ADMIN_PASSWORD) {
    throw createError('Offline licensing is not configured on this server (LICENSE_SERVER_URL/credentials missing).', 500);
  }
  const res = await fetch(`${LICENSE_SERVER_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: LICENSE_SERVER_ADMIN_USERNAME, password: LICENSE_SERVER_ADMIN_PASSWORD }),
  });
  if (!res.ok) throw createError('Could not authenticate with the license server.', 502);
  const data = (await res.json()) as { token: string };
  cachedToken = data.token;
  return cachedToken!;
};

const request = async (path: string, body: Record<string, unknown>, method: 'POST' | 'PATCH' = 'POST'): Promise<any> => {
  let token = cachedToken ?? (await login());
  let res = await fetch(`${LICENSE_SERVER_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    // Cached token expired — log in again once and retry.
    token = await login();
    res = await fetch(`${LICENSE_SERVER_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  }
  if (!res.ok) throw createError('License server request failed.', 502);
  return res.json();
};

export const generateLicense = async (input: {
  customer_name: string;
  customer_email: string;
  notes?: string;
  preset_admin_email: string;
  preset_admin_password: string;
}): Promise<{ licenseKey: string }> => {
  const data = await request('/api/admin/licenses/generate', {
    customer_name: input.customer_name,
    customer_email: input.customer_email,
    count: 1,
    notes: input.notes,
    preset_admin_email: input.preset_admin_email,
    preset_admin_password: input.preset_admin_password,
  });
  const keys: string[] = data.keys || [];
  if (keys.length === 0) throw createError('License server did not return a license key.', 502);
  return { licenseKey: keys[0] };
};

// Restores (or, if ever needed, revokes) a license's activation ability —
// blocks/unblocks future activations only. Cannot retroactively cut off a
// desktop install that already activated, since Electron never re-checks
// after its first successful activation (see staff.service.ts's
// reactivateCustomer for the full explanation).
export const setLicenseActive = async (licenseKey: string, isActive: boolean): Promise<void> => {
  await request(`/api/admin/licenses/${licenseKey}`, { is_active: isActive }, 'PATCH');
};
