import { useEffect, useState } from 'react';
import { fetchPlans, createCustomer, Plan } from '../services/api';

const FEATURE_LABELS: Record<string, string> = {
  reports: 'Reports & analytics',
  users: 'Multiple staff logins',
  promotions: 'Promotions & discounts',
  customers: 'Credit customers',
  fifo_costing: 'Batch / FIFO costing',
  multi_language: 'Multi-language',
  multi_currency: 'Multi-currency',
  vat_invoice: 'VAT tax invoices',
};
const ALL_FEATURES = Object.keys(FEATURE_LABELS);

interface Result {
  delivery_type: 'online' | 'offline';
  adminEmail: string;
  adminPassword: string;
  license_key: string | null;
}

export default function CreateCustomer() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryType, setDeliveryType] = useState<'online' | 'offline'>('online');
  const [planKey, setPlanKey] = useState('basic');
  const [customFeatures, setCustomFeatures] = useState<string[]>([]);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    fetchPlans().then((data) => {
      setPlans(data);
      if (data.length > 0) setPlanKey(data[0].key);
    });
  }, []);

  // Selecting a package auto-fills the checklist below with exactly that
  // package's included features (ticked) — the agent/admin can then freely
  // tick/untick from there. Re-syncs to the new package's defaults whenever
  // the selected package changes.
  useEffect(() => {
    const plan = plans.find((p) => p.key === planKey);
    setCustomFeatures(plan?.features || []);
  }, [planKey, plans]);

  const toggleFeature = (f: string) => {
    setCustomFeatures((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  const reset = () => {
    setCustomerName('');
    setCustomerEmail('');
    setCustomerPhone('');
    setAdminEmail('');
    setAdminPassword('');
    setNotes('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!customerName.trim() || !customerEmail.trim() || !adminEmail.trim() || !adminPassword) {
      setError('Please fill in every required field.');
      return;
    }
    if (adminPassword.length < 6) {
      setError('Login password must be at least 6 characters.');
      return;
    }
    setSubmitting(true);
    try {
      // Only persist an override when it actually differs from the
      // selected package's own defaults — if the agent left every checkbox
      // exactly as auto-filled, the customer just uses the plan normally
      // (no override stored), same as before this checklist was always visible.
      const planDefaults = plans.find((p) => p.key === planKey)?.features || [];
      const isCustomized =
        customFeatures.length !== planDefaults.length ||
        customFeatures.some((f) => !planDefaults.includes(f));

      const data = await createCustomer({
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        customerPhone: customerPhone.trim() || undefined,
        deliveryType,
        planKey,
        customFeatures: isCustomized ? customFeatures : undefined,
        adminEmail: adminEmail.trim(),
        adminPassword,
        notes: notes.trim() || undefined,
      });
      setResult({
        delivery_type: data.delivery_type,
        adminEmail: data.adminEmail,
        adminPassword: data.adminPassword,
        license_key: data.license_key,
      });
      reset();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create customer.');
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="card p-8 text-center animate-in">
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
          <h1 className="text-xl font-semibold text-surface-900 mb-2">Customer created</h1>
          <p className="text-sm text-surface-600 mb-6">
            {result.delivery_type === 'online'
              ? 'Their POS is live. Share these login details with the customer.'
              : 'Share this license key with the customer to activate the desktop app — their login is already set.'}
          </p>
          <div className="bg-surface-50 border border-surface-200 rounded-lg p-4 text-left text-sm mb-6 space-y-1">
            <div className="flex justify-between py-1">
              <span className="text-surface-500">Login email</span>
              <span className="font-medium text-surface-900">{result.adminEmail}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-surface-500">Password</span>
              <span className="font-medium text-surface-900">{result.adminPassword}</span>
            </div>
            {result.license_key && (
              <div className="flex justify-between py-1">
                <span className="text-surface-500">License key</span>
                <span className="font-mono font-medium text-surface-900 text-xs">{result.license_key}</span>
              </div>
            )}
          </div>
          <button className="btn-primary btn-lg w-full" onClick={() => setResult(null)}>
            Create another customer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-surface-900">Create Customer</h1>
        <p className="text-surface-500 text-sm mt-1">Provision a new POS account — online (hosted) or offline (desktop license).</p>
      </div>

      <form onSubmit={submit} className="card p-6 space-y-6">
        <div>
          <label className="label">Delivery type</label>
          <div className="grid grid-cols-2 gap-3">
            {(['online', 'offline'] as const).map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setDeliveryType(t)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  deliveryType === t
                    ? 'border-primary-500 ring-2 ring-primary-500/30 bg-primary-50'
                    : 'border-surface-200 hover:border-primary-200'
                }`}
              >
                <div className="font-medium text-surface-900 capitalize">{t}</div>
                <div className="text-xs text-surface-500">
                  {t === 'online' ? 'Hosted web POS' : 'Desktop app, license key'}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Customer / business name</label>
            <input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div>
            <label className="label">Customer email</label>
            <input className="input" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Customer phone (optional)</label>
            <input className="input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Package</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {plans.map((plan) => (
              <button
                type="button"
                key={plan.key}
                onClick={() => setPlanKey(plan.key)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  planKey === plan.key
                    ? 'border-primary-500 ring-2 ring-primary-500/30 bg-primary-50'
                    : 'border-surface-200 hover:border-primary-200'
                }`}
              >
                <div className="font-medium text-surface-900 text-sm">{plan.name}</div>
                <div className="text-xs text-surface-500">{plan.tagline}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Features</label>
          <p className="text-xs text-surface-500 mb-2">
            Auto-filled from the selected package — tick or untick to customize for this customer.
          </p>
          <div className="grid grid-cols-2 gap-2 bg-surface-50 border border-surface-200 rounded-lg p-3">
            {ALL_FEATURES.map((f) => (
              <label key={f} className="flex items-center gap-2 text-sm text-surface-700">
                <input type="checkbox" checked={customFeatures.includes(f)} onChange={() => toggleFeature(f)} />
                {FEATURE_LABELS[f]}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-surface-200">
          <div className="sm:col-span-2">
            <label className="label">Login email (for the customer)</label>
            <input className="input" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Login password</label>
            <input className="input" type="text" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="At least 6 characters" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes (optional)</label>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={submitting} className="btn-primary btn-lg w-full">
          {submitting ? 'Creating...' : 'Create Customer'}
        </button>
      </form>
    </div>
  );
}
