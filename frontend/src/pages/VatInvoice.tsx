import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageContainer } from '../components/layout/Layout';
import { Modal } from '../components/ui/Modal';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useToastStore } from '../store/toastStore';
import { useSettingsStore } from '../store/settingsStore';
import { Product, TaxRate, Customer, Sale } from '../types';
import api from '../services/api';
import { AxiosError } from 'axios';
import { formatCurrency as fmt } from '../utils/formatCurrency';
import { getUnitMeta } from '../utils/units';
import { generateVatInvoicePdf } from '../utils/generateVatInvoicePdf';

const round2 = (v: number) => Math.round(v * 100) / 100;

interface VatCartItem {
  product_id: number;
  product_name: string;
  sku: string;
  unit_type?: string;
  quantity: number;
  unit_price: number;
  original_price: number;
  cost_price: number;
  item_discount: number;
  taxIds: number[];
}

// ─── Product Search ─────────────────────────────────────────────────────────
function ProductSearch({ onAdd }: { onAdd: (p: Product) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(debounce.current);
    if (!query.trim()) { setResults([]); setOpen(false); return; }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api.get(`/products?search=${encodeURIComponent(query)}&limit=8`);
        setResults(r.data.data);
        setOpen(r.data.data.length > 0);
      } finally { setLoading(false); }
    }, 180);
    return () => clearTimeout(debounce.current);
  }, [query]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const pick = (p: Product) => { onAdd(p); setQuery(''); setResults([]); setOpen(false); inputRef.current?.focus(); };

  return (
    <div className="relative" ref={wrapperRef}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Search product by name, SKU, or barcode..."
        className="input pl-4 pr-10 py-3 text-base w-full"
        autoComplete="off"
      />
      {loading && <div className="absolute right-3 top-1/2 -translate-y-1/2"><LoadingSpinner size="sm" /></div>}
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-surface-200 shadow-xl z-50 overflow-hidden">
          {results.map((p) => (
            <button key={p.id} onMouseDown={() => pick(p)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-50 border-b border-surface-100 last:border-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-surface-900 truncate">{p.name}</p>
                <p className="text-xs text-surface-400 font-mono">{p.sku}</p>
              </div>
              <p className="text-sm font-bold text-primary-600 shrink-0">{fmt(p.selling_price)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Customer Picker (credit payment) ──────────────────────────────────────
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
        <span className="font-medium text-orange-900">{selected.name}</span>
        <button onClick={() => onSelect(null)} className="text-orange-400 hover:text-orange-700">✕</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input className="input py-2 text-sm" placeholder="Search customer..." value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => results.length > 0 && setOpen(true)} />
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg border border-surface-200 shadow-xl z-50 overflow-hidden">
          {results.map((c) => (
            <button key={c.id} onMouseDown={() => { onSelect(c); setQ(''); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50 border-b border-surface-100 last:border-0">
              {c.name} <span className="text-surface-400">{c.phone}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function VatInvoice() {
  const toast = useToastStore();
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const [hasShift, setHasShift] = useState<boolean | null>(null);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [cart, setCart] = useState<VatCartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [buyerVatRegNo, setBuyerVatRegNo] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [billDiscount, setBillDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'mixed' | 'credit'>('cash');
  const [cashTendered, setCashTendered] = useState('');
  const [cardAmount, setCardAmount] = useState('');
  const [creditCustomer, setCreditCustomer] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<Sale | null>(null);

  useEffect(() => {
    api.get('/shifts/current').then((r) => setHasShift(!!r.data.data)).catch(() => setHasShift(false));
    api.get('/tax-rates?active_only=true').then((r) => setTaxRates(r.data.data)).catch(() => {});
  }, []);

  const addProduct = (p: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === p.id);
      if (existing) {
        return prev.map((i) => i.product_id === p.id ? { ...i, quantity: round2(i.quantity + 1) } : i);
      }
      return [...prev, {
        product_id: p.id,
        product_name: p.name,
        sku: p.sku,
        unit_type: p.unit_type,
        quantity: 1,
        unit_price: Number(p.selling_price),
        original_price: Number(p.selling_price),
        cost_price: Number(p.avg_cost || p.cost_price),
        item_discount: 0,
        taxIds: [],
      }];
    });
  };

  const updateItem = (productId: number, patch: Partial<VatCartItem>) => {
    setCart((prev) => prev.map((i) => i.product_id === productId ? { ...i, ...patch } : i));
  };

  const toggleTax = (productId: number, taxId: number) => {
    setCart((prev) => prev.map((i) => {
      if (i.product_id !== productId) return i;
      const has = i.taxIds.includes(taxId);
      return { ...i, taxIds: has ? i.taxIds.filter((id) => id !== taxId) : [...i.taxIds, taxId] };
    }));
  };

  const removeItem = (productId: number) => setCart((prev) => prev.filter((i) => i.product_id !== productId));

  const lineTaxable = (item: VatCartItem) => round2((item.unit_price - item.item_discount) * item.quantity);
  const lineTax = (item: VatCartItem) => {
    const taxable = lineTaxable(item);
    return round2(item.taxIds.reduce((sum, id) => {
      const t = taxRates.find((tr) => tr.id === id);
      return sum + (t ? round2((taxable * Number(t.rate)) / 100) : 0);
    }, 0));
  };
  const lineTotal = (item: VatCartItem) => round2(lineTaxable(item) + lineTax(item));

  const subtotal = round2(cart.reduce((s, i) => s + i.unit_price * i.quantity, 0));
  const itemDiscountTotal = round2(cart.reduce((s, i) => s + i.item_discount * i.quantity, 0));
  const taxTotal = round2(cart.reduce((s, i) => s + lineTax(i), 0));
  const maxBillDiscount = Math.max(0, round2(subtotal - itemDiscountTotal));
  const clampedBillDiscount = Math.min(billDiscount, maxBillDiscount);
  const grandTotal = Math.max(0, round2(subtotal - itemDiscountTotal - clampedBillDiscount + taxTotal));

  const cashVal = parseFloat(cashTendered) || 0;
  const cardVal = parseFloat(cardAmount) || 0;
  const change = paymentMethod === 'cash' ? Math.max(0, cashVal - grandTotal)
    : paymentMethod === 'mixed' ? Math.max(0, cashVal + cardVal - grandTotal) : 0;
  const isValid = cart.length > 0 && (
    paymentMethod === 'cash' ? cashVal >= grandTotal :
    paymentMethod === 'card' ? true :
    paymentMethod === 'mixed' ? cashVal + cardVal >= grandTotal :
    !!creditCustomer
  );

  const resetForm = () => {
    setCart([]); setCustomerName(''); setBuyerVatRegNo(''); setBuyerAddress(''); setBuyerPhone('');
    setPlaceOfSupply(''); setDeliveryDate(new Date().toISOString().slice(0, 10)); setBillDiscount(0);
    setPaymentMethod('cash'); setCashTendered(''); setCardAmount(''); setCreditCustomer(null);
  };

  // Selecting a registered credit customer pre-fills their known address/phone
  // onto the invoice (still editable — a walk-in buyer has none of this on file).
  const selectCreditCustomer = (c: Customer | null) => {
    setCreditCustomer(c);
    if (c) {
      if (c.address) setBuyerAddress(c.address);
      if (c.phone) setBuyerPhone(c.phone);
    }
  };

  const missingSupplierFields = [
    !settings?.address?.trim() && 'Address',
    !settings?.phone?.trim() && 'Telephone',
    !settings?.vat_registration_number?.trim() && 'TIN Number',
  ].filter(Boolean) as string[];

  const handleCreate = async () => {
    if (missingSupplierFields.length > 0) {
      setShowSupplierModal(true);
      return;
    }
    if (!isValid) { toast.error('Check payment amount / customer selection'); return; }
    setSaving(true);
    try {
      const r = await api.post('/vat-invoices', {
        cart_items: cart.map((i) => ({
          product_id: i.product_id,
          product_name: i.product_name,
          sku: i.sku,
          quantity: i.quantity,
          unit_price: i.unit_price,
          original_price: i.original_price,
          cost_price: i.cost_price,
          item_discount: i.item_discount,
          taxes: i.taxIds.map((id) => {
            const t = taxRates.find((tr) => tr.id === id)!;
            return { tax_rate_id: t.id, name: t.name, rate: Number(t.rate) };
          }),
        })),
        bill_discount: clampedBillDiscount,
        payment_method: paymentMethod,
        cash_tendered: cashVal,
        card_amount: cardVal,
        customer_id: creditCustomer?.id,
        customer_name: creditCustomer?.name || customerName || undefined,
        buyer_vat_reg_no: buyerVatRegNo || undefined,
        buyer_address: buyerAddress || undefined,
        buyer_phone: buyerPhone || undefined,
        delivery_date: deliveryDate || undefined,
        place_of_supply: placeOfSupply || undefined,
      });
      const full = await api.get(`/vat-invoices/${r.data.data.id}`);
      setLastInvoice(full.data.data);
      if (settings) {
        try { await generateVatInvoicePdf(full.data.data, settings); }
        catch { toast.error('Invoice saved, but the PDF could not be generated'); }
      }
      toast.success(`VAT Invoice ${r.data.data.vat_invoice_number} created`);
      resetForm();
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Failed to create VAT invoice');
    } finally { setSaving(false); }
  };

  if (hasShift === null) return <div className="flex items-center justify-center h-screen"><LoadingSpinner size="lg" /></div>;
  if (hasShift === false) {
    return (
      <PageContainer>
        <div className="card p-8 max-w-sm mx-auto text-center space-y-3">
          <h2 className="text-lg font-semibold text-surface-900">No Open Shift</h2>
          <p className="text-sm text-surface-500">Open a shift from the POS page before creating VAT invoices.</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="page-header">
        <h1 className="page-title">VAT Invoice</h1>
        {lastInvoice && (
          <button onClick={() => { try { settings && generateVatInvoicePdf(lastInvoice, settings); } catch { toast.error('Could not generate PDF'); } }} className="btn-secondary btn-sm">
            Re-download last invoice ({lastInvoice.vat_invoice_number})
          </button>
        )}
      </div>

      {missingSupplierFields.length > 0 && (
        <div className="mb-4 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>
            <strong>Supplier details required:</strong> your business {missingSupplierFields.join(', ')} {missingSupplierFields.length > 1 ? 'are' : 'is'} missing.
            Fill {missingSupplierFields.length > 1 ? 'them' : 'it'} in under <Link to="/settings" className="underline font-medium">Settings</Link> before creating a Tax Invoice.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-4">
            <ProductSearch onAdd={addProduct} />
            <p className="text-xs text-surface-400 mt-2">
              Search and add products, then choose which taxes apply to each line below.
              Need to add or edit a tax? <Link to="/settings" className="text-primary-600 hover:underline font-medium">Manage tax rates in Settings</Link>.
            </p>
          </div>

          <div className="card overflow-hidden">
            {cart.length === 0 ? (
              <p className="text-center py-12 text-surface-400 text-sm">Search and add products above.</p>
            ) : (
              <div className="divide-y divide-surface-100">
                {cart.map((item) => (
                  <div key={item.product_id} className="p-4 space-y-2.5">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-surface-900 truncate">{item.product_name}</p>
                        <p className="text-xs text-surface-400 font-mono">{item.sku}</p>
                      </div>
                      <button onClick={() => removeItem(item.product_id)} className="text-surface-300 hover:text-red-500 shrink-0">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <label className="label text-xs">Qty ({getUnitMeta(item.unit_type).abbr})</label>
                        <input type="number" className="input py-1.5 text-sm w-24 font-mono" value={item.quantity}
                          onChange={(e) => updateItem(item.product_id, { quantity: parseFloat(e.target.value) || 0 })}
                          min="0" step={getUnitMeta(item.unit_type).step} />
                      </div>
                      <div>
                        <label className="label text-xs">Unit Price</label>
                        <input type="number" className="input py-1.5 text-sm w-28 font-mono" value={item.unit_price}
                          onChange={(e) => updateItem(item.product_id, { unit_price: parseFloat(e.target.value) || 0 })}
                          min="0" step="0.01" />
                      </div>
                      <div>
                        <label className="label text-xs">Discount / unit</label>
                        <input type="number" className="input py-1.5 text-sm w-28 font-mono" value={item.item_discount || ''}
                          onChange={(e) => updateItem(item.product_id, { item_discount: parseFloat(e.target.value) || 0 })}
                          min="0" step="0.01" placeholder="0.00" />
                      </div>
                      <div className="ml-auto text-right">
                        <p className="text-xs text-surface-400">Line Total</p>
                        <p className="text-lg font-bold text-surface-900 font-mono">{fmt(lineTotal(item))}</p>
                      </div>
                    </div>

                    <div>
                      <label className="label text-xs">Taxes</label>
                      {taxRates.length === 0 ? (
                        <p className="text-xs text-surface-400">
                          No tax rates configured — <Link to="/settings" className="text-primary-600 hover:underline font-medium">add one in Settings</Link>.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {taxRates.map((t) => {
                            const active = item.taxIds.includes(t.id);
                            return (
                              <button
                                key={t.id}
                                onClick={() => toggleTax(item.product_id, t.id)}
                                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                                  active ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-surface-600 border-surface-200 hover:border-primary-300'
                                }`}
                              >
                                {t.name} {Number(t.rate)}%
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Bill summary + payment */}
        <div className="card p-5 space-y-4 h-fit">
          <div>
            <label className="label text-xs">Customer Name</label>
            <input className="input py-2 text-sm" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Walk-in Customer" />
          </div>
          <div>
            <label className="label text-xs">Purchaser's TIN Number (optional)</label>
            <input className="input py-2 text-sm font-mono" value={buyerVatRegNo} onChange={(e) => setBuyerVatRegNo(e.target.value)} placeholder="For B2B buyers" />
          </div>
          <div>
            <label className="label text-xs">Purchaser's Address</label>
            <textarea className="input py-2 text-sm" rows={2} value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Purchaser's Telephone</label>
              <input className="input py-2 text-sm" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <label className="label text-xs">Date of Delivery</label>
              <input type="date" className="input py-2 text-sm" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label text-xs">Place of Supply</label>
            <input className="input py-2 text-sm" value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label className="label text-xs">Bill Discount ({settings?.currency_symbol ?? '$'})</label>
            <input type="number" className="input py-2 text-sm font-mono" value={billDiscount || ''} onChange={(e) => setBillDiscount(parseFloat(e.target.value) || 0)} min="0" step="0.01" placeholder="0.00" />
          </div>

          <div className="border-t border-surface-100 pt-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-surface-600"><span>Subtotal</span><span className="font-mono">{fmt(subtotal)}</span></div>
            {itemDiscountTotal > 0 && <div className="flex justify-between text-red-500"><span>Item Discounts</span><span className="font-mono">-{fmt(itemDiscountTotal)}</span></div>}
            {clampedBillDiscount > 0 && <div className="flex justify-between text-red-500"><span>Bill Discount</span><span className="font-mono">-{fmt(clampedBillDiscount)}</span></div>}
            {taxTotal > 0 && <div className="flex justify-between text-surface-600"><span>Tax</span><span className="font-mono">{fmt(taxTotal)}</span></div>}
            <div className="flex justify-between text-lg font-bold text-surface-900 pt-2 border-t border-surface-900"><span>Total</span><span className="font-mono">{fmt(grandTotal)}</span></div>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {(['cash', 'card', 'mixed', 'credit'] as const).map((m) => (
              <button key={m} onClick={() => setPaymentMethod(m)}
                className={`py-2 rounded-lg text-xs font-medium transition-all ${
                  paymentMethod === m
                    ? (m === 'credit' ? 'bg-orange-500 text-white' : 'bg-primary-600 text-white')
                    : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                }`}>
                {m === 'mixed' ? 'Mixed' : m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>

          {(paymentMethod === 'cash' || paymentMethod === 'mixed') && (
            <div>
              <label className="label text-xs">Cash Tendered</label>
              <input type="number" className="input py-2 text-sm font-mono" value={cashTendered} onChange={(e) => setCashTendered(e.target.value)} min="0" step="0.01" />
            </div>
          )}
          {(paymentMethod === 'card' || paymentMethod === 'mixed') && (
            <div>
              <label className="label text-xs">Card Amount</label>
              <input type="number" className="input py-2 text-sm font-mono" value={cardAmount} onChange={(e) => setCardAmount(e.target.value)} min="0" step="0.01" placeholder={paymentMethod === 'card' ? String(grandTotal) : '0.00'} />
            </div>
          )}
          {paymentMethod === 'credit' && (
            <div>
              <label className="label text-xs">Customer <span className="text-red-500">*</span></label>
              <CustomerPicker selected={creditCustomer} onSelect={selectCreditCustomer} />
            </div>
          )}
          {(paymentMethod === 'cash' || paymentMethod === 'mixed') && change > 0 && (
            <div className="flex justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm">
              <span className="font-semibold text-emerald-700">Change</span>
              <span className="font-bold text-emerald-600 font-mono">{fmt(change)}</span>
            </div>
          )}

          <button onClick={handleCreate} disabled={!isValid || saving || missingSupplierFields.length > 0} className="btn-success w-full py-3 text-base font-bold disabled:opacity-40">
            {saving ? <LoadingSpinner size="sm" /> : `Create VAT Invoice  ${fmt(grandTotal)}`}
          </button>
        </div>
      </div>

      <Modal
        isOpen={showSupplierModal}
        onClose={() => setShowSupplierModal(false)}
        title="Supplier Details Required"
        size="sm"
        footer={
          <>
            <button onClick={() => setShowSupplierModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={() => { setShowSupplierModal(false); navigate('/settings'); }} className="btn-primary">
              Go to Settings
            </button>
          </>
        }
      >
        <p className="text-sm text-surface-600">
          A Tax Invoice must show your business's details. Please fill in your business{' '}
          <strong>{missingSupplierFields.join(', ')}</strong> under Settings before creating a Tax Invoice.
        </p>
      </Modal>
    </PageContainer>
  );
}
