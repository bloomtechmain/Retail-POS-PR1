import { useState, useEffect, useCallback } from 'react';
import { PageContainer } from '../components/layout/Layout';
import { Modal } from '../components/ui/Modal';
import { PageLoader } from '../components/ui/LoadingSpinner';
import { useToastStore } from '../store/toastStore';
import { GRN, GRNItem, Supplier, Product } from '../types';
import api from '../services/api';
import { AxiosError } from 'axios';
import { useT } from '../i18n/translations';

const fmt = (n: number) => `LKR ${Number(n).toFixed(2)}`;

export default function GRNPage() {
  const t = useT();
  const toast = useToastStore();
  const [grns, setGrns] = useState<GRN[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [viewModal, setViewModal] = useState(false);
  const [returnModal, setReturnModal] = useState(false);
  const [selectedGRN, setSelectedGRN] = useState<GRN | null>(null);
  const [saving, setSaving] = useState(false);
  const [returnItems, setReturnItems] = useState<Record<number, string>>({});
  const [returnNotes, setReturnNotes] = useState('');

  const [form, setForm] = useState({
    supplier_id: '',
    invoice_number: '',
    received_date: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [items, setItems] = useState<Array<{ product_id: string; quantity: string; buying_price: string }>>([
    { product_id: '', quantity: '', buying_price: '' }
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [grnR, suppR, prodR] = await Promise.all([
        api.get('/grn?limit=50'),
        api.get('/grn/suppliers'),
        api.get('/products?limit=500'),
      ]);
      setGrns(grnR.data.data);
      setSuppliers(suppR.data.data);
      setProducts(prodR.data.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addItem = () => setItems(i => [...i, { product_id: '', quantity: '', buying_price: '' }]);
  const removeItem = (idx: number) => setItems(i => i.filter((_, j) => j !== idx));
  const updateItem = (idx: number, field: string, value: string) => {
    setItems(items.map((item, j) => j === idx ? { ...item, [field]: value } : item));
  };

  const totalAmount = items.reduce((sum, i) => {
    return sum + (parseFloat(i.quantity) || 0) * (parseFloat(i.buying_price) || 0);
  }, 0);

  const handleCreate = async () => {
    const validItems = items.filter(i => i.product_id && i.quantity && i.buying_price);
    if (validItems.length === 0) { toast.error('Add at least one product'); return; }
    setSaving(true);
    try {
      await api.post('/grn', {
        ...form,
        supplier_id: form.supplier_id ? parseInt(form.supplier_id) : undefined,
        items: validItems.map(i => ({
          product_id: parseInt(i.product_id),
          quantity: parseFloat(i.quantity),
          buying_price: parseFloat(i.buying_price),
        })),
      });
      toast.success('GRN created and stock updated');
      setCreateModal(false);
      load();
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Failed to create GRN');
    } finally { setSaving(false); }
  };

  const viewGRN = async (id: number) => {
    const r = await api.get(`/grn/${id}`);
    setSelectedGRN(r.data.data);
    setViewModal(true);
  };

  const openReturn = () => {
    const init: Record<number, string> = {};
    selectedGRN?.items?.forEach((i) => { init[i.id!] = ''; });
    setReturnItems(init);
    setReturnNotes('');
    setReturnModal(true);
  };

  const handleReturn = async () => {
    const itemsToReturn = selectedGRN?.items
      ?.filter((i) => parseFloat(returnItems[i.id!] || '0') > 0)
      .map((i) => ({
        grn_item_id: i.id,
        product_id: i.product_id,
        quantity: parseFloat(returnItems[i.id!]),
        buying_price: Number(i.buying_price),
      }));
    if (!itemsToReturn?.length) { toast.error('Enter quantity to return for at least one item'); return; }
    setSaving(true);
    try {
      await api.post(`/grn/${selectedGRN!.id}/return`, { items: itemsToReturn, notes: returnNotes });
      toast.success('GRN return processed and stock deducted');
      setReturnModal(false);
      setViewModal(false);
      load();
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Failed to process return');
    } finally { setSaving(false); }
  };

  return (
    <PageContainer>
      <div className="page-header">
        <h1 className="page-title">{t.grn_title}</h1>
        <button onClick={() => setCreateModal(true)} className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t.grn_add}
        </button>
      </div>

      {loading ? <PageLoader /> : (
        <div className="card">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.grn_col_grn}</th>
                  <th>{t.grn_col_date}</th>
                  <th>{t.grn_col_supplier}</th>
                  <th>{t.grn_col_invoice}</th>
                  <th className="text-right">{t.grn_col_total}</th>
                  <th>{t.by}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {grns.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-surface-400">{t.grn_no_data}</td></tr>
                ) : grns.map((g) => (
                  <tr key={g.id}>
                    <td className="font-mono text-primary-600">{g.grn_number}</td>
                    <td>{new Date(g.received_date).toLocaleDateString()}</td>
                    <td>{g.supplier_name || '—'}</td>
                    <td className="font-mono text-sm">{g.invoice_number || '—'}</td>
                    <td className="text-right font-mono font-semibold">{fmt(g.total_amount)}</td>
                    <td className="text-sm">{g.created_by_name}</td>
                    <td>
                      <button onClick={() => viewGRN(g.id)} className="btn-ghost btn-sm">{t.grn_view}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={createModal}
        onClose={() => setCreateModal(false)}
        title={t.grn_create_btn}
        size="full"
        footer={
          <>
            <button onClick={() => setCreateModal(false)} className="btn-secondary">{t.cancel}</button>
            <button onClick={handleCreate} disabled={saving} className="btn-primary">
              {saving ? t.grn_creating : `${t.grn_create_btn} ${fmt(totalAmount)}`}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">{t.grn_form_supplier}</label>
              <select className="input" value={form.supplier_id} onChange={(e) => setForm(f => ({ ...f, supplier_id: e.target.value }))}>
                <option value="">{t.grn_form_select_supplier}</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t.grn_form_invoice}</label>
              <input className="input" value={form.invoice_number} onChange={(e) => setForm(f => ({ ...f, invoice_number: e.target.value }))} placeholder="Optional" />
            </div>
            <div>
              <label className="label">{t.grn_form_date}</label>
              <input type="date" className="input" value={form.received_date} onChange={(e) => setForm(f => ({ ...f, received_date: e.target.value }))} />
            </div>
            <div>
              <label className="label">{t.grn_form_notes}</label>
              <input className="input" value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-surface-900">{t.grn_items_title}</h3>
              <button onClick={addItem} className="btn-ghost btn-sm">{t.grn_add_item}</button>
            </div>
            <table className="table border border-surface-200 rounded-lg overflow-hidden">
              <thead>
                <tr>
                  <th>{t.grn_col_item_product}</th>
                  <th>{t.quantity}</th>
                  <th>{t.grn_col_buying_price}</th>
                  <th className="text-right">{t.grn_col_subtotal}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx}>
                    <td>
                      <select className="input py-1.5 text-sm" value={item.product_id} onChange={(e) => updateItem(idx, 'product_id', e.target.value)}>
                        <option value="">{t.grn_select_product}</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                      </select>
                    </td>
                    <td>
                      <input type="number" className="input py-1.5 text-sm font-mono" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} placeholder="0" min="0" step="0.001" />
                    </td>
                    <td>
                      <input type="number" className="input py-1.5 text-sm font-mono" value={item.buying_price} onChange={(e) => updateItem(idx, 'buying_price', e.target.value)} placeholder="0.00" min="0" step="0.0001" />
                    </td>
                    <td className="text-right font-mono font-semibold">
                      {fmt((parseFloat(item.quantity) || 0) * (parseFloat(item.buying_price) || 0))}
                    </td>
                    <td>
                      <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="text-right font-semibold px-4 py-2 bg-surface-50">{t.grn_col_total}</td>
                  <td className="text-right font-bold font-mono px-4 py-2 bg-surface-50">{fmt(totalAmount)}</td>
                  <td className="bg-surface-50"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </Modal>

      {/* View Modal */}
      <Modal
        isOpen={viewModal}
        onClose={() => setViewModal(false)}
        title={`GRN: ${selectedGRN?.grn_number}`}
        size="xl"
        footer={
          <div className="flex justify-between w-full">
            <button
              onClick={openReturn}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 font-semibold text-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              Return Stock
            </button>
            <button onClick={() => setViewModal(false)} className="btn-secondary">Close</button>
          </div>
        }
      >
        {selectedGRN && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><span className="text-surface-500">{t.grn_view_supplier}: </span><span>{selectedGRN.supplier_name || '—'}</span></div>
              <div><span className="text-surface-500">{t.grn_view_invoice}: </span><span className="font-mono">{selectedGRN.invoice_number || '—'}</span></div>
              <div><span className="text-surface-500">{t.grn_view_date}: </span><span>{new Date(selectedGRN.received_date).toLocaleDateString()}</span></div>
              <div><span className="text-surface-500">{t.grn_view_total}: </span><span className="font-bold text-primary-600">{fmt(selectedGRN.total_amount)}</span></div>
            </div>
            <table className="table border border-surface-200 rounded-lg overflow-hidden">
              <thead>
                <tr>
                  <th>{t.grn_col_item_product}</th>
                  <th className="text-right">{t.quantity}</th>
                  <th className="text-right">{t.grn_col_buying_price}</th>
                  <th className="text-right">{t.grn_col_subtotal}</th>
                </tr>
              </thead>
              <tbody>
                {selectedGRN.items?.map((item) => (
                  <tr key={item.id}>
                    <td>{item.product_name}</td>
                    <td className="text-right font-mono">{item.quantity}</td>
                    <td className="text-right font-mono">{fmt(item.buying_price)}</td>
                    <td className="text-right font-mono font-semibold">{fmt(item.subtotal || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Return Modal */}
      <Modal
        isOpen={returnModal}
        onClose={() => setReturnModal(false)}
        title={`Return Stock — ${selectedGRN?.grn_number}`}
        size="xl"
        footer={
          <>
            <button onClick={() => setReturnModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleReturn} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 font-semibold text-sm disabled:opacity-40">
              {saving ? 'Processing…' : 'Confirm Return & Deduct Stock'}
            </button>
          </>
        }
      >
        {selectedGRN && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              Enter the quantity to return for each item. Stock will be deducted immediately.
            </div>
            <table className="table border border-surface-200 rounded-lg overflow-hidden">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="text-right">Received Qty</th>
                  <th className="text-right">Buying Price</th>
                  <th className="text-right w-36">Return Qty</th>
                </tr>
              </thead>
              <tbody>
                {selectedGRN.items?.map((item) => (
                  <tr key={item.id}>
                    <td>{item.product_name}</td>
                    <td className="text-right font-mono">{Number(item.quantity).toFixed(3)}</td>
                    <td className="text-right font-mono">{fmt(item.buying_price)}</td>
                    <td className="text-right">
                      <input
                        type="number"
                        className="input py-1 text-sm font-mono text-right w-28"
                        placeholder="0"
                        min="0"
                        max={Number(item.quantity)}
                        step="0.001"
                        value={returnItems[item.id!] ?? ''}
                        onChange={(e) => setReturnItems((r) => ({ ...r, [item.id!]: e.target.value }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div>
              <label className="label">Reason / Notes</label>
              <input
                className="input"
                placeholder="e.g. Damaged goods, wrong delivery"
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
              />
            </div>
          </div>
        )}
      </Modal>
    </PageContainer>
  );
}
