import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  fetchCustomer, reactivateCustomer, updateCustomerFeatures, fetchPlans,
  setCustomerActive, deleteCustomerPermanently, Plan, PlatformCustomer,
} from '../services/api';
import { PageLoader } from '../components/PageLoader';
import { useAuth } from '../AuthContext';

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
const ALL_FEATURES = Object.keys(FEATURE_LABELS);

const POS_DOWNLOAD_URL = 'https://app.bloomswiftpos.com/downloads/BloomPOS-Setup.exe';

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
  const { staff } = useAuth();
  const isAdmin = staff?.role === 'admin';
  const [customer, setCustomer] = useState<PlatformCustomer | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reactivating, setReactivating] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [editingFeatures, setEditingFeatures] = useState(false);
  const [featureSelection, setFeatureSelection] = useState<string[]>([]);
  const [savingFeatures, setSavingFeatures] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copy = (field: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField((f) => (f === field ? null : f)), 1500);
  };

  const load = () => {
    if (!id) return;
    setLoading(true);
    fetchCustomer(Number(id))
      .then(setCustomer)
      .catch((err) => setError(err?.response?.data?.message || 'Could not load this customer.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);
  useEffect(() => { fetchPlans().then(setPlans); }, []);

  const startEditingFeatures = () => {
    if (!customer) return;
    const planDefaults = plans.find((p) => p.key === customer.plan_key)?.features || [];
    setFeatureSelection(customer.custom_features && customer.custom_features.length > 0 ? customer.custom_features : planDefaults);
    setEditingFeatures(true);
  };

  const toggleFeature = (f: string) => {
    setFeatureSelection((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  const saveFeatures = async () => {
    if (!id) return;
    setSavingFeatures(true);
    try {
      const updated = await updateCustomerFeatures(Number(id), featureSelection);
      setCustomer(updated);
      setEditingFeatures(false);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update features.');
    } finally {
      setSavingFeatures(false);
    }
  };

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

  const handleToggleActive = async () => {
    if (!id || !customer) return;
    const goingActive = !customer.is_active;
    const message = goingActive
      ? 'Reactivate this customer? They will be able to log in again.'
      : "Deactivate this customer? They won't be able to log in until reactivated. Their data is not touched.";
    if (!confirm(message)) return;
    setTogglingActive(true);
    try {
      const updated = await setCustomerActive(Number(id), goingActive);
      setCustomer(updated);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to change status.');
    } finally {
      setTogglingActive(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !customer) return;
    setDeleteError('');
    setDeleting(true);
    try {
      await deleteCustomerPermanently(Number(id));
      navigate('/customers');
    } catch (err: any) {
      setDeleteError(err?.response?.data?.message || 'Failed to delete customer.');
    } finally {
      setDeleting(false);
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
        <div className="flex items-center gap-2">
          <span className={customer.is_active ? 'badge-green' : 'badge-red'}>
            {customer.is_active ? 'Active' : 'Deactivated'}
          </span>
          <span className={customer.delivery_type === 'online' ? 'badge-blue' : 'badge-gray'}>
            {customer.delivery_type}
          </span>
          <button className="btn-secondary btn-sm" disabled={togglingActive} onClick={handleToggleActive}>
            {togglingActive ? 'Saving...' : customer.is_active ? 'Deactivate' : 'Reactivate'}
          </button>
        </div>
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
            <>
              <Field
                label="License Key"
                value={
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs">{customer.license_key}</span>
                    <button
                      type="button"
                      className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                      onClick={() => copy('key', customer.license_key!)}
                    >
                      {copiedField === 'key' ? 'Copied!' : 'Copy'}
                    </button>
                  </span>
                }
              />
              <Field
                label="Download Link"
                value={
                  <button
                    type="button"
                    className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                    onClick={() => copy('link', POS_DOWNLOAD_URL)}
                  >
                    {copiedField === 'link' ? 'Copied!' : 'Copy link'}
                  </button>
                }
              />
            </>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-surface-500 uppercase tracking-wide">Features</div>
            {!editingFeatures && (
              <button className="btn-secondary btn-sm" onClick={startEditingFeatures}>Edit Features</button>
            )}
          </div>

          {editingFeatures ? (
            <div>
              <p className="text-xs text-surface-500 mb-2">
                {customer.delivery_type === 'online'
                  ? 'Changes apply immediately — the customer sees them on their next action, no restart needed.'
                  : "This updates the customer's record. It can't reach an already-running desktop install, only future activations."}
              </p>
              <div className="grid grid-cols-2 gap-2 bg-surface-50 border border-surface-200 rounded-lg p-3">
                {ALL_FEATURES.map((f) => (
                  <label key={f} className="flex items-center gap-2 text-sm text-surface-700">
                    <input type="checkbox" checked={featureSelection.includes(f)} onChange={() => toggleFeature(f)} />
                    {FEATURE_LABELS[f]}
                  </label>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <button className="btn-primary btn-sm" disabled={savingFeatures} onClick={saveFeatures}>
                  {savingFeatures ? 'Saving...' : 'Save Features'}
                </button>
                <button className="btn-secondary btn-sm" disabled={savingFeatures} onClick={() => setEditingFeatures(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : customer.custom_features && customer.custom_features.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {customer.custom_features.map((f) => (
                <span key={f} className="badge-blue">{FEATURE_LABELS[f] || f}</span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-surface-400">Using {PLAN_LABELS[customer.plan_key] || customer.plan_key} package defaults.</p>
          )}
        </div>

        {customer.notes && (
          <div>
            <div className="text-xs font-medium text-surface-500 uppercase tracking-wide mb-1">Notes</div>
            <p className="text-sm text-surface-700">{customer.notes}</p>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="card p-6 mt-6 border-2 border-red-200 bg-red-50/30">
          <div className="text-sm font-semibold text-red-700 mb-1">Danger Zone</div>
          <p className="text-xs text-surface-600 mb-3">
            Permanently deletes this customer.
            {customer.delivery_type === 'online'
              ? ' Their entire business — products, sales, everything — is destroyed immediately.'
              : ' Their license key is destroyed and can never be reused.'}
            {' '}This cannot be undone. Consider deactivating instead unless you're certain.
          </p>
          <label className="label">Type the customer's name ({customer.customer_name}) to confirm</label>
          <input
            className="input mb-2"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder={customer.customer_name}
          />
          {deleteError && <p className="text-sm text-red-600 mb-2">{deleteError}</p>}
          <button
            className="btn-primary bg-red-600 hover:bg-red-700 border-red-600"
            disabled={deleting || deleteConfirmText !== customer.customer_name}
            onClick={handleDelete}
          >
            {deleting ? 'Deleting...' : 'Permanently Delete Customer'}
          </button>
        </div>
      )}
    </div>
  );
}
