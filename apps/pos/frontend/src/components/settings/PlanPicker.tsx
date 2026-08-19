import { Plan, FeatureKey } from '../../types';

const FEATURE_LABELS: Record<FeatureKey, string> = {
  reports: 'Full Reports (sales, cashier, revenue trends)',
  users: 'Multiple staff accounts & roles',
  promotions: 'Promotions & discounts',
  customers: 'Credit customers, credit limits & statements',
  fifo_costing: 'FIFO / Batch-wise costing + expiry tracking',
  multi_language: 'Multi-language (English/Sinhala)',
  multi_currency: 'Multi-currency',
  vat_invoice: 'VAT Invoice (tax rates, PDF, compliant numbering)',
};

interface Props {
  plans: Plan[];
  selected: string;
  onSelect: (key: string) => void;
  currentKey?: string; // shows a "Current Plan" badge instead of letting it be picked again
}

export function PlanPicker({ plans, selected, onSelect, currentKey }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {plans.map((plan) => {
        const isSelected = selected === plan.key;
        const isCurrent = currentKey === plan.key;
        return (
          <button
            key={plan.key}
            type="button"
            onClick={() => onSelect(plan.key)}
            className={`text-left p-4 rounded-xl border transition-colors flex flex-col gap-2 ${
              isSelected
                ? 'border-primary-500 bg-primary-50'
                : 'border-surface-200 hover:border-surface-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-surface-900">{plan.name}</span>
              {isCurrent && <span className="badge badge-green text-[10px]">Current</span>}
            </div>
            <p className="text-xs text-surface-500">{plan.tagline}</p>
            <p className="text-xs text-surface-600">
              {plan.max_users === null ? 'Unlimited staff accounts' : `Up to ${plan.max_users} staff account${plan.max_users === 1 ? '' : 's'}`}
            </p>
            <ul className="text-xs text-surface-600 space-y-1 mt-1">
              {plan.features.length === 0 ? (
                <li className="text-surface-400">Core POS essentials only</li>
              ) : (
                plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5">
                    <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {FEATURE_LABELS[f]}
                  </li>
                ))
              )}
            </ul>
          </button>
        );
      })}
    </div>
  );
}
