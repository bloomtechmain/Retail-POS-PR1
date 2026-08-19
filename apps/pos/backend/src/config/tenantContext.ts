import { AsyncLocalStorage } from 'node:async_hooks';

interface TenantStore {
  schemaName: string;
}

const storage = new AsyncLocalStorage<TenantStore>();

// Runs `fn` with the given tenant schema attached to every downstream async
// operation in its call chain (no need to pass it as a parameter anywhere) —
// this is what lets every existing service file's unqualified `FROM products`
// style queries resolve into the right tenant's schema without any of those
// files knowing multi-tenancy exists.
export const runWithTenant = <T>(schemaName: string, fn: () => T): T => {
  return storage.run({ schemaName }, fn);
};

// Returns undefined when no tenant context is active (e.g. during login,
// before we know which tenant the user belongs to) — callers fall back to
// the default `public` search_path in that case.
export const getCurrentSchema = (): string | undefined => {
  return storage.getStore()?.schemaName;
};
