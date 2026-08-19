import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchCustomer, reactivateCustomer, PlatformCustomer } from '../services/api';
import { PageLoader } from '../components/PageLoader';

const PLAN_LABELS: Record<string, string> = {
  basic: 'Basic',
  standard: 'Standard',
  professional: 'Professional',
  enterprise: 'Enterprise',
};

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

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-surface-500 uppercase tracking-wide mb-0.5">{label}</div>
      <div className="text-sm text-surface-900">{value ?? '—'}</div>
    </div>
  );
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<PlatformCustomer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reactivating, setReactivating] = useState(false);

  const load = () => {
    if (!id) return;
    setLoading(true);
    fetchCustomer(Number(id))
      .then(setCustomer)
      .catch((err) => setError(err?.response?.data?.message || 'Could not load this customer.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const handleReactivate = async () => {
    if (!id) return;
    if (!confirm('Confirm payment has been received from this customer and renew their package for another month?')) return;
    setReactivating(true);
    try {
      const updated = await reactivateCustomer(Number(id));
      setCustomer(updated);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to reactivate.');
    } finally {
      setReactivating(false);
    }
  };

  if (loading) return <PageLoader />;
  if (error || !customer) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-red-600 mb-4">{error || 'Customer not found.'}</p>
        <button className="btn-secondary" onClick={() => navigate('/customers')}>Back to Customers</button>
      </div>
    );
  }

  const startedDate = new Date(customer.created_at);
  const renewalDate = new Date(customer.subscription_end_date);

  return (
    <div className="max-w-3xl">
      <Link to="/customers" className="text-sm text-primary-600 hover:underline mb-4 inline-block">&larr; Back to Customers</Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">{customer.customer_name}</h1>
          <p className="text-surface-500 text-sm mt-1">{customer.customer_email}</p>
        </div>
        <span className={customer.delivery_type === 'online' ? 'badge-blue' : 'badge-gray'}>
          {customer.delivery_type}
        </span>
      </div>

      <div className={`card p-5 mb-6 ${customer.is_expired ? 'ring-2 ring-red-300' : ''}`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs font-medium text-surface-500 uppercase tracking-wide mb-1">Package Renewal</div>
            {customer.is_expired ? (
              <div className="text-lg font-bold text-red-600">
                Expired {Math.abs(customer.days_remaining)} day{Math.abs(customer.days_remaining) === 1 ? '' : 's'} ago
              </div>
            ) : (
              <div className={`text-lg font-bold ${customer.days_remaining <= 5 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {customer.days_remaining} day{customer.days_remaining === 1 ? '' : 's'} remaining
              </div>
            )}
            <div className="text-xs text-surface-500 mt-0.5">Renews on {renewalDate.toLocaleDateString()}</div>
          </div>
          <button className="btn-primary" disabled={reactivating} onClick={handleReactivate}>
            {reactivating ? 'Reactivating...' : 'Reactivate (Payment Received)'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </div>

      <div className="card p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Customer Phone" value={customer.customer_phone} />
          <Field label="Agent" value={customer.agent_name} />
          <Field label="Started" value={startedDate.toLocaleDateString()} />
          <Field label="Last Payment" value={customer.last_payment_at ? new Date(customer.last_payment_at).toLocaleDateString() : 'Never renewed'} />
          <Field label="Package" value={PLAN_LABELS[customer.plan_key] || customer.plan_key} />
          {customer.delivery_type === 'online' ? (
            <Field label="Tenant ID" value={customer.tenant_id} />
          ) : (
            <Field label="License Key" value={<span className="font-mono text-xs">{customer.license_key}</span>} />
          )}
        </div>

        {customer.custom_features && customer.custom_features.length > 0 && (
          <div>
            <div className="text-xs font-medium text-surface-500 uppercase tracking-wide mb-2">Customized Features</div>
            <div className="flex flex-wrap gap-1.5">
              {customer.custom_features.map((f) => (
                <span key={f} className="badge-blue">{FEATURE_LABELS[f] || f}</span>
              ))}
            </div>
          </div>
        )}

        {customer.notes && (
          <div>
            <div className="text-xs font-medium text-surface-500 uppercase tracking-wide mb-1">Notes</div>
            <p className="text-sm text-surface-700">{customer.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
