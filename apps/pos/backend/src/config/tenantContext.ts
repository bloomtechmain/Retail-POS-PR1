import { AsyncLocalStorage } from 'node:async_hooks';

interface TenantStore {
  schemaName: string;
  tenantId?: number;
}

const storage = new AsyncLocalStorage<TenantStore>();

// Runs `fn` with the given tenant schema attached to every downstream async
// operation in its call chain (no need to pass it as a parameter anywhere) —
// this is what lets every existing service file's unqualified `FROM products`
// style queries resolve into the right tenant's schema without any of those
// files knowing multi-tenancy exists.
//
// `tenantId` is separate from `schemaName` and only meaningful for the
// hosted backend: `public.users` is the one table shared across every
// tenant's schema (referenced via FK from each tenant's own tables), so
// user.service.ts needs the numeric tenant id — not just the schema — to
// scope its queries. Electron has neither a `tenants` table nor a
// `tenant_id` column on its local `users` table, so this stays undefined
// there and callers must treat that as "no filtering, single-tenant".
export const runWithTenant = <T>(schemaName: string, fn: () => T, tenantId?: number): T => {
  return storage.run({ schemaName, tenantId }, fn);
};

// Returns undefined when no tenant context is active (e.g. during login,
// before we know which tenant the user belongs to) — callers fall back to
// the default `public` search_path in that case.
export const getCurrentSchema = (): string | undefined => {
  return storage.getStore()?.schemaName;
};

// Returns undefined for Electron (no multi-tenancy at all) and for requests
// with no tenant context yet — see the comment on `runWithTenant` above.
export const getCurrentTenantId = (): number | undefined => {
  return storage.getStore()?.tenantId;
};
