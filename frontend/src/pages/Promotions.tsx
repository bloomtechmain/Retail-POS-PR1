import { useState, useEffect, useCallback } from 'react';
import { PageContainer } from '../components/layout/Layout';
import { Modal } from '../components/ui/Modal';
import { PageLoader } from '../components/ui/LoadingSpinner';
import { useToastStore } from '../store/toastStore';
import { Promotion, Category, Product } from '../types';
import api from '../services/api';
import { AxiosError } from 'axios';
import { useT } from '../i18n/translations';

const EMPTY: Partial<Promotion> = {
  name: '', type: 'percentage', discount_value: 0,
  applies_to: 'all', is_active: true, priority: 0,
};

export default function Promotions() {
  const t = useT();
  const toast = useToastStore();
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Partial<Promotion>>(EMPTY);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [promoR, catR, prodR] = await Promise.all([
        api.get('/promotions'),
        api.get('/products/categories'),
        api.get('/products?limit=500'),
      ]);
      setPromos(promoR.data.data);
      setCategories(catR.data.data);
      setProducts(prodR.data.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm(EMPTY); setIsEditing(false); setModalOpen(true); };
  const openEdit = (p: Promotion) => { setForm({ ...p }); setIsEditing(true); setModalOpen(true); };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isEditing) {
        await api.put(`/promotions/${form.id}`, form);
        toast.success('Promotion updated');
      } else {
        await api.post('/promotions', form);
        toast.success('Promotion created');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this promotion?')) return;
    await api.delete(`/promotions/${id}`);
    toast.success('Deleted');
    load();
  };

  const typeLabels: Record<string, string> = {
    percentage: t.promo_type_pct,
    fixed_amount: t.promo_type_fixed,
    buy_x_get_y: t.promo_type_bxgy,
    free_item: t.promo_type_free,
  };

  return (
    <PageContainer>
      <div className="page-header">
        <h1 className="page-title">{t.promo_title}</h1>
        <button onClick={openCreate} className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t.promo_add}
        </button>
      </div>

      {loading ? <PageLoader /> : (
        <div className="card">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.promo_col_name}</th>
                  <th>{t.promo_col_type}</th>
                  <th>{t.promo_col_value}</th>
                  <th>{t.promo_col_applies}</th>
                  <th>{t.promo_col_period}</th>
                  <th>{t.promo_col_status}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {promos.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-surface-400">{t.promo_no_data}</td></tr>
                ) : promos.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.name}</td>
                    <td><span className="badge badge-blue">{typeLabels[p.type]}</span></td>
                    <td className="font-mono">
                      {p.type === 'percentage' ? `${p.discount_value}%` : `LKR ${p.discount_value}`}
                    </td>
                    <td className="capitalize">{p.applies_to}</td>
                    <td className="text-xs text-surface-500">
                      {p.start_date ? `${p.start_date} → ${p.end_date || '∞'}` : t.promo_always}
                    </td>
                    <td>
                      <span className={`badge ${p.is_active ? 'badge-green' : 'badge-gray'}`}>
                        {p.is_active ? t.active : t.inactive}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(p)} className="btn-ghost btn-sm">{t.edit}</button>
                        <button onClick={() => handleDelete(p.id)} className="btn-sm text-red-500 hover:bg-red-50 rounded-lg px-2 py-1 text-xs font-medium">{t.del}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={isEditing ? t.promo_edit : t.promo_new}
        size="lg"
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className="btn-secondary">{t.cancel}</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? t.saving : t.save}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">{t.promo_name_label}</label>
            <input className="input" value={form.name || ''} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">{t.promo_type_label}</label>
              <select className="input" value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value as Promotion['type'] }))}>
                <option value="percentage">{t.promo_type_pct}</option>
                <option value="fixed_amount">{t.promo_type_fixed}</option>
                <option value="buy_x_get_y">{t.promo_type_bxgy}</option>
                <option value="free_item">{t.promo_type_free}</option>
              </select>
            </div>
            <div>
              <label className="label">{t.promo_discount_value}</label>
              <input type="number" className="input" value={form.discount_value || ''} onChange={(e) => setForm(f => ({ ...f, discount_value: parseFloat(e.target.value) || 0 }))} min="0" step="0.01" placeholder={form.type === 'percentage' ? '10 for 10%' : '5.00'} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">{t.promo_applies_label}</label>
              <select className="input" value={form.applies_to} onChange={(e) => setForm(f => ({ ...f, applies_to: e.target.value as Promotion['applies_to'] }))}>
                <option value="all">{t.promo_applies_all}</option>
                <option value="category">{t.promo_applies_cat}</option>
                <option value="product">{t.promo_applies_prod}</option>
              </select>
            </div>
            {form.applies_to === 'category' && (
              <div>
                <label className="label">Category</label>
                <select className="input" value={form.category_id || ''} onChange={(e) => setForm(f => ({ ...f, category_id: parseInt(e.target.value) }))}>
                  <option value="">Select category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            {form.applies_to === 'product' && (
              <div>
                <label className="label">Product</label>
                <select className="input" value={form.product_id || ''} onChange={(e) => setForm(f => ({ ...f, product_id: parseInt(e.target.value) }))}>
                  <option value="">Select product</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">{t.promo_start_date}</label>
              <input type="date" className="input" value={form.start_date || ''} onChange={(e) => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div>
              <label className="label">{t.promo_end_date}</label>
              <input type="date" className="input" value={form.end_date || ''} onChange={(e) => setForm(f => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded" checked={form.is_active !== false} onChange={(e) => setForm(f => ({ ...f, is_active: e.target.checked }))} />
              <span className="text-sm">{t.promo_active_label}</span>
            </label>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
