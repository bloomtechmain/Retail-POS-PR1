import { useState, useEffect, useCallback } from 'react';
import { PageContainer } from '../components/layout/Layout';
import { Modal } from '../components/ui/Modal';
import { PageLoader } from '../components/ui/LoadingSpinner';
import { useToastStore } from '../store/toastStore';
import { Customer, CustomerStatementEntry } from '../types';
import api from '../services/api';
import { AxiosError } from 'axios';
import { formatCurrency as fmt } from '../utils/formatCurrency';

const emptyForm = {
  name: '', phone: '', email: '', address: '', credit_limit: '', notes: '',
};

export default function Customers() {
  const toast = useToastStore();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const [formModal, setFormModal] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [statementModal, setStatementModal] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [statement, setStatement] = useState<{ customer: Customer; entries: CustomerStatementEntry[] } | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  const [paymentModal, setPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [paymentNotes, setPaymentNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/customers?limit=200${search ? `&search=${encodeURIComponent(search)}` : ''}`);
      setCustomers(r.data.data);
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setFormModal(true); };
  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({
      name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || '',
      credit_limit: c.credit_limit == null ? '' : String(c.credit_limit), notes: c.notes || '',
    });
    setFormModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Customer name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        credit_limit: form.credit_limit.trim() === '' ? null : parseFloat(form.credit_limit),
        notes: form.notes || undefined,
      };
      if (editing) {
        await api.put(`/customers/${editing.id}`, payload);
        toast.success('Customer updated');
      } else {
        await api.post('/customers', payload);
        toast.success('Customer added');
      }
      setFormModal(false);
      load();
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Failed to save customer');
    } finally { setSaving(false); }
  };

  const handleDelete = async (c: Customer) => {
    if (!confirm(`Delete customer "${c.name}"?`)) return;
    try {
      await api.delete(`/customers/${c.id}`);
      toast.success('Customer deleted');
      load();
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Failed to delete customer');
    }
  };

  const openStatement = async (c: Customer) => {
    setSelected(c);
    setStatementModal(true);
    setStatementLoading(true);
    try {
      const r = await api.get(`/customers/${c.id}/statement`);
      setStatement(r.data.data);
    } finally { setStatementLoading(false); }
  };

  const openPayment = (c: Customer) => {
    setSelected(c);
    setPaymentAmount('');
    setPaymentMethod('cash');
    setPaymentNotes('');
    setPaymentModal(true);
  };

  const handleRecordPayment = async () => {
    if (!selected) return;
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid payment amount'); return; }
    setSaving(true);
    try {
      await api.post(`/customers/${selected.id}/payments`, {
        amount, payment_method: paymentMethod, notes: paymentNotes || undefined,
      });
      toast.success('Payment recorded');
      setPaymentModal(false);
      load();
      if (statementModal) openStatement(selected);
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Failed to record payment');
    } finally { setSaving(false); }
  };

  const totalOutstanding = customers.reduce((s, c) => s + Number(c.current_balance), 0);

  return (
    <PageContainer>
      <div className="page-header">
        <h1 className="page-title">Customers</h1>
        <button onClick={openCreate} className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Customer
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 mb-4">
        <input
          type="text"
          className="input max-w-xs"
          placeholder="Search by name, phone, email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="text-sm text-surface-500">
          Total Outstanding: <span className="font-bold text-orange-600">{fmt(totalOutstanding)}</span>
        </div>
      </div>

      {loading ? <PageLoader /> : (
        <div className="card">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th className="text-right">Credit Limit</th>
                  <th className="text-right">Outstanding Balance</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {customers.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-surface-400">No customers found</td></tr>
                ) : customers.map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.name}</td>
                    <td className="text-sm">{c.phone || '—'}</td>
                    <td className="text-right font-mono">{c.credit_limit == null ? 'Unlimited' : fmt(c.credit_limit)}</td>
                    <td className={`text-right font-mono font-semibold ${Number(c.current_balance) > 0 ? 'text-orange-600' : 'text-surface-500'}`}>
                      {fmt(c.current_balance)}
                    </td>
                    <td><span className={`badge ${c.is_active ? 'badge-green' : 'badge-red'}`}>{c.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td className="whitespace-nowrap">
                      <button onClick={() => openStatement(c)} className="btn-ghost btn-sm">Statement</button>
                      {Number(c.current_balance) > 0 && (
                        <button onClick={() => openPayment(c)} className="btn-ghost btn-sm text-emerald-600">Record Payment</button>
                      )}
                      <button onClick={() => openEdit(c)} className="btn-ghost btn-sm">Edit</button>
                      <button onClick={() => handleDelete(c)} className="btn-ghost btn-sm text-red-500">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={formModal}
        onClose={() => setFormModal(false)}
        title={editing ? 'Edit Customer' : 'Add Customer'}
        size="md"
        footer={
          <>
            <button onClick={() => setFormModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label">Name <span className="text-red-500">*</span></label>
            <input className="input" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Address</label>
            <input className="input" value={form.address} onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))} />
          </div>
          <div>
            <label className="label">Credit Limit</label>
            <input type="number" className="input font-mono" placeholder="Leave blank for unlimited"
              value={form.credit_limit} onChange={(e) => setForm(f => ({ ...f, credit_limit: e.target.value }))} min="0" step="0.01" />
          </div>
          <div>
            <label className="label">Notes</label>
            <input className="input" value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
      </Modal>

      {/* Statement Modal */}
      <Modal
        isOpen={statementModal}
        onClose={() => setStatementModal(false)}
        title={`Statement — ${selected?.name ?? ''}`}
        size="lg"
        footer={
          <>
            {selected && Number(selected.current_balance) > 0 && (
              <button onClick={() => openPayment(selected)} className="btn-primary">Record Payment</button>
            )}
            <button onClick={() => setStatementModal(false)} className="btn-secondary">Close</button>
          </>
        }
      >
        {statementLoading ? <PageLoader /> : statement && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-sm bg-surface-50 rounded-xl p-3">
              <div><p className="text-xs text-surface-400">Credit Limit</p><p className="font-semibold">{statement.customer.credit_limit == null ? 'Unlimited' : fmt(statement.customer.credit_limit)}</p></div>
              <div><p className="text-xs text-surface-400">Outstanding Balance</p><p className="font-bold text-orange-600">{fmt(statement.customer.current_balance)}</p></div>
              <div><p className="text-xs text-surface-400">Phone</p><p>{statement.customer.phone || '—'}</p></div>
            </div>
            <table className="table border border-surface-200 rounded-lg overflow-hidden">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {statement.entries.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-6 text-surface-400">No credit activity yet</td></tr>
                ) : statement.entries.map((e) => (
                  <tr key={`${e.type}-${e.id}`}>
                    <td className="text-sm">{new Date(e.created_at).toLocaleString()}</td>
                    <td className="text-sm">
                      <span className={`badge ${e.type === 'sale' ? 'badge-red' : 'badge-green'} mr-2`}>
                        {e.type === 'sale' ? 'Credit Sale' : 'Payment'}
                      </span>
                      {e.reference}
                    </td>
                    <td className={`text-right font-mono ${e.amount > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      {e.amount > 0 ? '+' : ''}{fmt(e.amount)}
                    </td>
                    <td className="text-right font-mono font-semibold">{fmt(e.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        isOpen={paymentModal}
        onClose={() => setPaymentModal(false)}
        title={`Record Payment — ${selected?.name ?? ''}`}
        size="sm"
        footer={
          <>
            <button onClick={() => setPaymentModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleRecordPayment} disabled={saving} className="btn-success">
              {saving ? 'Saving…' : 'Record Payment'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="bg-surface-50 rounded-xl p-3 text-center">
            <p className="text-xs text-surface-500">Outstanding Balance</p>
            <p className="text-2xl font-bold text-orange-600 font-mono">{fmt(selected?.current_balance ?? 0)}</p>
          </div>
          <div>
            <label className="label">Amount</label>
            <input type="number" className="input-lg font-mono text-right" value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)} min="0" step="0.01" autoFocus
              max={selected?.current_balance ?? undefined} />
          </div>
          <div>
            <label className="label">Payment Method</label>
            <div className="grid grid-cols-2 gap-2">
              {(['cash', 'card'] as const).map((m) => (
                <button key={m} onClick={() => setPaymentMethod(m)}
                  className={`py-2 rounded-lg text-sm font-medium capitalize transition-all ${
                    paymentMethod === m ? 'bg-primary-600 text-white' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                  }`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <input className="input" value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} />
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
