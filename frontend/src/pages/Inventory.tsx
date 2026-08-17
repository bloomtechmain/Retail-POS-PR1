import { useState, useEffect, useCallback } from 'react';
import { PageContainer } from '../components/layout/Layout';
import { Modal } from '../components/ui/Modal';
import { PageLoader } from '../components/ui/LoadingSpinner';
import { useToastStore } from '../store/toastStore';
import api from '../services/api';
import { AxiosError } from 'axios';
import { useT } from '../i18n/translations';
import { formatCurrency as fmt } from '../utils/formatCurrency';
import { getUnitMeta, formatQuantity } from '../utils/units';
import { ProductBatch } from '../types';

interface Movement {
  id: number;
  product_name: string;
  sku: string;
  unit_type?: string;
  movement_type: string;
  quantity: number;
  balance_before: number;
  balance_after: number;
  unit_cost?: number;
  reference_type?: string;
  notes?: string;
  created_by_name?: string;
  created_at: string;
}

interface InventoryProduct {
  id: number;
  name: string;
  sku: string;
  barcode?: string;
  category_name?: string;
  unit_type?: string;
  costing_method?: string;
  current_stock: number;
  low_stock_level: number;
  avg_cost: number;
  selling_price: number;
  stock_value: number;
  retail_value: number;
  is_low_stock: boolean;
}

// movement labels resolved dynamically via t inside component

