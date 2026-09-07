import { useState, useEffect, useCallback } from 'react';
import { Coupon } from '../../types';
import { useToastStore } from '../../store/toastStore';
import api from '../../services/api';
import { AxiosError } from 'axios';

const emptyForm = {
  code: '',
  type: 'percent' as 'percent' | 'fixed',
  discount_value: '',
  min_purchase_amount: '',
  max_uses: '',
  max_uses_per_customer: '',
  start_date: '',
  end_date: '',
};

export function CouponsManager() {
  const toast = useToastStore();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/coupons');
      setCoupons(r.data.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => { setForm(emptyForm); setEditingId(null); };

  const startEdit = (c: Coupon) => {
    setEditingId(c.id);
    setForm({
      code: c.code,
      type: c.type,
      discount_value: String(c.discount_value),
      min_purchase_amount: c.min_purchase_amount != null ? String(c.min_purchase_amount) : '',
      max_uses: c.max_uses != null ? String(c.max_uses) : '',
      max_uses_per_customer: c.max_uses_per_customer != null ? String(c.max_uses_per_customer) : '',
      start_date: c.start_date ? c.start_date.slice(0, 10) : '',
      end_date: c.end_date ? c.end_date.slice(0, 10) : '',
    });
  };

  const save = async () => {
    if (!form.code.trim()) { toast.error('Enter a coupon code'); return; }
    const discountValue = parseFloat(form.discount_value);
    if (Number.isNaN(discountValue) || discountValue <= 0) { toast.error('Discount value must be greater than zero'); return; }
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim(),
        type: form.type,
        discount_value: discountValue,
        min_purchase_amount: form.min_purchase_amount ? parseFloat(form.min_purchase_amount) : null,
        max_uses: form.max_uses ? parseInt(form.max_uses) : null,
        max_uses_per_customer: form.max_uses_per_customer ? parseInt(form.max_uses_per_customer) : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      };
      if (editingId) {
        await api.put(`/coupons/${editingId}`, { ...payload, is_active: true });
        toast.success('Coupon updated');
      } else {
        await api.post('/coupons', payload);
        toast.success('Coupon added');
      }
      resetForm();
      load();
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Failed to save coupon');
    } finally { setSaving(false); }
  };

  const toggleActive = async (c: Coupon) => {
    try {
      await api.put(`/coupons/${c.id}`, {
        code: c.code, type: c.type, discount_value: c.discount_value,
        min_purchase_amount: c.min_purchase_amount, max_uses: c.max_uses,
        max_uses_per_customer: c.max_uses_per_customer, start_date: c.start_date, end_date: c.end_date,
        is_active: !c.is_active,
      });
      load();
    } catch {
      toast.error('Failed to update coupon');
    }
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this coupon? Past sales that used it keep their own record and will not change.')) return;
    try {
      await api.delete(`/coupons/${id}`);
      toast.success('Coupon deleted');
      load();
    } catch {
      toast.error('Failed to delete coupon');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-surface-900">Coupons</h3>
        <p className="text-surface-500 text-sm mt-0.5">
          Code-entry discounts a cashier applies at checkout — separate from automatic promotions, and a coupon replaces any active promotion on the sale rather than stacking with it.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label text-xs">Code</label>
          <input className="input py-2 text-sm uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. SAVE10" />
        </div>
        <div>
          <label className="label text-xs">Type</label>
          <select className="input py-2 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'percent' | 'fixed' })}>
            <option value="percent">Percent</option>
            <option value="fixed">Fixed Amount</option>
          </select>
        </div>
        <div>
          <label className="label text-xs">{form.type === 'percent' ? 'Discount (%)' : 'Discount Amount'}</label>
          <input type="number" className="input py-2 text-sm w-28" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} min="0" step="0.01" />
        </div>
        <div>
          <label className="label text-xs">Min Purchase</label>
          <input type="number" className="input py-2 text-sm w-28" value={form.min_purchase_amount} onChange={(e) => setForm({ ...form, min_purchase_amount: e.target.value })} min="0" step="0.01" placeholder="Optional" />
        </div>
        <div>
          <label className="label text-xs">Max Uses</label>
          <input type="number" className="input py-2 text-sm w-24" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} min="0" placeholder="Unlimited" />
        </div>
        <div>
          <label className="label text-xs">Max Uses / Customer</label>
          <input type="number" className="input py-2 text-sm w-24" value={form.max_uses_per_customer} onChange={(e) => setForm({ ...form, max_uses_per_customer: e.target.value })} min="0" placeholder="Unlimited" />
        </div>
        <div>
          <label className="label text-xs">Start Date</label>
          <input type="date" className="input py-2 text-sm" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
        </div>
        <div>
          <label className="label text-xs">End Date</label>
          <input type="date" className="input py-2 text-sm" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
        </div>
        <button onClick={save} disabled={saving} className="btn-primary btn-sm">
          {saving ? 'Saving...' : editingId ? 'Update' : 'Add Coupon'}
        </button>
        {editingId && (
          <button onClick={resetForm} className="btn-secondary btn-sm">Cancel</button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-surface-400">Loading...</p>
      ) : coupons.length === 0 ? (
        <p className="text-sm text-surface-400">No coupons configured yet.</p>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th className="text-right">Uses</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id}>
                  <td className="font-mono font-medium">{c.code}</td>
                  <td>{c.type === 'percent' ? `${Number(c.discount_value)}%` : Number(c.discount_value).toFixed(2)}</td>
                  <td className="text-right font-mono">{c.uses_count}{c.max_uses != null ? ` / ${c.max_uses}` : ''}</td>
                  <td>
                    <button onClick={() => toggleActive(c)} className={`badge ${c.is_active ? 'badge-green' : 'badge-gray'}`}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td>
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => startEdit(c)} className="btn-ghost btn-sm">Edit</button>
                      <button onClick={() => remove(c.id)} className="btn-sm text-red-500 hover:bg-red-50 rounded-lg px-2 py-1 text-xs font-medium">Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
