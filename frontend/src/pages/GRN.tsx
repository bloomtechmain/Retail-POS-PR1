import { useState, useEffect, useCallback, Fragment } from 'react';
import { PageContainer } from '../components/layout/Layout';
import { Modal } from '../components/ui/Modal';
import { PageLoader } from '../components/ui/LoadingSpinner';
import { useToastStore } from '../store/toastStore';
import { GRN, GRNItem, Supplier, Product } from '../types';
import api from '../services/api';
import { AxiosError } from 'axios';
import { useT } from '../i18n/translations';
import { formatCurrency as fmt } from '../utils/formatCurrency';
import { getUnitMeta, formatQuantity, getReceiveUnitOptions, convertToBaseUnit } from '../utils/units';

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
  const [supplierModal, setSupplierModal] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: '', contact_person: '', phone: '', email: '', address: '' });
  const [savingSupplier, setSavingSupplier] = useState(false);

  const [form, setForm] = useState({
    supplier_id: '',
    invoice_number: '',
    received_date: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [items, setItems] = useState<Array<{
    product_id: string; quantity: string; buying_price: string; expiry_date: string; receive_unit: string;
  }>>([
    { product_id: '', quantity: '', buying_price: '', expiry_date: '', receive_unit: '' }
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

  const getProductUnit = (productId: string | number) =>
    products.find(p => p.id === Number(productId))?.unit_type;

  const getProductCostingMethod = (productId: string | number) =>
    products.find(p => p.id === Number(productId))?.costing_method;

  const addItem = () => setItems(i => [...i, { product_id: '', quantity: '', buying_price: '', expiry_date: '', receive_unit: '' }]);
  const removeItem = (idx: number) => setItems(i => i.filter((_, j) => j !== idx));
  const updateItem = (idx: number, field: string, value: string) => {
    setItems(items.map((item, j) => {
      if (j !== idx) return item;
      // Switching products resets any expiry choice and defaults the receive
      // unit back to that product's own base unit
      if (field === 'product_id') return { ...item, product_id: value, expiry_date: '', receive_unit: getProductUnit(value) || '' };
      return { ...item, [field]: value };
    }));
  };

  // Quantity entered against a line, converted from whatever unit was picked
  // for that receipt (e.g. grams) into the product's own base unit (e.g. kg)
  // — everything downstream (subtotal, totals, the GRN payload) uses this.
  const getItemBaseQty = (item: typeof items[number]) =>
    convertToBaseUnit(parseFloat(item.quantity) || 0, item.receive_unit, getProductUnit(item.product_id));

  const totalAmount = items.reduce((sum, i) => {
    return sum + getItemBaseQty(i) * (parseFloat(i.buying_price) || 0);
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
          quantity: getItemBaseQty(i),
          buying_price: parseFloat(i.buying_price),
          expiry_date: getProductCostingMethod(i.product_id) === 'fifo' ? (i.expiry_date || undefined) : undefined,
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

  const handleAddSupplier = async () => {
    if (!newSupplier.name.trim()) { toast.error('Enter a supplier name'); return; }
    setSavingSupplier(true);
    try {
      const r = await api.post('/grn/suppliers', {
        name: newSupplier.name.trim(),
        contact_person: newSupplier.contact_person || undefined,
        phone: newSupplier.phone || undefined,
        email: newSupplier.email || undefined,
        address: newSupplier.address || undefined,
      });
      const created: Supplier = r.data.data;
      setSuppliers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((f) => ({ ...f, supplier_id: String(created.id) }));
      setSupplierModal(false);
      setNewSupplier({ name: '', contact_person: '', phone: '', email: '', address: '' });
      toast.success('Supplier added');
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Failed to add supplier');
    } finally { setSavingSupplier(false); }
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
              <div className="flex gap-1.5">
                <select className="input flex-1" value={form.supplier_id} onChange={(e) => setForm(f => ({ ...f, supplier_id: e.target.value }))}>
                  <option value="">{t.grn_form_select_supplier}</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button
                  type="button"
                  title="Add new supplier"
                  onClick={() => setSupplierModal(true)}
                  className="btn-secondary px-3 shrink-0"
                >
                  +
                </button>
              </div>
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
                {items.map((item, idx) => {
                  const showExpiry = getProductCostingMethod(item.product_id) === 'fifo';
                  const unitOptions = getReceiveUnitOptions(getProductUnit(item.product_id));
                  const receiveUnit = item.receive_unit || getProductUnit(item.product_id) || '';
                  const receiveMeta = unitOptions.find(o => o.value === receiveUnit);
                  const baseUnitAbbr = getUnitMeta(getProductUnit(item.product_id)).abbr;
                  return (
                    <Fragment key={idx}>
                      <tr>
                        <td>
                          <select className="input py-1.5 text-sm" value={item.product_id} onChange={(e) => updateItem(idx, 'product_id', e.target.value)}>
                            <option value="">{t.grn_select_product}</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                          </select>
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <input type="number" className="input py-1.5 text-sm font-mono" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} placeholder="0" min="0" step={receiveMeta?.step ?? getUnitMeta(getProductUnit(item.product_id)).step} />
                            {item.product_id && (
                              unitOptions.length > 1 ? (
                                <select
                                  className="input py-1 text-xs w-auto shrink-0"
                                  value={receiveUnit}
                                  onChange={(e) => updateItem(idx, 'receive_unit', e.target.value)}
                                >
                                  {unitOptions.map(o => <option key={o.value} value={o.value}>{o.abbr}</option>)}
                                </select>
                              ) : (
                                <span className="text-xs text-surface-400 shrink-0">{baseUnitAbbr}</span>
                              )
                            )}
                          </div>
                          {item.product_id && receiveUnit !== getProductUnit(item.product_id) && item.quantity && (
                            <div className="text-xs text-surface-400 mt-0.5">
                              = {formatQuantity(getItemBaseQty(item), getProductUnit(item.product_id))}
                            </div>
                          )}
                        </td>
                        <td>
                          <input type="number" className="input py-1.5 text-sm font-mono" value={item.buying_price} onChange={(e) => updateItem(idx, 'buying_price', e.target.value)} placeholder="0.00" min="0" step="0.0001" />
                          {item.product_id && <div className="text-xs text-surface-400 mt-0.5">per {baseUnitAbbr}</div>}
                        </td>
                        <td className="text-right font-mono font-semibold">
                          {fmt(getItemBaseQty(item) * (parseFloat(item.buying_price) || 0))}
                        </td>
                        <td>
                          <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                      {showExpiry && (
                        <tr className="bg-primary-50/40">
                          <td colSpan={5} className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <label className="text-xs font-medium text-surface-600 whitespace-nowrap">Expiry Date (optional)</label>
                              <input
                                type="date"
                                className="input py-1 text-xs"
                                value={item.expiry_date}
                                onChange={(e) => updateItem(idx, 'expiry_date', e.target.value)}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
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
                    <td className="text-right font-mono">{formatQuantity(item.quantity, getProductUnit(item.product_id))}</td>
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
                  <th className="text-right">{t.grn_col_buying_price}</th>
                  <th className="text-right w-36">Return Qty</th>
                </tr>
              </thead>
              <tbody>
                {selectedGRN.items?.map((item) => (
                  <tr key={item.id}>
                    <td>{item.product_name}</td>
                    <td className="text-right font-mono">{formatQuantity(item.quantity, getProductUnit(item.product_id))}</td>
                    <td className="text-right font-mono">{fmt(item.buying_price)}</td>
                    <td className="text-right">
                      <input
                        type="number"
                        className="input py-1 text-sm font-mono text-right w-28"
                        placeholder="0"
                        min="0"
                        max={Number(item.quantity)}
                        step={getUnitMeta(getProductUnit(item.product_id)).step}
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

      {/* Add Supplier Modal */}
      <Modal
        isOpen={supplierModal}
        onClose={() => setSupplierModal(false)}
        title="Add Supplier"
        size="sm"
        footer={
          <>
            <button onClick={() => setSupplierModal(false)} className="btn-secondary">{t.cancel}</button>
            <button onClick={handleAddSupplier} disabled={savingSupplier} className="btn-primary">
              {savingSupplier ? t.saving : 'Add Supplier'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label">Name <span className="text-red-500">*</span></label>
            <input className="input" value={newSupplier.name} onChange={(e) => setNewSupplier(s => ({ ...s, name: e.target.value }))} placeholder="Supplier name" autoFocus />
          </div>
          <div>
            <label className="label">Contact Person</label>
            <input className="input" value={newSupplier.contact_person} onChange={(e) => setNewSupplier(s => ({ ...s, contact_person: e.target.value }))} placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Phone</label>
              <input className="input" value={newSupplier.phone} onChange={(e) => setNewSupplier(s => ({ ...s, phone: e.target.value }))} placeholder="Optional" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" value={newSupplier.email} onChange={(e) => setNewSupplier(s => ({ ...s, email: e.target.value }))} placeholder="Optional" />
            </div>
          </div>
          <div>
            <label className="label">Address</label>
            <textarea className="input" rows={2} value={newSupplier.address} onChange={(e) => setNewSupplier(s => ({ ...s, address: e.target.value }))} placeholder="Optional" />
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