export default function Inventory() {
  const t = useT();
  const movementTypeLabel: Record<string, { label: string; color: string }> = {
    grn_in: { label: t.inventory_move_grn_in, color: 'badge-green' },
    sale_out: { label: t.inventory_move_sale_out, color: 'badge-red' },
    adjustment_in: { label: t.inventory_move_adj_in, color: 'badge-blue' },
    adjustment_out: { label: t.inventory_move_adj_out, color: 'badge-yellow' },
    return_in: { label: t.inventory_move_return, color: 'badge-green' },
    opening: { label: t.inventory_move_opening, color: 'badge-gray' },
  };
  const toast = useToastStore();
  const [tab, setTab] = useState<'stock' | 'movements'>('stock');
  const [stockData, setStockData] = useState<InventoryProduct[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [adjustModal, setAdjustModal] = useState(false);
  const [batchesModal, setBatchesModal] = useState(false);
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<InventoryProduct | null>(null);
  const [adjForm, setAdjForm] = useState({ adjustment_type: 'add', quantity: '', reason: '' });
  const [saving, setSaving] = useState(false);

  const loadStock = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/reports/inventory');
      setStockData(r.data.data);
    } finally { setLoading(false); }
  }, []);

  const loadMovements = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/inventory/movements?limit=100');
      setMovements(r.data.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === 'stock') loadStock();
    else loadMovements();
  }, [tab, loadStock, loadMovements]);

  const openAdjust = (p: InventoryProduct) => {
    setSelectedProduct(p);
    setAdjForm({ adjustment_type: 'add', quantity: '', reason: '' });
    setAdjustModal(true);
  };

  const openBatches = async (p: InventoryProduct) => {
    setSelectedProduct(p);
    setBatchesModal(true);
    setLoadingBatches(true);
    try {
      const r = await api.get(`/products/${p.id}/batches`);
      setBatches(r.data.data);
    } finally { setLoadingBatches(false); }
  };

  const handleAdjust = async () => {
    if (!selectedProduct || !adjForm.quantity || !adjForm.reason) {
      toast.error('Please fill all fields');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/inventory/adjust/${selectedProduct.id}`, {
        adjustment_type: adjForm.adjustment_type,
        quantity: parseFloat(adjForm.quantity),
        reason: adjForm.reason,
      });
      toast.success('Inventory adjusted');
      setAdjustModal(false);
      loadStock();
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Adjustment failed');
    } finally { setSaving(false); }
  };

  return (
    <PageContainer>
      <div className="page-header">
        <h1 className="page-title">{t.inventory_title}</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-surface-200 mb-4">
        {(['stock', 'movements'] as const).map((tabKey) => (
          <button key={tabKey} onClick={() => setTab(tabKey)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === tabKey ? 'border-primary-600 text-primary-600' : 'border-transparent text-surface-500 hover:text-surface-700'
            }`}>
            {tabKey === 'stock' ? t.inventory_tab_stock : t.inventory_tab_movements}
          </button>
        ))}
      </div>

      {loading ? <PageLoader /> : tab === 'stock' ? (
        <div className="card">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.inventory_col_product}</th>
                  <th>{t.inventory_col_category}</th>
                  <th className="text-right">{t.inventory_col_stock}</th>
                  <th className="text-right">{t.inventory_col_avg_cost}</th>
                  <th className="text-right">{t.inventory_col_stock_value}</th>
                  <th className="text-right">{t.inventory_col_retail_value}</th>
                  <th>{t.inventory_col_status}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {stockData.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-surface-400 font-mono">{p.sku}</div>
                    </td>
                    <td>{p.category_name || '—'}</td>
                    <td className="text-right font-mono">{formatQuantity(p.current_stock, p.unit_type)}</td>
                    <td className="text-right font-mono">{fmt(p.avg_cost, 4)}</td>
                    <td className="text-right font-mono">{fmt(p.stock_value)}</td>
                    <td className="text-right font-mono">{fmt(p.retail_value)}</td>
                    <td>
                      <span className={`badge ${p.is_low_stock ? 'badge-red' : 'badge-green'}`}>
                        {p.is_low_stock ? t.inventory_low_stock : t.inventory_ok}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1 justify-end">
                        {p.costing_method === 'fifo' && (
                          <button onClick={() => openBatches(p)} className="btn-ghost btn-sm">View Batches</button>
                        )}
                        <button onClick={() => openAdjust(p)} className="btn-ghost btn-sm">{t.inventory_adjust_btn}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.inventory_col_date}</th>
                  <th>{t.inventory_col_product}</th>
                  <th>{t.inventory_col_type}</th>
                  <th className="text-right">{t.inventory_col_qty}</th>
                  <th className="text-right">{t.inventory_col_before}</th>
                  <th className="text-right">{t.inventory_col_after}</th>
                  <th>{t.inventory_col_by}</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => {
                  const typeInfo = movementTypeLabel[m.movement_type] || { label: m.movement_type, color: 'badge-gray' };
                  return (
                    <tr key={m.id}>
                      <td className="text-xs text-surface-500">
                        {new Date(m.created_at).toLocaleDateString()} {new Date(m.created_at).toLocaleTimeString()}
                      </td>
                      <td>
                        <div className="font-medium">{m.product_name}</div>
                        <div className="text-xs text-surface-400 font-mono">{m.sku}</div>
                      </td>
                      <td><span className={`badge ${typeInfo.color}`}>{typeInfo.label}</span></td>
                      <td className="text-right font-mono">{formatQuantity(m.quantity, m.unit_type)}</td>
                      <td className="text-right font-mono text-surface-500">{formatQuantity(m.balance_before, m.unit_type)}</td>
                      <td className="text-right font-mono font-semibold">{formatQuantity(m.balance_after, m.unit_type)}</td>
                      <td className="text-sm">{m.created_by_name || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Adjustment Modal */}
      <Modal
        isOpen={adjustModal}
        onClose={() => setAdjustModal(false)}
        title={`${t.inventory_adjust_title}: ${selectedProduct?.name}`}
        size="sm"
        footer={
          <>
            <button onClick={() => setAdjustModal(false)} className="btn-secondary">{t.cancel}</button>
            <button onClick={handleAdjust} disabled={saving} className="btn-primary">
              {saving ? t.saving : t.inventory_apply}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="bg-surface-50 rounded-lg p-3 text-sm">
            <span className="text-surface-500">{t.inventory_current_stock} </span>
            <span className="font-bold">{formatQuantity(selectedProduct?.current_stock ?? 0, selectedProduct?.unit_type)}</span>
          </div>
          <div>
            <label className="label">{t.inventory_adj_type}</label>
            <select className="input" value={adjForm.adjustment_type} onChange={(e) => setAdjForm(f => ({ ...f, adjustment_type: e.target.value }))}>
              <option value="add">{t.inventory_adj_add}</option>
              <option value="subtract">{t.inventory_adj_subtract}</option>
              <option value="set">{t.inventory_adj_set}</option>
            </select>
          </div>
          <div>
            <label className="label">{t.quantity} ({getUnitMeta(selectedProduct?.unit_type).abbr})</label>
            <input type="number" className="input" value={adjForm.quantity} onChange={(e) => setAdjForm(f => ({ ...f, quantity: e.target.value }))} min="0" step={getUnitMeta(selectedProduct?.unit_type).step} />
          </div>
          <div>
            <label className="label">{t.inventory_adj_reason}</label>
            <input type="text" className="input" value={adjForm.reason} onChange={(e) => setAdjForm(f => ({ ...f, reason: e.target.value }))} placeholder={t.inventory_adj_reason_placeholder} />
          </div>
        </div>
      </Modal>

      {/* Batches Modal */}
      <Modal
        isOpen={batchesModal}
        onClose={() => setBatchesModal(false)}
        title={`Batches: ${selectedProduct?.name}`}
        size="lg"
        footer={<button onClick={() => setBatchesModal(false)} className="btn-secondary">{t.cancel}</button>}
      >
        {loadingBatches ? (
          <PageLoader />
        ) : batches.length === 0 ? (
          <p className="text-center py-8 text-surface-400 text-sm">No batches yet.</p>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Received</th>
                  <th>Expiry</th>
                  <th className="text-right">Remaining</th>
                  <th className="text-right">Received Qty</th>
                  <th className="text-right">Unit Cost</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td className="font-mono text-xs">{b.batch_number}</td>
                    <td className="text-sm">{new Date(b.received_date).toLocaleDateString()}</td>
                    <td className="text-sm">{b.expiry_date ? new Date(b.expiry_date).toLocaleDateString() : '—'}</td>
                    <td className="text-right font-mono">{formatQuantity(b.quantity_remaining, selectedProduct?.unit_type)}</td>
                    <td className="text-right font-mono text-surface-500">{formatQuantity(b.quantity_received, selectedProduct?.unit_type)}</td>
                    <td className="text-right font-mono">{fmt(b.unit_cost, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </PageContainer>
  );
}
