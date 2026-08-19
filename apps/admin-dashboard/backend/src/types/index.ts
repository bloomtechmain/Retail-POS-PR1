// Platform staff (admins + marketing agents). Separate JWT/secret from
// apps/pos/backend's tenant-user auth — this service never issues or
// verifies a tenant user's token, and vice versa.
export interface StaffAuthPayload {
  staff_id: number;
  role: 'admin' | 'agent';
  name: string;
  email: string;
}
