import { useEffect, useState } from 'react';
import { fetchPlans, signupTenant, Plan, SignupResult } from './services/api';

const POS_APP_URL = import.meta.env.VITE_POS_APP_URL || '/';

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

function App() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansError, setPlansError] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<string>('');

  const [businessName, setBusinessName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SignupResult | null>(null);

  useEffect(() => {
    fetchPlans()
      .then((data) => {
        setPlans(data);
        if (data.length > 0) setSelectedPlan(data[0].key);
      })
      .catch(() => setPlansError('Could not load plans. Please refresh the page.'));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!businessName.trim() || !adminName.trim() || !adminEmail.trim() || !adminPassword) {
      setError('Please fill in every field.');
      return;
    }
    if (adminPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (adminPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!selectedPlan) {
      setError('Please choose a plan.');
      return;
    }

    setSubmitting(true);
    try {
      const data = await signupTenant({
        businessName: businessName.trim(),
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim(),
        adminPassword,
        planKey: selectedPlan,
      });
      setResult(data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card max-w-md w-full p-8 text-center animate-in">
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4 text-2xl">
            ✓
          </div>
          <h1 className="text-xl font-semibold text-surface-900 mb-2">Your POS is ready!</h1>
          <p className="text-sm text-surface-600 mb-6">
            Log in to your new Retail POS using the details you just created.
          </p>
          <div className="bg-surface-50 border border-surface-200 rounded-lg p-4 text-left text-sm mb-6">
            <div className="flex justify-between py-1">
              <span className="text-surface-500">Business</span>
              <span className="font-medium text-surface-900">{businessName}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-surface-500">Login email</span>
              <span className="font-medium text-surface-900">{result.adminEmail}</span>
            </div>
          </div>
          <a href={POS_APP_URL} className="btn-primary btn-lg w-full">
            Go to your POS
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="pt-14 pb-10 px-4 text-center">
        <img src="/logo.png" alt="BloomPOS" className="w-14 h-14 mx-auto mb-4 rounded-xl" />
        <h1 className="text-3xl sm:text-4xl font-bold text-surface-900 mb-3">
          Get your own Retail POS
        </h1>
        <p className="text-surface-600 max-w-md mx-auto">
          Choose a plan and create your account — your point-of-sale system is ready in seconds.
        </p>
      </header>

      <main className="max-w-3xl mx-auto px-4 pb-20">
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-surface-500 uppercase tracking-wide mb-3">
            1. Choose your plan
          </h2>
          {plansError && <p className="text-sm text-red-600">{plansError}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {plans.map((plan) => {
              const active = plan.key === selectedPlan;
              return (
                <button
                  key={plan.key}
                  type="button"
                  onClick={() => setSelectedPlan(plan.key)}
                  className={`card p-4 text-left transition-all duration-150 ${
                    active
                      ? 'border-primary-500 ring-2 ring-primary-500/30 shadow-md'
                      : 'hover:border-primary-200 hover:shadow-sm'
                  }`}
                >
                  <div className="font-semibold text-surface-900">{plan.name}</div>
                  <div className="text-xs text-surface-500 mb-2">{plan.tagline}</div>
                  <div className="text-xs text-surface-500 mb-2">
                    {plan.max_users === null ? 'Unlimited users' : `Up to ${plan.max_users} user${plan.max_users === 1 ? '' : 's'}`}
                  </div>
                  {plan.features.length > 0 && (
                    <ul className="text-xs text-surface-600 space-y-0.5">
                      {plan.features.map((f) => (
                        <li key={f}>+ {FEATURE_LABELS[f] || f}</li>
                      ))}
                    </ul>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-surface-500 uppercase tracking-wide mb-3">
            2. Your business & login
          </h2>
          <form onSubmit={handleSubmit} className="card p-6 space-y-4">
            <div>
              <label className="label">Business name</label>
              <input
                className="input"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Green Valley Store"
              />
            </div>
            <div>
              <label className="label">Your name</label>
              <input
                className="input"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="e.g. Jane Silva"
              />
            </div>
            <div>
              <label className="label">Login email</label>
              <input
                className="input"
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="you@business.com"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Password</label>
                <input
                  className="input"
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="At least 6 characters"
                />
              </div>
              <div>
                <label className="label">Confirm password</label>
                <input
                  className="input"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button type="submit" disabled={submitting} className="btn-primary btn-lg w-full">
              {submitting ? 'Creating your POS...' : 'Create my POS'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

export default App;
