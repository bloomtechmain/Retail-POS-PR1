import { useEffect, useState, useCallback } from 'react';
import {
  fetchPlans, createCustomer, listCustomers, reactivateCustomer, deleteCustomerPermanently,
  Plan, PlatformCustomer,
} from '../services/api';

const POS_DOWNLOAD_URL = 'https://app.bloomswiftpos.com/downloads/BloomPOS-Setup.exe';

// Same real subscription-expiry / grace-period / reactivate-with-new-key
// workflow as the live system (see staff.service.ts's TEST_PERIOD_INTERVAL/
// TEST_GRACE_MS) — just compressed to an hour + 10 minutes instead of a
// month + a week, so the whole cycle can be watched end-to-end in minutes
// instead of waiting weeks. Every customer created here is flagged is_test
// and never appears on the real Customers page or in the real dashboard
// numbers.
function formatCountdown(ms: number): string {
  const sign = ms < 0 ? -1 : 1;
  const abs = Math.abs(ms);
  const totalSeconds = Math.floor(abs / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts = h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  return sign < 0 ? `Expired ${parts} ago` : `${parts} remaining`;
}

interface Result {
  delivery_type: 'online' | 'offline';
  adminEmail: string;
  adminPassword: string;
  license_key: string | null;
}

export default function TestingEnvironment() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [customers, setCustomers] = useState<PlatformCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [, forceTick] = useState(0);

  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [deliveryType, setDeliveryType] = useState<'online' | 'offline'>('offline');
  const [planKey, setPlanKey] = useState('basic');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [totalPrice, setTotalPrice] = useState('60000');
  const [installmentCount, setInstallmentCount] = useState('3');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const copy = (field: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField((f) => (f === field ? null : f)), 1500);
  };

  const refresh = useCallback(() => {
    listCustomers('test').then(setCustomers).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchPlans().then((data) => {
      setPlans(data);
      if (data.length > 0) setPlanKey(data[0].key);
    });
    refresh();
  }, [refresh]);

  // Tick every second for a live countdown; re-fetch every 30s in case
  // someone else (or another tab) reactivated/deleted a test customer.
  useEffect(() => {
    const tick = setInterval(() => forceTick((n) => n + 1), 1000);
    const poll = setInterval(refresh, 30000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [refresh]);

  const resetForm = () => {
    setCustomerName('');
    setCustomerEmail('');
    setAdminEmail('');
    setAdminPassword('');
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
    if (deliveryType === 'offline') {
      if (!(Number(totalPrice) > 0)) {
        setError('Total price is required for offline customers.');
        return;
      }
      if (!(Number(installmentCount) >= 1)) {
        setError('Installment count must be at least 1.');
        return;
      }
    }
    setSubmitting(true);
    try {
      const data = await createCustomer({
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        deliveryType,
        planKey,
        adminEmail: adminEmail.trim(),
        adminPassword,
        isTest: true,
        totalPrice: deliveryType === 'offline' ? Number(totalPrice) : undefined,
        installmentCount: deliveryType === 'offline' ? Number(installmentCount) : undefined,
      });
      setResult({
        delivery_type: data.delivery_type,
        adminEmail: data.adminEmail,
        adminPassword: data.adminPassword,
        license_key: data.license_key,
      });
      resetForm();
      refresh();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create test customer.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReactivate = async (c: PlatformCustomer) => {
    setBusyId(c.id);
    try {
      await reactivateCustomer(c.id);
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (c: PlatformCustomer) => {
    if (!confirm(`Delete test customer "${c.customer_name}"? This cannot be undone.`)) return;
    setBusyId(c.id);
    try {
      await deleteCustomerPermanently(c.id);
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-surface-900">Testing Environment</h1>
        <p className="text-surface-500 text-sm mt-1">
          Exercises the exact same expire → grace period → reactivate-with-a-new-license-key workflow
          real customers go through, compressed to an hour instead of a month, with a 10-minute grace
          instead of a week. These customers are flagged as test data — they never appear on the real
          Customers page or affect the real dashboard numbers.
        </p>
      </div>

      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-surface-900">Create Test Customer</h2>
          <button className="btn-secondary btn-sm" onClick={() => { setShowForm((v) => !v); setResult(null); }}>
            {showForm ? 'Cancel' : '+ New Test Customer'}
          </button>
        </div>

        {result && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm mt-4 space-y-1.5">
            <div className="flex justify-between py-1">
              <span className="text-surface-500">Login email</span>
              <span className="font-medium text-surface-900">{result.adminEmail}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-surface-500">Password</span>
              <span className="font-medium text-surface-900">{result.adminPassword}</span>
            </div>
            {result.license_key && (
              <div className="flex justify-between items-center py-1">
                <span className="text-surface-500">License key</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono font-medium text-surface-900 text-xs">{result.license_key}</span>
                  <button type="button" className="text-xs text-primary-600 hover:text-primary-700 font-medium" onClick={() => copy('key', result.license_key!)}>
                    {copiedField === 'key' ? 'Copied!' : 'Copy'}
                  </button>
                </span>
              </div>
            )}
            {result.delivery_type === 'offline' && (
              <div className="flex justify-between items-center py-1">
                <span className="text-surface-500">Download link</span>
                <button type="button" className="text-xs text-primary-600 hover:text-primary-700 font-medium" onClick={() => copy('link', POS_DOWNLOAD_URL)}>
                  {copiedField === 'link' ? 'Copied!' : 'Copy link'}
                </button>
              </div>
            )}
          </div>
        )}

        {showForm && (
          <form onSubmit={submit} className="space-y-4 mt-4 pt-4 border-t border-surface-200">
            <div>
              <label className="label">Delivery type</label>
              <div className="grid grid-cols-2 gap-3">
                {(['online', 'offline'] as const).map((t) => (
                  <button
                    type="button" key={t} onClick={() => setDeliveryType(t)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      deliveryType === t ? 'border-primary-500 ring-2 ring-primary-500/30 bg-primary-50' : 'border-surface-200 hover:border-primary-200'
                    }`}
                  >
                    <div className="font-medium text-surface-900 capitalize">{t}</div>
                    <div className="text-xs text-surface-500">{t === 'online' ? 'Hosted web POS' : 'Desktop app, paid in installments'}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label">Customer / business name</label>
                <input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Customer email</label>
                <input className="input" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
              </div>
            </div>

            {deliveryType === 'offline' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-surface-50 border border-surface-200 rounded-lg p-4">
                <div className="sm:col-span-2 text-xs text-surface-500 -mt-1 mb-1">
                  Same installment cycle as the real system — creating this counts as installment #1, then
                  each Renew is the next installment, 1 hour apart with a 10-minute grace.
                </div>
                <div>
                  <label className="label">Total price</label>
                  <input className="input" type="number" min="0" step="0.01" value={totalPrice} onChange={(e) => setTotalPrice(e.target.value)} />
                </div>
                <div>
                  <label className="label">Number of installments</label>
                  <input className="input" type="number" min="1" step="1" value={installmentCount} onChange={(e) => setInstallmentCount(e.target.value)} />
                </div>
              </div>
            )}

            <div>
              <label className="label">Package</label>
              <select className="input" value={planKey} onChange={(e) => setPlanKey(e.target.value)}>
                {plans.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label">Login email (for the test customer)</label>
                <input className="input" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Login password</label>
                <input className="input" type="password" autoComplete="new-password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="At least 6 characters" />
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Creating...' : 'Create Test Customer (expires in 1 hour)'}
            </button>
          </form>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-200">
          <h2 className="text-sm font-semibold text-surface-900">Test Customers</h2>
        </div>
        {loading ? (
          <div className="p-6 text-sm text-surface-400">Loading…</div>
        ) : customers.length === 0 ? (
          <div className="p-6 text-sm text-surface-400">No test customers yet — create one above.</div>
        ) : (
          <div className="divide-y divide-surface-100">
            {customers.map((c) => (
              <div key={c.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-surface-900 truncate">{c.customer_name}</span>
                    <span className={c.delivery_type === 'online' ? 'badge-blue' : 'badge-gray'}>{c.delivery_type}</span>
                    <span className={c.is_fully_paid ? 'badge-green' : !c.is_active ? 'badge-red' : c.ms_remaining < 0 ? 'badge-yellow' : 'badge-green'}>
                      {c.is_fully_paid ? 'Fully Paid' : !c.is_active ? 'Deactivated' : c.ms_remaining < 0 ? 'Expired' : 'Active'}
                    </span>
                    {c.total_price != null && c.installment_count != null && !c.is_fully_paid && (
                      <span className="badge-gray">Installment {c.installments_paid} of {c.installment_count}</span>
                    )}
                  </div>
                  <div className="text-xs text-surface-500 mt-0.5">{c.customer_email} · {c.plan_key}</div>
                  {!c.is_fully_paid && (
                    <div className={`text-xs mt-1 font-mono ${c.ms_remaining < 0 ? 'text-red-600' : 'text-surface-600'}`}>
                      {formatCountdown(c.ms_remaining)}
                    </div>
                  )}
                  {c.delivery_type === 'offline' && c.license_key && (
                    <div className="text-xs mt-1 font-mono text-surface-400 truncate">{c.license_key}</div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {!c.is_fully_paid && (
                    <button className="btn-secondary btn-sm" disabled={busyId === c.id} onClick={() => handleReactivate(c)}>
                      {busyId === c.id ? '...' : c.delivery_type === 'offline' ? 'Renew (New Key)' : 'Reactivate'}
                    </button>
                  )}
                  <button className="btn-secondary btn-sm text-red-600" disabled={busyId === c.id} onClick={() => handleDelete(c)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
