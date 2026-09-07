// Feature keys — one per gated page/capability. A plan's `features` array is
// cumulative (each tier repeats everything the tier below it has, plus its
// own additions) so a single `.includes()` check is all callers ever need.
export type FeatureKey =
  | 'reports'
  | 'users'
  | 'promotions'
  | 'coupons'
  | 'customers'
  | 'fifo_costing'
  | 'multi_language'
  | 'multi_currency'
  | 'vat_invoice'
  | 'restaurant_mode'
  | 'kot_printing'
  | 'multi_terminal';

export interface Plan {
  key: string;
  name: string;
  tagline: string;
  max_users: number | null; // null = unlimited
  // Offline (Electron) multi-terminal/LAN mode only — how many Terminal
  // machines may pair with one Server. Unrelated to max_users, which caps
  // login accounts, not physical machines. null = unlimited, 0 = none
  // (the default for every tier below the one that includes 'multi_terminal').
  max_terminals: number | null;
  features: FeatureKey[];
}

export const PLANS: Record<string, Plan> = {
  basic: {
    key: 'basic',
    name: 'Basic',
    tagline: 'A single till, keep it simple',
    max_users: 1,
    max_terminals: 0,
    features: [],
  },
  standard: {
    key: 'standard',
    name: 'Standard',
    tagline: 'Growing shop, more than one cashier',
    max_users: 5,
    max_terminals: 0,
    features: ['reports', 'users', 'promotions', 'coupons'],
  },
  professional: {
    key: 'professional',
    name: 'Professional',
    tagline: 'Credit customers, batch costing, multi-branch-ready',
    max_users: 15,
    max_terminals: 0,
    features: ['reports', 'users', 'promotions', 'coupons', 'customers', 'fifo_costing', 'multi_language', 'multi_currency', 'restaurant_mode', 'kot_printing'],
  },
  enterprise: {
    key: 'enterprise',
    name: 'Enterprise',
    tagline: 'Full compliance tooling, unlimited staff',
    max_users: null,
    max_terminals: 5,
    features: ['reports', 'users', 'promotions', 'coupons', 'customers', 'fifo_costing', 'multi_language', 'multi_currency', 'vat_invoice', 'restaurant_mode', 'kot_printing', 'multi_terminal'],
  },
};

export const DEFAULT_PLAN_KEY = 'basic';

export const isValidPlanKey = (key: unknown): key is string =>
  typeof key === 'string' && key in PLANS;

// `customFeatures`, when present (non-null/non-undefined), is an explicit
// override set by a marketing agent customizing a tenant's package beyond
// its plan defaults — it fully replaces the plan's feature list for gating
// purposes. Omitted/null (the vast majority of tenants) falls back to the
// plan's own defaults, identical to before this parameter existed.
export const planIncludes = (
  planKey: string,
  feature: FeatureKey,
  customFeatures?: FeatureKey[] | null
): boolean =>
  customFeatures != null
    ? customFeatures.includes(feature)
    : PLANS[planKey]?.features.includes(feature) ?? false;

export const getPlanCatalog = (): Plan[] => Object.values(PLANS);
