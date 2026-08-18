import { useState, useEffect, useCallback } from 'react';
import { TaxRate } from '../../types';
import { useToastStore } from '../../store/toastStore';
import api from '../../services/api';
import { AxiosError } from 'axios';

export function TaxRatesManager() {
  const toast = useToastStore();
  const [rates, setRates] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/tax-rates');
      setRates(r.data.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => { setName(''); setRate(''); setEditingId(null); };

  const startEdit = (t: TaxRate) => {
    setEditingId(t.id);
    setName(t.name);
    setRate(String(t.rate));
  };

  const save = async () => {
    if (!name.trim()) { toast.error('Enter a tax name'); return; }
    const rateVal = parseFloat(rate);
    if (Number.isNaN(rateVal) || rateVal < 0 || rateVal > 100) { toast.error('Tax rate must be between 0 and 100'); return; }
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/tax-rates/${editingId}`, { name: name.trim(), rate: rateVal, is_active: true });
        toast.success('Tax rate updated');
      } else {
        await api.post('/tax-rates', { name: name.trim(), rate: rateVal });
        toast.success('Tax rate added');
      }
      resetForm();
      load();
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Failed to save tax rate');
    } finally { setSaving(false); }
  };

  const toggleActive = async (t: TaxRate) => {
    try {
      await api.put(`/tax-rates/${t.id}`, { name: t.name, rate: t.rate, is_active: !t.is_active });
      load();
    } catch {
      toast.error('Failed to update tax rate');
    }
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this tax rate? Past VAT invoices already keep their own record of it and will not change.')) return;
    try {
      await api.delete(`/tax-rates/${id}`);
      toast.success('Tax rate deleted');
      load();
    } catch {
      toast.error('Failed to delete tax rate');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-surface-900">Tax Rates</h3>
        <p className="text-surface-500 text-sm mt-0.5">
          Named taxes (e.g. VAT, NBT) that can be applied to line items in VAT Invoices — one or more per product.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label text-xs">Tax Name</label>
          <input className="input py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. VAT" />
        </div>
        <div>
          <label className="label text-xs">Rate (%)</label>
          <input type="number" className="input py-2 text-sm w-28" value={rate} onChange={(e) => setRate(e.target.value)} min="0" max="100" step="0.01" placeholder="15.00" />
        </div>
        <button onClick={save} disabled={saving} className="btn-primary btn-sm">
          {saving ? 'Saving...' : editingId ? 'Update' : 'Add Tax'}
        </button>
        {editingId && (
          <button onClick={resetForm} className="btn-secondary btn-sm">Cancel</button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-surface-400">Loading...</p>
      ) : rates.length === 0 ? (
        <p className="text-sm text-surface-400">No tax rates configured yet.</p>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="text-right">Rate</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rates.map((t) => (
                <tr key={t.id}>
                  <td className="font-medium">{t.name}</td>
                  <td className="text-right font-mono">{Number(t.rate).toFixed(2)}%</td>
                  <td>
                    <button onClick={() => toggleActive(t)} className={`badge ${t.is_active ? 'badge-green' : 'badge-gray'}`}>
                      {t.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td>
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => startEdit(t)} className="btn-ghost btn-sm">Edit</button>
                      <button onClick={() => remove(t.id)} className="btn-sm text-red-500 hover:bg-red-50 rounded-lg px-2 py-1 text-xs font-medium">Del</button>
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
