// Feature keys — one per gated page/capability. A plan's `features` array is
// cumulative (each tier repeats everything the tier below it has, plus its
// own additions) so a single `.includes()` check is all callers ever need.
//
// Bill/receipt printing is deliberately NOT in this list — it's a core POS
// function available unconditionally on every plan, including Basic, and
// was never gated by a FeatureKey. Keep it that way; don't add a
// 'printing' key here.
export type FeatureKey =
  | 'daily_report'
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
    tagline: 'A single till, know your numbers',
    max_users: 1,
    max_terminals: 0,
    features: ['multi_currency', 'fifo_costing', 'daily_report'],
  },
  standard: {
    key: 'standard',
    name: 'Standard',
    tagline: 'Growing shop, more than one cashier',
    max_users: 5,
    max_terminals: 0,
    features: ['multi_currency', 'fifo_costing', 'daily_report', 'reports', 'users', 'promotions', 'coupons', 'multi_language'],
  },
  professional: {
    key: 'professional',
    name: 'Professional',
    tagline: 'Everything a serious shop needs',
    max_users: 15,
    max_terminals: 5,
    features: ['multi_currency', 'fifo_costing', 'daily_report', 'reports', 'users', 'promotions', 'coupons', 'multi_language', 'customers', 'restaurant_mode', 'kot_printing', 'vat_invoice', 'multi_terminal'],
  },
  // Not a bigger fixed feature list than Professional — there isn't one left
  // (Professional already carries every FeatureKey that exists). Custom's
  // actual differentiators are unlimited staff and being the explicit
  // "start from everything, then tailor per customer" tier via the existing
  // customFeatures override (see planIncludes below / CreateCustomer.tsx's
  // per-customer feature editing) rather than a rigid bundle.
  custom: {
    key: 'custom',
    name: 'Custom',
    tagline: "Tell us what you need — we'll tailor it",
    max_users: null,
    max_terminals: 5,
    features: ['multi_currency', 'fifo_costing', 'daily_report', 'reports', 'users', 'promotions', 'coupons', 'multi_language', 'customers', 'restaurant_mode', 'kot_printing', 'vat_invoice', 'multi_terminal'],
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
