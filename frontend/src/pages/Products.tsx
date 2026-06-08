import { useState, useEffect, useCallback } from 'react';
import { PageContainer } from '../components/layout/Layout';
import { Modal } from '../components/ui/Modal';
import { PageLoader } from '../components/ui/LoadingSpinner';
import { Product, Category, Brand } from '../types';
import { useToastStore } from '../store/toastStore';
import api from '../services/api';
import { AxiosError } from 'axios';
import { useT } from '../i18n/translations';

const fmt = (n: number) => `LKR ${Number(n).toFixed(2)}`;

const EMPTY: Partial<Product> = {
  name: '', name_en: '', barcode: '', sku: '', selling_price: 0, cost_price: 0,
  unit_type: 'piece', current_stock: 0, low_stock_level: 5,
  tax_rate: 0, is_active: true, allow_negative_stock: true,
};

export default function Products() {
  const t = useT();
  const toast = useToastStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Partial<Product>>(EMPTY);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ active_only: 'false', limit: '200' });
      if (search) params.set('search', search);
      if (categoryFilter) params.set('category_id', categoryFilter);
      const r = await api.get(`/products?${params}`);
      setProducts(r.data.data);
    } finally { setLoading(false); }
  }, [search, categoryFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/products/categories').then(r => setCategories(r.data.data));
    api.get('/products/brands').then(r => setBrands(r.data.data));
  }, []);

  const openCreate = () => { setEditProduct(EMPTY); setIsEditing(false); setModalOpen(true); };
  const openEdit = (p: Product) => { setEditProduct({ ...p }); setIsEditing(true); setModalOpen(true); };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isEditing) {
        await api.put(`/products/${editProduct.id}`, editProduct);
        toast.success('Product updated');
      } else {
        await api.post('/products', editProduct);
        toast.success('Product created');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this product?')) return;
    try {
      await api.delete(`/products/${id}`);
      toast.success('Product deleted');
      load();
    } catch {
      toast.error('Delete failed');
    }
  };

  return (
    <PageContainer>
      <div className="page-header">
        <h1 className="page-title">{t.products_title}</h1>
        <button onClick={openCreate} className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t.products_add}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text" className="input w-full sm:max-w-xs"
          placeholder={t.products_search_placeholder}
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input w-full sm:max-w-[180px]" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">{t.products_all_categories}</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? <PageLoader /> : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.products_col_name}</th>
                  <th>{t.products_col_sku}</th>
                  <th>{t.products_col_category}</th>
                  <th className="text-right">{t.products_col_cost}</th>
                  <th className="text-right">{t.products_col_price}</th>
                  <th className="text-right">{t.products_col_stock}</th>
                  <th>{t.products_col_status}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-surface-400">{t.products_no_data}</td></tr>
                ) : products.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">
                      <div>{p.name}</div>
                      {p.name_en && <div className="text-xs text-surface-400">{p.name_en}</div>}
                    </td>
                    <td className="font-mono text-xs">
                      <div>{p.sku}</div>
                      {p.barcode && <div className="text-surface-400">{p.barcode}</div>}
                    </td>
                    <td>{p.category_name || '—'}</td>
                    <td className="text-right font-mono">{fmt(p.avg_cost || p.cost_price)}</td>
                    <td className="text-right font-mono font-semibold">{fmt(p.selling_price)}</td>
                    <td className="text-right">
                      <span className={`badge ${
                        p.current_stock <= 0 ? 'badge-red' :
                        p.current_stock <= p.low_stock_level ? 'badge-yellow' : 'badge-green'
                      }`}>
                        {Number(p.current_stock).toFixed(p.unit_type === 'kg' ? 3 : 0)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${p.is_active ? 'badge-green' : 'badge-gray'}`}>
                        {p.is_active ? t.active : t.inactive}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(p)} className="btn-ghost btn-sm">{t.edit}</button>
                        <button onClick={() => handleDelete(p.id)} className="btn-sm text-red-500 hover:bg-red-50 rounded-lg px-2 py-1 text-xs font-medium">{t.del}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={isEditing ? t.products_edit : t.products_new}
        size="xl"
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className="btn-secondary">{t.cancel}</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? t.saving : t.products_save}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">{t.products_name_label} <span className="font-normal text-surface-400">{t.products_name_hint}</span></label>
            <input className="input" value={editProduct.name || ''} onChange={(e) => setEditProduct(p => ({ ...p, name: e.target.value }))} placeholder={t.products_name_placeholder} />
          </div>
          <div className="col-span-2">
            <label className="label">{t.products_name_en_label} <span className="font-normal text-surface-400">{t.products_name_en_hint}</span></label>
            <input className="input" value={editProduct.name_en || ''} onChange={(e) => setEditProduct(p => ({ ...p, name_en: e.target.value }))} placeholder={t.products_name_en_placeholder} />
          </div>
          <div>
            <label className="label">{t.products_barcode}</label>
            <input className="input font-mono" value={editProduct.barcode || ''} onChange={(e) => setEditProduct(p => ({ ...p, barcode: e.target.value }))} placeholder={t.products_barcode_placeholder} />
          </div>
          <div>
            <label className="label">{t.products_sku}</label>
            <input className="input font-mono" value={editProduct.sku || ''} onChange={(e) => setEditProduct(p => ({ ...p, sku: e.target.value }))} placeholder={t.products_sku_placeholder} />
          </div>
          <div>
            <label className="label">{t.products_selling_price}</label>
            <input type="number" className="input" value={editProduct.selling_price || ''} onChange={(e) => setEditProduct(p => ({ ...p, selling_price: parseFloat(e.target.value) || 0 }))} min="0" step="0.01" />
          </div>
          <div>
            <label className="label">{t.products_cost_price}</label>
            <input type="number" className="input" value={editProduct.cost_price || ''} onChange={(e) => setEditProduct(p => ({ ...p, cost_price: parseFloat(e.target.value) || 0 }))} min="0" step="0.01" />
          </div>
          <div>
            <label className="label">{t.category}</label>
            <select className="input" value={editProduct.category_id || ''} onChange={(e) => setEditProduct(p => ({ ...p, category_id: parseInt(e.target.value) || undefined }))}>
              <option value="">{t.products_all_categories}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t.products_unit_type}</label>
            <select className="input" value={editProduct.unit_type || 'piece'} onChange={(e) => setEditProduct(p => ({ ...p, unit_type: e.target.value }))}>
              <option value="piece">{t.products_unit_piece}</option>
              <option value="kg">{t.products_unit_kg}</option>
              <option value="litre">{t.products_unit_litre}</option>
              <option value="box">{t.products_unit_box}</option>
              <option value="pack">{t.products_unit_pack}</option>
              <option value="dozen">{t.products_unit_dozen}</option>
            </select>
          </div>
          <div>
            <label className="label">{t.products_opening_stock}</label>
            <input type="number" className="input" value={editProduct.current_stock || ''} onChange={(e) => setEditProduct(p => ({ ...p, current_stock: parseFloat(e.target.value) || 0 }))} min="0" step="0.001" />
          </div>
          <div>
            <label className="label">{t.products_low_stock_alert}</label>
            <input type="number" className="input" value={editProduct.low_stock_level || ''} onChange={(e) => setEditProduct(p => ({ ...p, low_stock_level: parseFloat(e.target.value) || 5 }))} min="0" />
          </div>
          <div>
            <label className="label">{t.products_tax_rate}</label>
            <input type="number" className="input" value={editProduct.tax_rate || ''} onChange={(e) => setEditProduct(p => ({ ...p, tax_rate: parseFloat(e.target.value) || 0 }))} min="0" max="100" step="0.01" />
          </div>
          <div className="flex items-center gap-4 pt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded" checked={editProduct.is_active !== false} onChange={(e) => setEditProduct(p => ({ ...p, is_active: e.target.checked }))} />
              <span className="text-sm">{t.active}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded" checked={editProduct.allow_negative_stock !== false} onChange={(e) => setEditProduct(p => ({ ...p, allow_negative_stock: e.target.checked }))} />
              <span className="text-sm">{t.products_allow_negative}</span>
            </label>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
