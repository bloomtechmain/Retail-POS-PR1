import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { PageContainer } from '../components/layout/Layout';
import { PageLoader } from '../components/ui/LoadingSpinner';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useToastStore } from '../store/toastStore';
import { useSettingsStore } from '../store/settingsStore';
import { TaxRate, Customer, Sale, SaleItem } from '../types';
import api from '../services/api';
import { AxiosError } from 'axios';
import { formatCurrency as fmt } from '../utils/formatCurrency';
import { generateVatInvoicePdf } from '../utils/generateVatInvoicePdf';

interface PendingSale {
  id: number;
  sale_number: string;
  total_amount: number;
  customer_name?: string;
  customer_id?: number;
  created_at: string;
  cashier_name: string;
}

// ─── Customer Picker — searches real customers, auto-fills VAT details for
// a customer already flagged is_vat_customer so a cashier never retypes them.
function CustomerPicker({ selected, onSelect }: { selected: Customer | null; onSelect: (c: Customer | null) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(debounce.current);
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    debounce.current = setTimeout(async () => {
      const r = await api.get(`/customers?search=${encodeURIComponent(q)}&limit=8`);
      setResults(r.data.data);
      setOpen(true);
    }, 200);
    return () => clearTimeout(debounce.current);
  }, [q]);

  if (selected) {
    return (
      <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-sm">
        <span className="font-medium text-orange-900">
          {selected.name} {selected.is_vat_customer && <span className="text-xs text-orange-500">(VAT)</span>}
        </span>
        <button onClick={() => onSelect(null)} className="text-orange-400 hover:text-orange-700">✕</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input className="input py-2 text-sm" placeholder="Search existing customers..." value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => results.length > 0 && setOpen(true)} />
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg border border-surface-200 shadow-xl z-50 overflow-hidden">
          {results.map((c) => (
            <button key={c.id} onMouseDown={() => { onSelect(c); setQ(''); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50 border-b border-surface-100 last:border-0">
              {c.name} <span className="text-surface-400">{c.phone}</span>
              {c.is_vat_customer && <span className="ml-1 text-xs text-orange-500">VAT</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function VatInvoice() {
  const toast = useToastStore();
  const { settings } = useSettingsStore();

  const [tab, setTab] = useState<'pending' | 'generated'>('pending');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingSale[]>([]);
  const [generated, setGenerated] = useState<Sale[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);

  // ── Generate panel state (set when a pending sale is opened) ──────────────
  const [saleDetail, setSaleDetail] = useState<Sale | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [taxMode, setTaxMode] = useState<'uniform' | 'per_item'>('uniform');
  const [uniformTaxIds, setUniformTaxIds] = useState<number[]>([]);
  const [itemTaxIds, setItemTaxIds] = useState<Record<number, number[]>>({});
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [buyerVatRegNo, setBuyerVatRegNo] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pendingR, generatedR, taxR] = await Promise.all([
        api.get('/vat-invoices/pending'),
        api.get('/vat-invoices'),
        api.get('/tax-rates?active_only=true'),
      ]);
      setPending(pendingR.data.data);
      setGenerated(generatedR.data.data);
      setTaxRates(taxR.data.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const missingSupplierFields = [
    !settings?.address?.trim() && 'Address',
    !settings?.phone?.trim() && 'Telephone',
    !settings?.vat_registration_number?.trim() && 'TIN Number',
  ].filter(Boolean) as string[];

  const openGenerate = async (sale: PendingSale) => {
    setLoadingDetail(true);
    setSaleDetail(null);
    setTaxMode('uniform');
    setUniformTaxIds([]);
    setItemTaxIds({});
    setCustomer(null);
    setCustomerName(sale.customer_name || '');
    setBuyerVatRegNo('');
    setBuyerAddress('');
    setBuyerPhone('');
    setDeliveryDate(new Date().toISOString().slice(0, 10));
    setPlaceOfSupply('');
    try {
      const r = await api.get(`/sales/${sale.id}`);
      setSaleDetail(r.data.data);
      if (sale.customer_id) {
        const cr = await api.get(`/customers/${sale.customer_id}`);
        selectCustomer(cr.data.data);
      }
    } finally { setLoadingDetail(false); }
  };

  const selectCustomer = (c: Customer | null) => {
    setCustomer(c);
    if (c) {
      setCustomerName(c.name);
      if (c.is_vat_customer && c.vat_reg_no) setBuyerVatRegNo(c.vat_reg_no);
      if (c.address) setBuyerAddress(c.address);
      if (c.phone) setBuyerPhone(c.phone);
    }
  };

  const toggleUniformTax = (taxId: number) => {
    setUniformTaxIds((prev) => prev.includes(taxId) ? prev.filter((id) => id !== taxId) : [...prev, taxId]);
  };

  const toggleItemTax = (saleItemId: number, taxId: number) => {
    setItemTaxIds((prev) => {
      const current = prev[saleItemId] || [];
      const next = current.includes(taxId) ? current.filter((id) => id !== taxId) : [...current, taxId];
      return { ...prev, [saleItemId]: next };
    });
  };

  const previewItemTax = (item: SaleItem, taxIds: number[]) => {
    return taxIds.reduce((sum, id) => {
      const t = taxRates.find((tr) => tr.id === id);
      return sum + (t ? (Number(item.subtotal) * Number(t.rate)) / 100 : 0);
    }, 0);
  };

  const handleGenerate = async () => {
    if (!saleDetail) return;
    if (missingSupplierFields.length > 0) {
      toast.error(`Fill in your business ${missingSupplierFields.join(', ')} in Settings first.`);
      return;
    }
    setGenerating(true);
    try {
      const r = await api.post(`/vat-invoices/${saleDetail.id}/generate`, {
        customer_id: customer?.id,
        customer_name: customer?.name || customerName || undefined,
        buyer_vat_reg_no: buyerVatRegNo || undefined,
        buyer_address: buyerAddress || undefined,
        buyer_phone: buyerPhone || undefined,
        delivery_date: deliveryDate || undefined,
        place_of_supply: placeOfSupply || undefined,
        tax_mode: taxMode,
        uniform_tax_ids: taxMode === 'uniform' ? uniformTaxIds : undefined,
        item_taxes: taxMode === 'per_item'
          ? Object.entries(itemTaxIds).map(([id, taxIds]) => ({ sale_item_id: Number(id), tax_ids: taxIds }))
          : undefined,
      });
      const full = await api.get(`/vat-invoices/${r.data.data.id}`);
      if (settings) {
        try { await generateVatInvoicePdf(full.data.data, settings); }
        catch { toast.error('Invoice generated, but the PDF could not be created'); }
      }
      toast.success(`Invoice ${r.data.data.vat_invoice_number} generated`);
      setSaleDetail(null);
      load();
      setTab('generated');
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Failed to generate invoice');
    } finally { setGenerating(false); }
  };

  const viewGenerated = async (sale: Sale) => {
    try {
      const r = await api.get(`/vat-invoices/${sale.id}`);
      if (settings) await generateVatInvoicePdf(r.data.data, settings);
    } catch {
      toast.error('Could not generate PDF');
    }
  };

  if (loading) return <PageLoader />;

  // ── Generate panel (a pending sale is open) ────────────────────────────────
  if (saleDetail) {
    return (
      <PageContainer>
        <div className="page-header">
          <h1 className="page-title">Generate VAT Invoice — {saleDetail.sale_number}</h1>
          <button onClick={() => setSaleDetail(null)} className="btn-secondary btn-sm">← Back</button>
        </div>

        {missingSupplierFields.length > 0 && (
          <div className="mb-4 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            <span>
              <strong>Supplier details required:</strong> your business {missingSupplierFields.join(', ')} {missingSupplierFields.length > 1 ? 'are' : 'is'} missing.
              Fill {missingSupplierFields.length > 1 ? 'them' : 'it'} in under <Link to="/settings" className="underline font-medium">Settings</Link>.
            </span>
          </div>
        )}

        {loadingDetail ? <PageLoader /> : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="card p-4">
                <label className="label text-xs">Tax Assignment</label>
                <div className="flex gap-2 mb-3">
                  <button onClick={() => setTaxMode('uniform')} className={`flex-1 py-2 rounded-lg text-sm font-medium ${taxMode === 'uniform' ? 'bg-primary-600 text-white' : 'bg-surface-100 text-surface-600'}`}>
                    Same tax for all items
                  </button>
                  <button onClick={() => setTaxMode('per_item')} className={`flex-1 py-2 rounded-lg text-sm font-medium ${taxMode === 'per_item' ? 'bg-primary-600 text-white' : 'bg-surface-100 text-surface-600'}`}>
                    Set tax per item
                  </button>
                </div>

                {taxMode === 'uniform' && (
                  taxRates.length === 0 ? (
                    <p className="text-xs text-surface-400">No tax rates configured — <Link to="/settings" className="text-primary-600 hover:underline font-medium">add one in Settings</Link>.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {taxRates.map((t) => {
                        const active = uniformTaxIds.includes(t.id);
                        return (
                          <button key={t.id} onClick={() => toggleUniformTax(t.id)}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${active ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-surface-600 border-surface-200 hover:border-primary-300'}`}>
                            {t.name} {Number(t.rate)}%
                          </button>
                        );
                      })}
                    </div>
                  )
                )}
              </div>

              <div className="card overflow-hidden">
                <div className="divide-y divide-surface-100">
                  {(saleDetail.items || []).map((item) => {
                    const activeTaxIds = itemTaxIds[item.id] || [];
                    const previewTax = taxMode === 'uniform' ? previewItemTax(item, uniformTaxIds) : previewItemTax(item, activeTaxIds);
                    return (
                      <div key={item.id} className="p-4 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-surface-900 truncate">{item.product_name}</p>
                            <p className="text-xs text-surface-400">{item.quantity} × {fmt(item.unit_price)} = {fmt(item.subtotal)}</p>
                          </div>
                          {previewTax > 0 && (
                            <div className="text-right shrink-0">
                              <p className="text-xs text-surface-400">Tax breakdown</p>
                              <p className="text-sm font-bold text-primary-600 font-mono">+{fmt(previewTax)}</p>
                            </div>
                          )}
                        </div>
                        {taxMode === 'per_item' && (
                          taxRates.length === 0 ? null : (
                            <div className="flex flex-wrap gap-1.5">
                              {taxRates.map((t) => {
                                const active = activeTaxIds.includes(t.id);
                                return (
                                  <button key={t.id} onClick={() => toggleItemTax(item.id, t.id)}
                                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${active ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-surface-600 border-surface-200 hover:border-primary-300'}`}>
                                    {t.name} {Number(t.rate)}%
                                  </button>
                                );
                              })}
                            </div>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="text-xs text-surface-400 px-1">
                The amount already charged ({fmt(saleDetail.total_amount)}) doesn't change — assigning taxes here only
                sets the itemized breakdown shown on the printed invoice.
              </p>
            </div>

            <div className="card p-5 space-y-4 h-fit">
              <div>
                <label className="label text-xs">Customer</label>
                <CustomerPicker selected={customer} onSelect={selectCustomer} />
              </div>
              <div>
                <label className="label text-xs">Buyer Name</label>
                <input className="input py-2 text-sm" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Walk-in Customer" />
              </div>
              <div>
                <label className="label text-xs">Purchaser's TIN Number</label>
                <input className="input py-2 text-sm font-mono" value={buyerVatRegNo} onChange={(e) => setBuyerVatRegNo(e.target.value)} placeholder="For B2B buyers" />
              </div>
              <div>
                <label className="label text-xs">Purchaser's Address</label>
                <textarea className="input py-2 text-sm" rows={2} value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs">Purchaser's Telephone</label>
                  <input className="input py-2 text-sm" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} />
                </div>
                <div>
                  <label className="label text-xs">Date of Delivery</label>
                  <input type="date" className="input py-2 text-sm" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label text-xs">Place of Supply</label>
                <input className="input py-2 text-sm" value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} />
              </div>

              <div className="border-t border-surface-100 pt-3 flex justify-between text-lg font-bold text-surface-900">
                <span>Total</span><span className="font-mono">{fmt(saleDetail.total_amount)}</span>
              </div>

              <button onClick={handleGenerate} disabled={generating || missingSupplierFields.length > 0} className="btn-success w-full py-3 text-base font-bold disabled:opacity-40">
                {generating ? <LoadingSpinner size="sm" /> : 'Generate Invoice'}
              </button>
            </div>
          </div>
        )}
      </PageContainer>
    );
  }

  // ── Queue + history ─────────────────────────────────────────────────────────
  return (
    <PageContainer>
      <div className="page-header">
        <h1 className="page-title">VAT Invoice</h1>
      </div>

      <p className="text-sm text-surface-500 mb-4">
        Mark a sale as a VAT Invoice at checkout on the <Link to="/pos" className="text-primary-600 hover:underline font-medium">POS</Link> page —
        it shows up here to generate.
      </p>

      <div className="flex gap-1 border-b border-surface-200 mb-4">
        {(['pending', 'generated'] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === k ? 'border-primary-600 text-primary-600' : 'border-transparent text-surface-500 hover:text-surface-700'}`}>
            {k === 'pending' ? `Pending (${pending.length})` : 'Generated'}
          </button>
        ))}
      </div>

      {tab === 'pending' ? (
        <div className="card">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr><th>Sale #</th><th>Customer</th><th>Cashier</th><th>Date</th><th className="text-right">Total</th><th></th></tr>
              </thead>
              <tbody>
                {pending.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-surface-400">No sales marked as VAT yet.</td></tr>
                ) : pending.map((sale) => (
                  <tr key={sale.id}>
                    <td className="font-mono text-sm">{sale.sale_number}</td>
                    <td>{sale.customer_name || 'Walk-in'}</td>
                    <td className="text-sm text-surface-500">{sale.cashier_name}</td>
                    <td className="text-sm text-surface-500">{new Date(sale.created_at).toLocaleString()}</td>
                    <td className="text-right font-mono font-semibold">{fmt(sale.total_amount)}</td>
                    <td><button onClick={() => openGenerate(sale)} className="btn-primary btn-sm">Generate</button></td>
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
                <tr><th>Invoice #</th><th>Customer</th><th>Date</th><th className="text-right">Total</th><th></th></tr>
              </thead>
              <tbody>
                {generated.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-surface-400">No invoices generated yet.</td></tr>
                ) : generated.map((sale) => (
                  <tr key={sale.id}>
                    <td className="font-mono text-sm">{sale.vat_invoice_number}</td>
                    <td>{sale.customer_name || 'Walk-in'}</td>
                    <td className="text-sm text-surface-500">{new Date(sale.created_at).toLocaleString()}</td>
                    <td className="text-right font-mono font-semibold">{fmt(sale.total_amount)}</td>
                    <td><button onClick={() => viewGenerated(sale)} className="btn-secondary btn-sm">Download PDF</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
