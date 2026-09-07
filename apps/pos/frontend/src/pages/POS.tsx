import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { usePOSStore } from '../store/posStore';
import { useToastStore } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';
import { useRestaurantStore } from '../store/restaurantStore';
import { Product, Promotion, Sale, SaleItem, SaleReturn, Customer, CartItem, Category } from '../types';
import api from '../services/api';
import { Modal } from '../components/ui/Modal';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { AxiosError } from 'axios';
import { useT } from '../i18n/translations';
import { formatCurrency as fmt } from '../utils/formatCurrency';
import { useSettingsStore } from '../store/settingsStore';
import { getUnitMeta, formatQuantity, getReceiveUnitOptions, convertToBaseUnit, convertFromBaseUnit } from '../utils/units';
import { buildPrintableDocument, buildKotDocument, isElectronPrint, sendPrintJob } from '../utils/printAgent';

const promoDesc = (p: Promotion) => {
  const val = parseFloat(String(p.discount_value ?? 0));
  if (p.type === 'percentage') {
    const scope = p.applies_to === 'all' ? 'all items'
      : p.applies_to === 'category' ? (p.category_name || 'category')
      : (p.product_name || 'product');
    return `${val}% off ${scope}`;
  }
  if (p.type === 'fixed_amount') {
    const scope = p.applies_to === 'all' ? 'bill total'
      : p.applies_to === 'category' ? (p.category_name || 'category')
      : (p.product_name || 'product');
    return `${fmt(val)} off ${scope}`;
  }
  if (p.type === 'buy_x_get_y') return `Buy ${p.buy_quantity} Get ${p.get_quantity} Free`;
  return p.description || p.type;
};

// ─── Customer Picker (for Credit sales) ────────────────────────────────────────
function CustomerPicker({ selected, onSelect, total }: {
  selected: Customer | null; onSelect: (c: Customer | null) => void; total: number;
}) {
  const toast = useToastStore();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);

  useEffect(() => {
    clearTimeout(debounce.current);
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api.get(`/customers?search=${encodeURIComponent(q)}&limit=8`);
        setResults(r.data.data);
        setOpen(true);
      } finally { setLoading(false); }
    }, 200);
    return () => clearTimeout(debounce.current);
  }, [q]);

  const pick = (c: Customer) => {
    onSelect(c);
    setQ('');
    setResults([]);
    setOpen(false);
  };

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error('Enter a customer name'); return; }
    setCreating(true);
    try {
      const r = await api.post('/customers', { name: newName.trim(), phone: newPhone || undefined });
      onSelect(r.data.data);
      setShowAdd(false);
      setNewName(''); setNewPhone('');
      toast.success('Customer added');
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Failed to add customer');
    } finally { setCreating(false); }
  };

  if (selected) {
    const available = selected.credit_limit == null ? null : Number(selected.credit_limit) - Number(selected.current_balance);
    const exceeds = available !== null && total > available;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-orange-900 truncate">{selected.name}</p>
            <p className="text-xs text-orange-600">
              Balance: {fmt(Number(selected.current_balance))}
              {available !== null && ` · Available: ${fmt(available)}`}
            </p>
          </div>
          <button onClick={() => onSelect(null)} className="text-orange-400 hover:text-orange-700 shrink-0 ml-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {exceeds && (
          <p className="text-xs text-red-600 font-medium">
            This sale ({fmt(total)}) exceeds the customer's available credit.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        className="input-lg border-orange-300 focus:border-orange-500 focus:ring-orange-500"
        placeholder="Search customer by name or phone…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
      />
      {loading && <div className="absolute right-3 top-4"><LoadingSpinner size="sm" /></div>}

      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-surface-200 shadow-xl z-50 overflow-hidden max-h-56 overflow-y-auto">
          {results.map((c) => (
            <button key={c.id} onMouseDown={() => pick(c)}
              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-surface-50 border-b border-surface-100 last:border-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-surface-900 truncate">{c.name}</p>
                <p className="text-xs text-surface-400">{c.phone || '—'}</p>
              </div>
              <p className={`text-xs font-mono shrink-0 ${Number(c.current_balance) > 0 ? 'text-orange-600' : 'text-surface-400'}`}>
                {fmt(Number(c.current_balance))}
              </p>
            </button>
          ))}
        </div>
      )}

      {!showAdd ? (
        <button onClick={() => setShowAdd(true)} className="mt-2 text-sm text-orange-600 hover:text-orange-800 font-medium">
          + Add new customer
        </button>
      ) : (
        <div className="mt-3 space-y-2 bg-surface-50 rounded-lg p-3 border border-surface-200">
          <input className="input py-2 text-sm" placeholder="Customer name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          <input className="input py-2 text-sm" placeholder="Phone (optional)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={creating} className="btn-primary btn-sm flex-1">
              {creating ? 'Adding…' : 'Add & Select'}
            </button>
            <button onClick={() => setShowAdd(false)} className="btn-secondary btn-sm">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Payment Modal ────────────────────────────────────────────────────────────
function PaymentModal({
  isOpen, onClose, total, onConfirm, isProcessing,
}: {
  isOpen: boolean; onClose: () => void; total: number;
  onConfirm: (method: 'cash' | 'card' | 'mixed' | 'credit', cashTendered: number, cardAmount: number, customer?: Customer) => void;
  isProcessing: boolean;
}) {
  const t = useT();
  const { hasFeature } = useSettingsStore();
  const canCredit = hasFeature('customers');
  const methods: Array<'cash' | 'card' | 'mixed' | 'credit'> = canCredit
    ? ['cash', 'card', 'mixed', 'credit']
    : ['cash', 'card', 'mixed'];
  const [method, setMethod] = useState<'cash' | 'card' | 'mixed' | 'credit'>('cash');
  const [cashInput, setCashInput] = useState('');
  const [cardInput, setCardInput] = useState('');
  const [creditCustomer, setCreditCustomer] = useState<Customer | null>(null);
  const cashRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setCashInput(total.toFixed(2));
      setCardInput('');
      setCreditCustomer(null);
      setMethod('cash');
      setTimeout(() => cashRef.current?.select(), 60);
    }
  }, [isOpen, total]);

  const cashTendered = parseFloat(cashInput) || 0;
  const cardAmount   = parseFloat(cardInput)  || 0;
  const change =
    method === 'cash'  ? Math.max(0, cashTendered - total) :
    method === 'mixed' ? Math.max(0, cashTendered + cardAmount - total) : 0;
  const isValid =
    method === 'cash'   ? cashTendered >= total :
    method === 'card'   ? true :
    method === 'mixed'  ? cashTendered + cardAmount >= total :
    !!creditCustomer;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t.pos_payment_title} size="sm">
      <div className="space-y-4">
        {/* Method tabs */}
        <div className={`grid gap-2 ${canCredit ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {methods.map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={`py-2.5 rounded-lg text-sm font-medium transition-all ${
                m === 'credit'
                  ? method === m ? 'bg-orange-500 text-white shadow-sm' : 'bg-surface-100 text-surface-600 hover:bg-orange-50 hover:text-orange-700'
                  : method === m ? 'bg-primary-600 text-white shadow-sm' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
              }`}
            >
              {m === 'cash' ? t.pos_cash : m === 'card' ? t.pos_card : m === 'mixed' ? t.pos_mixed : 'Credit'}
            </button>
          ))}
        </div>

        {/* Amount due */}
        <div className="bg-surface-50 rounded-xl p-4 text-center">
          <p className="text-xs text-surface-500 mb-1">{t.pos_amount_due}</p>
          <p className="text-4xl font-bold text-surface-900 font-mono">{fmt(total)}</p>
        </div>

        {(method === 'cash' || method === 'mixed') && (
          <div>
            <label className="label">{t.pos_cash_tendered}</label>
            <input ref={cashRef} type="number" className="input-lg font-mono text-right"
              value={cashInput} onChange={(e) => setCashInput(e.target.value)} min="0" step="0.01" />
          </div>
        )}
        {(method === 'card' || method === 'mixed') && (
          <div>
            <label className="label">{t.pos_card_amount}</label>
            <input type="number" className="input-lg font-mono text-right"
              value={cardInput} onChange={(e) => setCardInput(e.target.value)}
              min="0" step="0.01" placeholder={method === 'card' ? fmt(total) : '0.00'} />
          </div>
        )}

        {method === 'credit' && (
          <div className="space-y-3">
            <div>
              <label className="label text-orange-700">Customer <span className="text-red-500">*</span></label>
              <CustomerPicker selected={creditCustomer} onSelect={setCreditCustomer} total={total} />
            </div>
            <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5 text-sm text-orange-700">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              No cash collected — customer pays later
            </div>
          </div>
        )}

        {(method === 'cash' || method === 'mixed') && change > 0 && (
          <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <span className="text-sm font-semibold text-emerald-700">{t.pos_change}</span>
            <span className="text-2xl font-bold text-emerald-600 font-mono">{fmt(change)}</span>
          </div>
        )}

        <button
          onClick={() => onConfirm(method, cashTendered, cardAmount, method === 'credit' ? creditCustomer! : undefined)}
          disabled={!isValid || isProcessing}
          className={`btn-lg w-full text-base ${method === 'credit' ? 'bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-40' : 'btn-success'}`}
        >
          {isProcessing ? <LoadingSpinner size="sm" /> : null}
          {isProcessing ? t.pos_processing : method === 'credit' ? `Record Credit Sale  ${fmt(total)}` : `${t.pos_confirm}  ${fmt(total)}`}
        </button>
      </div>
    </Modal>
  );
}

// ─── Receipt Modal ────────────────────────────────────────────────────────────
function ReceiptModal({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const t = useT();
  const toast = useToastStore();
  const { settings } = useSettingsStore();
  const [isPrinting, setIsPrinting] = useState(false);
  const [showSetupBanner, setShowSetupBanner] = useState(false);

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      const html = await buildPrintableDocument('receipt');
      const result = await sendPrintJob(html);
      if (result.success) {
        setShowSetupBanner(false);
        toast.success('Receipt sent to printer');
      } else {
        setShowSetupBanner(true);
        window.print();
      }
    } catch {
      setShowSetupBanner(true);
      window.print();
    } finally {
      setIsPrinting(false);
    }
  };

  if (!sale) return null;
  return (
    <Modal isOpen={!!sale} onClose={onClose} title={t.pos_receipt_title} size="sm">
      <div className="font-mono text-sm space-y-2 print:text-xs" id="receipt">
        <div className="text-center pb-3 border-b border-dashed border-surface-300">
          <div className="text-lg font-bold">{(settings?.setup_completed && settings.business_name) || 'BloomPOS'}</div>
          {settings?.setup_completed && settings.address && <div className="text-xs text-surface-500">{settings.address}</div>}
          {settings?.setup_completed && settings.phone && <div className="text-xs text-surface-500">{settings.phone}</div>}
          <div className="text-xs text-surface-500">#{sale.sale_number}</div>
          <div className="text-xs text-surface-500">{new Date(sale.created_at).toLocaleString()}</div>
          {sale.payment_method === 'credit' && (
            <div className="mt-1 px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-semibold inline-block">
              CREDIT / PAY LATER
            </div>
          )}
          {sale.customer_name && <div className="text-xs mt-1">{t.pos_customer_label} {sale.customer_name}</div>}
        </div>

        <div className="space-y-0.5">
          {sale.items?.map((item) => (
            <div key={item.id} className="flex justify-between gap-2 text-xs">
              <span className="flex-1 truncate">{item.product_name}</span>
              <span className="shrink-0 text-surface-500">{item.quantity}×{fmt(item.unit_price)}</span>
              <span className="shrink-0 w-14 text-right">{fmt(item.subtotal)}</span>
            </div>
          ))}
        </div>

        <div className="pt-2 mt-1 border-t border-dashed border-surface-300 space-y-1 text-xs">
          <div className="flex justify-between"><span>{t.pos_subtotal}</span><span className="font-mono">{fmt(sale.subtotal)}</span></div>
          {sale.discount_amount > 0 && <div className="flex justify-between text-red-500"><span>{t.pos_bill_discount_label}</span><span>-{fmt(sale.discount_amount)}</span></div>}
          {sale.tax_amount > 0   && <div className="flex justify-between"><span>{t.pos_tax}</span><span>{fmt(sale.tax_amount)}</span></div>}
          <div className="flex justify-between font-bold text-sm border-t border-dashed border-surface-300 pt-1">
            <span>{t.pos_total}</span><span className="font-mono">{fmt(sale.total_amount)}</span>
          </div>
          {sale.cash_tendered > 0 && <div className="flex justify-between text-surface-500"><span>{t.pos_cash_tendered}</span><span>{fmt(sale.cash_tendered)}</span></div>}
          {sale.change_amount  > 0 && <div className="flex justify-between text-emerald-600"><span>{t.pos_change}</span><span>{fmt(sale.change_amount)}</span></div>}
          {sale.payment_method === 'credit' && <div className="flex justify-between text-orange-600 font-semibold"><span>Payment</span><span>Credit (Pay Later)</span></div>}
        </div>

        <p className="text-center text-xs text-surface-400 pt-2 border-t border-dashed border-surface-300">
          {t.pos_thank_you}
        </p>
      </div>

      {showSetupBanner && (
        <div className="mt-3 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800 no-print">
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>
            <strong>Printer not set up.</strong> Opened the browser print dialog instead —{' '}
            {isElectronPrint() ? 'configure your printer' : 'install the Print Agent'} under{' '}
            <Link to="/settings" className="underline font-medium">Settings</Link> to print bills automatically next time.
          </span>
        </div>
      )}

      <div className="flex gap-2 mt-4 no-print">
        <button onClick={handlePrint} disabled={isPrinting} className="btn-secondary flex-1">
          {isPrinting ? <LoadingSpinner size="sm" /> : `🖨️ ${t.pos_print}`}
        </button>
        <button onClick={onClose} className="btn-primary flex-1">{t.pos_new_sale}</button>
      </div>
    </Modal>
  );
}

// ─── Sale Return Modal ────────────────────────────────────────────────────────
function SaleReturnModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const toast = useToastStore();
  const [step, setStep] = useState<'lookup' | 'select' | 'receipt'>('lookup');
  const [saleNumber, setSaleNumber] = useState('');
  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<'cash' | 'card' | 'store_credit'>('cash');
  const [returnQtys, setReturnQtys] = useState<Record<number, number>>({});
  const [completedReturn, setCompletedReturn] = useState<SaleReturn | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStep('lookup'); setSaleNumber(''); setSale(null);
      setReason(''); setRefundMethod('cash'); setReturnQtys({}); setCompletedReturn(null);
    }
  }, [isOpen]);

  const r2 = (v: number) => Math.round(v * 100) / 100;

  const handleLookup = async () => {
    if (!saleNumber.trim()) return;
    setLoading(true);
    try {
      const r = await api.get(`/sales?sale_number=${encodeURIComponent(saleNumber.trim())}&limit=1`);
      const results: Sale[] = r.data.data;
      if (!results.length) { toast.error('Sale not found'); return; }
      if (results[0].status === 'voided') { toast.error('Voided sales cannot be refunded'); return; }
      const detail = await api.get(`/sales/${results[0].id}`);
      const found: Sale = detail.data.data;
      setSale(found);
      const init: Record<number, number> = {};
      found.items?.forEach((i) => { init[i.id] = 0; });
      setReturnQtys(init);
      setStep('select');
    } catch { toast.error('Sale not found'); }
    finally { setLoading(false); }
  };

  const handleProcessReturn = async () => {
    if (!sale) return;
    const items = Object.entries(returnQtys)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ sale_item_id: parseInt(id), quantity: qty }));
    if (!items.length) { toast.error('Select at least one item to return'); return; }
    setProcessing(true);
    try {
      const r = await api.post(`/sales/${sale.id}/return`, { items, return_reason: reason || undefined, refund_method: refundMethod });
      setCompletedReturn(r.data.data);
      setStep('receipt');
      toast.success(`Return ${r.data.data.return_number} processed`);
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Return failed');
    } finally { setProcessing(false); }
  };

  // Refund per unit is derived from the line's actual charged subtotal
  // (already net of item discount and inclusive of tax) — not the gross
  // unit_price, which would over-refund a discounted line and under-refund
  // a taxed one. Mirrors the backend's returnSaleItems calculation exactly.
  const perUnitRefund = (item: SaleItem) => r2(item.subtotal / (item.quantity || 1));

  const refundTotal = sale?.items?.reduce((sum, item) => {
    return sum + r2((returnQtys[item.id] ?? 0) * perUnitRefund(item));
  }, 0) ?? 0;

  const title = step === 'lookup' ? 'Process Return' : step === 'select' ? `Return — ${sale?.sale_number}` : 'Return Processed';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      {step === 'lookup' && (
        <div className="space-y-4">
          <p className="text-sm text-surface-500">Enter the sale number to look up the transaction.</p>
          <div>
            <label className="label">Sale Number</label>
            <input type="text" className="input" value={saleNumber}
              onChange={(e) => setSaleNumber(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
              placeholder="INV-20260515-1234" autoFocus />
          </div>
          <button onClick={handleLookup} disabled={loading || !saleNumber.trim()} className="btn-primary w-full">
            {loading ? <LoadingSpinner size="sm" /> : 'Find Sale'}
          </button>
        </div>
      )}

      {step === 'select' && sale && (
        <div className="space-y-4">
          <div className="bg-surface-50 rounded-xl p-3 text-sm grid grid-cols-3 gap-2">
            <div><p className="text-xs text-surface-400">Sale #</p><p className="font-mono font-semibold">{sale.sale_number}</p></div>
            <div><p className="text-xs text-surface-400">Date</p><p>{new Date(sale.created_at).toLocaleDateString()}</p></div>
            <div><p className="text-xs text-surface-400">Total</p><p className="font-semibold">{fmt(sale.total_amount)}</p></div>
          </div>

          <div className="border border-surface-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-50 text-xs uppercase text-surface-500">
                <tr>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-right">Sold</th>
                  <th className="px-3 py-2 text-right">Returnable</th>
                  <th className="px-3 py-2 text-center w-28">Return Qty</th>
                  <th className="px-3 py-2 text-right">Refund</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {sale.items?.map((item) => {
                  const maxReturnable = r2(item.quantity - (item.already_returned ?? 0));
                  const isFullyReturned = maxReturnable <= 0;
                  const qty = returnQtys[item.id] ?? 0;
                  return (
                    <tr key={item.id} className={isFullyReturned ? 'opacity-40 bg-surface-50' : ''}>
                      <td className="px-3 py-2.5 font-medium">{item.product_name}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{item.quantity}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-emerald-600">{maxReturnable}</td>
                      <td className="px-3 py-2.5">
                        <input type="number" className="input text-center py-1 w-full" disabled={isFullyReturned}
                          value={qty || ''} placeholder="0" min={0} max={maxReturnable} step={1}
                          onChange={(e) => {
                            const v = Math.min(maxReturnable, Math.max(0, parseFloat(e.target.value) || 0));
                            setReturnQtys((prev) => ({ ...prev, [item.id]: v }));
                          }} />
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-red-500">
                        {qty > 0 ? `−${fmt(perUnitRefund(item) * qty)}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Reason (optional)</label>
              <input type="text" className="input py-2 text-sm" value={reason}
                onChange={(e) => setReason(e.target.value)} placeholder="Damaged, wrong item..." />
            </div>
            <div>
              <label className="label text-xs">Refund Method</label>
              <select className="input py-2 text-sm" value={refundMethod}
                onChange={(e) => setRefundMethod(e.target.value as 'cash' | 'card' | 'store_credit')}>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="store_credit">Store Credit</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-surface-200">
            <div>
              <p className="text-xs text-surface-400">Total Refund</p>
              <p className="text-2xl font-black text-red-500 font-mono">−{fmt(refundTotal)}</p>
            </div>
            <button onClick={handleProcessReturn} disabled={processing || refundTotal === 0}
              className="btn-danger px-6 py-3 text-base font-semibold">
              {processing ? <LoadingSpinner size="sm" /> : 'Process Return'}
            </button>
          </div>
        </div>
      )}

      {step === 'receipt' && completedReturn && (
        <div className="space-y-4 text-sm">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
            <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide">Return Processed</p>
            <p className="text-2xl font-black text-emerald-700 font-mono mt-1">{completedReturn.return_number}</p>
            <p className="text-lg font-bold text-emerald-600 mt-1">Refund: {fmt(completedReturn.total_refund_amount)}</p>
          </div>
          <div className="space-y-1">
            {completedReturn.items?.map((item, i) => (
              <div key={i} className="flex justify-between text-surface-600">
                <span>{item.product_name} × {item.quantity}</span>
                <span className="font-mono">{fmt(item.refund_subtotal)}</span>
              </div>
            ))}
          </div>
          <button onClick={onClose} className="btn-primary w-full">Done</button>
        </div>
      )}
    </Modal>
  );
}

// ─── Product Search Dropdown ──────────────────────────────────────────────────
function ProductSearch({ onScan, onPick }: { onScan: (p: Product) => void; onPick: (p: Product) => void }) {
  const t = useT();
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<Product[]>([]);
  const [loading, setLoading]   = useState(false);
  const [open, setOpen]         = useState(false);
  const [cursor, setCursor]     = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  // Focus on mount and F2
  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); inputRef.current?.focus(); inputRef.current?.select(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const r = await api.get(`/products?search=${encodeURIComponent(q)}&limit=8`);
      const items: Product[] = r.data.data;
      setResults(items);
      setCursor(0);

      // Auto-add exact barcode match (scanner) — instant, no popup: a scan is
      // already an unambiguous "add exactly this one," unlike a deliberate
      // tap/click, which opens the quantity picker instead (see onPick).
      if (items.length === 1 && (items[0].barcode === q || items[0].sku === q)) {
        onScan(items[0]);
        setQuery('');
        setResults([]);
        setOpen(false);
      } else {
        setOpen(items.length > 0);
      }
    } finally { setLoading(false); }
  }, [onScan]);

  useEffect(() => {
    clearTimeout(debounce.current);
    if (!query.trim()) { setResults([]); setOpen(false); return; }
    debounce.current = setTimeout(() => search(query), 180);
    return () => clearTimeout(debounce.current);
  }, [query, search]);

  const pick = (p: Product) => {
    onPick(p);
    setQuery('');
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === 'Enter' && results[cursor]) { e.preventDefault(); pick(results[cursor]); }
    if (e.key === 'Escape') { setOpen(false); }
  };

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none"
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={t.pos_search_placeholder}
          className="input pl-10 pr-10 py-3 text-base w-full"
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <LoadingSpinner size="sm" />
          </div>
        )}
        {query && !loading && (
          <button onClick={() => { setQuery(''); setOpen(false); inputRef.current?.focus(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-surface-200 shadow-xl z-50 overflow-hidden animate-in">
          {results.map((p, i) => (
            <button
              key={p.id}
              onMouseDown={() => pick(p)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-50 transition-colors border-b border-surface-100 last:border-0 ${
                i === cursor ? 'bg-primary-50' : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-surface-900 truncate">{p.name}</p>
                <p className="text-xs text-surface-400 font-mono">
                  {p.sku}{p.barcode ? ` · ${p.barcode}` : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-primary-600">{fmt(p.selling_price)}</p>
                <p className={`text-xs ${p.current_stock <= 0 ? 'text-red-500' : p.current_stock <= p.low_stock_level ? 'text-amber-500' : 'text-emerald-600'}`}>
                  {t.pos_stock} {formatQuantity(p.current_stock, p.unit_type)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Product Grid — large tappable tiles, the primary way to browse/add ──────
function ProductGrid({ onPick }: { onPick: (p: Product) => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(0);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    api.get('/products/categories').then((r) => setCategories(r.data.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '300', active_only: 'true' });
    if (categoryFilter) params.set('category_id', String(categoryFilter));
    api.get(`/products?${params}`)
      .then((r) => { setProducts(r.data.data); setCursor(0); })
      .finally(() => setLoading(false));
  }, [categoryFilter]);

  // Arrow-key navigation across the tile grid + Enter to select — mirrors the
  // number of Tailwind grid columns at each breakpoint (2/3/4/5) so Up/Down
  // move roughly one visual row. Skipped whenever a text input/select is
  // focused (e.g. the product search box) so normal typing is never hijacked.
  useEffect(() => {
    const getColumns = () => {
      const w = window.innerWidth;
      if (w >= 1280) return 5;
      if (w >= 1024) return 4;
      if (w >= 640) return 3;
      return 2;
    };
    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const isTyping = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
      if (isTyping || products.length === 0) return;
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) return;
      e.preventDefault();
      if (e.key === 'Enter') {
        const p = products[cursor];
        const outOfStock = p.current_stock <= 0 && !p.allow_negative_stock;
        if (!outOfStock) onPick(p);
        return;
      }
      const cols = getColumns();
      setCursor((c) => {
        if (e.key === 'ArrowRight') return Math.min(c + 1, products.length - 1);
        if (e.key === 'ArrowLeft') return Math.max(c - 1, 0);
        if (e.key === 'ArrowDown') return Math.min(c + cols, products.length - 1);
        if (e.key === 'ArrowUp') return Math.max(c - cols, 0);
        return c;
      });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [products, cursor, onPick]);

  useEffect(() => {
    tileRefs.current[cursor]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [cursor]);

  return (
    <div className="flex-1 overflow-y-auto p-3">
      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1">
        <button
          onClick={() => setCategoryFilter(null)}
          className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
            categoryFilter === null ? 'bg-primary-600 text-white' : 'bg-white border border-surface-200 text-surface-600 hover:border-primary-300'
          }`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategoryFilter(c.id)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
              categoryFilter === c.id ? 'text-white' : 'bg-white border border-surface-200 text-surface-600 hover:border-primary-300'
            }`}
            style={categoryFilter === c.id ? { backgroundColor: c.color } : undefined}
          >
            {c.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 flex justify-center"><LoadingSpinner size="lg" /></div>
      ) : products.length === 0 ? (
        <p className="text-center py-16 text-surface-400 text-sm">No products in this category.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {products.map((p, i) => {
            const outOfStock = p.current_stock <= 0 && !p.allow_negative_stock;
            const lowStock = !outOfStock && p.current_stock <= p.low_stock_level;
            return (
              <button
                key={p.id}
                ref={(el) => { tileRefs.current[i] = el; }}
                onClick={() => { setCursor(i); onPick(p); }}
                disabled={outOfStock}
                className={`group flex flex-col rounded-xl border bg-white overflow-hidden text-left hover:border-primary-300 hover:shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  i === cursor ? 'border-primary-500 ring-2 ring-primary-400 shadow-md' : 'border-surface-200'
                }`}
              >
                <div className="aspect-square w-full bg-surface-50 flex items-center justify-center overflow-hidden">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl font-black text-surface-300 select-none">{p.name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="p-2.5 space-y-1">
                  <p className="text-sm font-semibold text-surface-900 leading-tight line-clamp-2 min-h-[2.5em]">{p.name}</p>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-primary-600">{fmt(p.selling_price)}</span>
                    <span className={`text-[10px] font-medium ${outOfStock ? 'text-red-500' : lowStock ? 'text-amber-500' : 'text-surface-400'}`}>
                      {outOfStock ? 'Out of stock' : formatQuantity(p.current_stock, p.unit_type)}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

// ─── Add-to-Cart Modal — pops up on every deliberate product selection (grid
// tile or search pick), never on a barcode scan, so a cashier sets the exact
// quantity/unit up front instead of adding 1 and editing the cart row after. ──
function AddToCartModal({ product, onClose, onConfirm }: {
  product: Product | null;
  onClose: () => void;
  onConfirm: (product: Product, baseQty: number) => void;
}) {
  const [unit, setUnit] = useState('');
  const [qtyText, setQtyText] = useState('1');
  const qtyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (product) {
      setUnit(product.unit_type || '');
      setQtyText('1');
      setTimeout(() => { qtyRef.current?.focus(); qtyRef.current?.select(); }, 50);
    }
  }, [product]);

  if (!product) return null;

  const unitOptions = getReceiveUnitOptions(product.unit_type);
  const activeMeta = unitOptions.find((o) => o.value === unit);
  const step = activeMeta?.step ?? getUnitMeta(product.unit_type).step;
  const qty = parseFloat(qtyText) || 0;
  const baseQty = convertToBaseUnit(qty, unit, product.unit_type);
  const lineTotal = Math.max(0, product.selling_price * baseQty);

  const confirm = () => {
    if (baseQty <= 0) return;
    onConfirm(product, baseQty);
  };

  return (
    <Modal isOpen={!!product} onClose={onClose} title={product.name} size="sm">
      <div className="space-y-4">
        <div className="flex items-center justify-between bg-surface-50 rounded-lg px-3 py-2">
          <span className="text-sm text-surface-500">Price</span>
          <span className="font-bold text-primary-600">{fmt(product.selling_price)} / {getUnitMeta(product.unit_type).abbr}</span>
        </div>

        <div>
          <label className="label">Quantity</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setQtyText(String(Math.max(0, round3(qty - step))))}
              className="w-11 h-11 shrink-0 rounded-lg bg-surface-100 text-xl font-bold text-surface-600 hover:bg-surface-200"
            >−</button>
            <input
              ref={qtyRef}
              type="number"
              value={qtyText}
              onChange={(e) => setQtyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { confirm(); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setQtyText(String(round3(qty + step))); return; }
                if (e.key === 'ArrowDown') { e.preventDefault(); setQtyText(String(Math.max(0, round3(qty - step)))); return; }
                if (unitOptions.length > 1 && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
                  e.preventDefault();
                  const idx = unitOptions.findIndex((o) => o.value === unit);
                  const dir = e.key === 'ArrowRight' ? 1 : -1;
                  const next = unitOptions[(idx + dir + unitOptions.length) % unitOptions.length];
                  setUnit(next.value);
                }
              }}
              className="input-lg text-center font-mono flex-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              min="0" step={step}
            />
            <button
              onClick={() => setQtyText(String(round3(qty + step)))}
              className="w-11 h-11 shrink-0 rounded-lg bg-surface-100 text-xl font-bold text-surface-600 hover:bg-surface-200"
            >+</button>
            {unitOptions.length > 1 && (
              <select className="input w-24 shrink-0" value={unit} onChange={(e) => setUnit(e.target.value)}>
                {unitOptions.map((o) => <option key={o.value} value={o.value}>{o.abbr}</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-surface-100">
          <span className="text-sm font-semibold text-surface-700">Line Total</span>
          <span className="text-xl font-black text-surface-900 font-mono">{fmt(lineTotal)}</span>
        </div>

        <button onClick={confirm} disabled={baseQty <= 0} className="btn-success w-full py-3 text-base font-bold disabled:opacity-40">
          Add to Cart
        </button>
      </div>
    </Modal>
  );
}

// ─── Main POS Page ────────────────────────────────────────────────────────────
export default function POS() {
  const { user } = useAuthStore();
  const t = useT();
  const { settings, hasFeature } = useSettingsStore();
  const toast    = useToastStore();
  const pos      = usePOSStore();
  const restaurant = useRestaurantStore();
  // Mutually exclusive with plain retail checkout — set from the Settings
  // page's "Operating Mode" switch, not just plan eligibility. A till is
  // either running regular POS checkout or restaurant ordering, never both
  // at once (see the effect below, which forces the order type off/onto
  // 'retail' the instant this flips).
  const restaurantModeOn = hasFeature('restaurant_mode') && !!settings?.restaurant_mode_enabled;
  const [couponInput, setCouponInput] = useState('');
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [markAsVat, setMarkAsVat] = useState(false);
  const [catalogView, setCatalogView] = useState<'grid' | 'cart'>('grid');
  const [pickedProduct, setPickedProduct] = useState<Product | null>(null);
  const [heldBillsCount, setHeldBillsCount] = useState(0);
  const [heldBillsModalOpen, setHeldBillsModalOpen] = useState(false);
  const [heldBillsList, setHeldBillsList] = useState<Sale[]>([]);
  const [loadingHeldBills, setLoadingHeldBills] = useState(false);

  const [hasShift, setHasShift]         = useState<boolean | null>(null);
  const [currentShift, setCurrentShift] = useState<{ id: number; shift_number: string; opening_cash: number } | null>(null);
  const [openingCash, setOpeningCash]   = useState('0');
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isProcessing, setIsProcessing]   = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [applyingPromoId, setApplyingPromoId] = useState<number | null>(null);
  const [activePromos, setActivePromos] = useState<Promotion[]>([]);
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'cart' | 'bill'>('cart');
  // Which unit each cart row's quantity is currently being entered/shown in
  // (e.g. a kg-tracked product switched to grams for one line) — purely a
  // display/entry convenience; the cart itself always stores base-unit qty.
  const [displayUnits, setDisplayUnits] = useState<Record<number, string>>({});
  // Raw in-progress text for the cart's quantity input, keyed by product_id —
  // exists only while a field is actively being retyped (e.g. cleared to
  // enter "2 kg" digit by digit). Without this, every keystroke round-trips
  // through the store as a real quantity, and a momentarily-empty field
  // parses to 0, which updateQty treats as "remove this line" — deleting the
  // row before the user can finish typing. Cleared on blur once the value is
  // actually committed, so the field falls back to the store's real quantity.
  const [qtyDrafts, setQtyDrafts] = useState<Record<number, string>>({});

  // Check active shift
  useEffect(() => {
    api.get('/shifts/current').then((r) => {
      if (r.data.data) { setHasShift(true); setCurrentShift(r.data.data); }
      else setHasShift(false);
    }).catch(() => setHasShift(false));
  }, []);

  // Load active promotions once shift is confirmed open
  useEffect(() => {
    if (hasShift) {
      api.get('/promotions?active_only=true')
        .then((r) => setActivePromos(r.data.data || []))
        .catch(() => {});
    }
  }, [hasShift]);

  // Global keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'F10') { e.preventDefault(); if (pos.cart.length > 0) setIsPaymentOpen(true); }
      if (e.key === 'Escape') setIsPaymentOpen(false);
      if ((e.ctrlKey || e.metaKey) && e.key === 'Delete') { e.preventDefault(); if (pos.cart.length > 0 && confirm('Clear the cart?')) { pos.clearCart(); setDisplayUnits({}); setQtyDrafts({}); } }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [pos]);

  // Keeps the order type in lockstep with the till's operating mode —
  // switching modes mid-session (rare, but possible if an admin flips the
  // Settings toggle while POS is open in another tab) snaps the current
  // screen to match rather than leaving it in an impossible in-between state.
  useEffect(() => {
    if (restaurantModeOn && restaurant.orderType === 'retail') {
      restaurant.startOrder('takeaway');
    } else if (!restaurantModeOn && restaurant.orderType !== 'retail') {
      restaurant.reset();
      pos.clearCart();
      setDisplayUnits({});
      setQtyDrafts({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantModeOn]);

  const handlePayment = async (method: 'cash' | 'card' | 'mixed' | 'credit', cashTendered: number, cardAmount: number, customer?: Customer) => {
    setIsProcessing(true);
    try {
      const r = await api.post('/sales', {
        cart_items: pos.cart,
        bill_discount: pos.billDiscount,
        payment_method: method,
        cash_tendered: cashTendered,
        card_amount: cardAmount,
        customer_id: customer?.id,
        customer_name: customer?.name || pos.customerName || undefined,
        notes: pos.notes || undefined,
        coupon_code: pos.couponCode || undefined,
        is_vat_invoice: markAsVat || undefined,
      });
      const detail = await api.get(`/sales/${r.data.data.id}`);
      setCompletedSale(detail.data.data);
      setIsPaymentOpen(false);
      pos.clearCart();
      setMarkAsVat(false);
      setDisplayUnits({});
      setQtyDrafts({});
      setMobileView('cart');
      toast.success(`Sale ${r.data.data.sale_number} completed`);
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Payment failed');
    } finally { setIsProcessing(false); }
  };

  const handleAddToCart = (product: Product, baseQty: number) => {
    pos.addProduct(product, baseQty);
    setPickedProduct(null);
  };

  // ── Restaurant Mode: held-order helpers ────────────────────────────────────

  // Creates the held order on first use; every call after that just returns
  // the existing id — nothing here decides WHAT gets sent, only that a sale
  // row exists to send it to.
  const ensureHeldSale = async (): Promise<{ id: number; justCreated: boolean }> => {
    if (restaurant.heldSaleId) return { id: restaurant.heldSaleId, justCreated: false };
    const r = await api.post('/sales/held', {
      cart_items: pos.cart,
      order_type: restaurant.orderType,
      table_id: restaurant.tableId || undefined,
      customer_name: pos.customerName || undefined,
      customer_id: pos.customerId || undefined,
      notes: pos.notes || undefined,
    });
    const id = r.data.data.id;
    restaurant.setHeldSale(id);
    return { id, justCreated: true };
  };

  const handleSendToKitchen = async () => {
    if (pos.cart.length === 0) return;
    setIsProcessing(true);
    try {
      const { id: saleId, justCreated } = await ensureHeldSale();

      // A fresh hold already inserted every cart line — only an EXISTING
      // held order needs its new-since-last-send items added first.
      if (!justCreated) {
        const delta = pos.cart
          .map((item) => {
            const prevQty = restaurant.lastSentQuantities[item.product_id] || 0;
            const deltaQty = item.quantity - prevQty;
            return deltaQty > 0 ? { ...item, quantity: deltaQty } : null;
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);
        if (delta.length > 0) {
          await api.post(`/sales/held/${saleId}/items`, { cart_items: delta });
        }
      }

      const kotRes = await api.post(`/sales/held/${saleId}/send-to-kitchen`);
      const items = kotRes.data.data.items as Array<{
        product_name: string; quantity: string | number; station_id: number | null; station_name: string | null;
      }>;

      if (items.length === 0) {
        toast.info('Nothing new to send to the kitchen');
      } else {
        const groups = new Map<string, { stationName: string; items: typeof items }>();
        for (const it of items) {
          const key = it.station_id != null ? String(it.station_id) : 'unassigned';
          if (!groups.has(key)) groups.set(key, { stationName: it.station_name || 'Kitchen', items: [] });
          groups.get(key)!.items.push(it);
        }
        for (const [key, group] of groups) {
          const html = buildKotDocument({
            saleNumber: String(saleId),
            stationName: group.stationName,
            orderType: restaurant.orderType,
            tableName: restaurant.tableName || undefined,
            items: group.items.map((i) => ({ product_name: i.product_name, quantity: Number(i.quantity) })),
          });
          await sendPrintJob(html, key === 'unassigned' ? undefined : Number(key));
        }
        toast.success('Sent to kitchen');
      }

      const quantities: Record<number, number> = {};
      for (const item of pos.cart) quantities[item.product_id] = (quantities[item.product_id] || 0) + item.quantity;
      restaurant.recordSent(quantities);
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Failed to send to kitchen');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCompleteHeldSale = async (method: 'cash' | 'card' | 'mixed' | 'credit', cashTendered: number, cardAmount: number, customer?: Customer) => {
    setIsProcessing(true);
    try {
      const { id: saleId } = await ensureHeldSale();
      const r = await api.post(`/sales/held/${saleId}/complete`, {
        payment_method: method,
        cash_tendered: cashTendered,
        card_amount: cardAmount,
        bill_discount: pos.billDiscount,
        coupon_code: pos.couponCode || undefined,
        customer_id: customer?.id,
        customer_name: customer?.name || pos.customerName || undefined,
        notes: pos.notes || undefined,
        is_vat_invoice: markAsVat || undefined,
      });
      const detail = await api.get(`/sales/${r.data.data.id}`);
      setCompletedSale(detail.data.data);
      setIsPaymentOpen(false);
      pos.clearCart();
      restaurant.reset();
      setMarkAsVat(false);
      setDisplayUnits({});
      setQtyDrafts({});
      setMobileView('cart');
      toast.success(`Order ${r.data.data.sale_number} completed`);
      refreshHeldBillsCount();
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Payment failed');
    } finally { setIsProcessing(false); }
  };

  const handleCancelHeldOrder = async () => {
    if (restaurant.heldSaleId) {
      const reason = window.prompt('Reason for cancelling this order:');
      if (reason === null) return;
      try {
        await api.post(`/sales/held/${restaurant.heldSaleId}/cancel`, { reason: reason || 'Cancelled' });
        toast.success('Order cancelled');
      } catch (err) {
        const e = err as AxiosError<{ message: string }>;
        toast.error(e.response?.data?.message || 'Failed to cancel order');
        return;
      }
    }
    restaurant.reset();
    pos.clearCart();
    setDisplayUnits({});
    refreshHeldBillsCount();
  };

  // ── POS Mode: hold-bill helpers ─────────────────────────────────────────────

  const refreshHeldBillsCount = useCallback(async () => {
    try {
      const r = await api.get('/sales?status=held&order_type=retail&limit=1');
      setHeldBillsCount(r.data.total || 0);
    } catch { /* best-effort — a stale count badge isn't worth surfacing an error for */ }
  }, []);

  useEffect(() => { if (hasShift) refreshHeldBillsCount(); }, [hasShift, refreshHeldBillsCount]);

  const handleHoldBill = async () => {
    if (pos.cart.length === 0) return;
    setIsProcessing(true);
    try {
      await ensureHeldSale();
      toast.success('Bill held — starting a new one');
      pos.clearCart();
      restaurant.reset();
      setDisplayUnits({});
      setQtyDrafts({});
      refreshHeldBillsCount();
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Failed to hold bill');
    } finally {
      setIsProcessing(false);
    }
  };

  const openHeldBills = async () => {
    setHeldBillsModalOpen(true);
    setLoadingHeldBills(true);
    try {
      const r = await api.get('/sales?status=held&order_type=retail&limit=50');
      setHeldBillsList(r.data.data);
    } finally {
      setLoadingHeldBills(false);
    }
  };

  const resumeHeldBill = async (sale: Sale) => {
    try {
      const detail = await api.get(`/sales/${sale.id}`);
      const items: CartItem[] = (detail.data.data.items || []).map((i: Record<string, unknown>) => ({
        product_id: i.product_id as number,
        product_name: i.product_name as string,
        barcode: i.barcode as string | undefined,
        sku: '',
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
        original_price: Number(i.unit_price),
        cost_price: Number(i.cost_price),
        item_discount: Number(i.item_discount) || 0,
        tax_rate: Number(i.tax_rate) || 0,
      }));
      restaurant.startOrder('retail');
      restaurant.setHeldSale(sale.id);
      pos.loadCart(items);
      setDisplayUnits({});
      setQtyDrafts({});
      setHeldBillsModalOpen(false);
    } catch {
      toast.error('Failed to load held bill');
    }
  };

  const handleApplyPromotion = async (promo: Promotion) => {
    setApplyingPromoId(promo.id);
    try {
      const r = await api.post('/promotions/apply', { items: pos.cart, promotion_id: promo.id });
      const { items, promotionsSummary } = r.data.data;
      if (promotionsSummary.length > 0) {
        pos.applyCartPromotions(items, promotionsSummary[0], promo.id);
        toast.success(`"${promo.name}" applied`);
      } else {
        toast.info(`"${promo.name}" has no effect on current cart items`);
      }
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Failed to apply promotion');
    } finally {
      setApplyingPromoId(null);
    }
  };

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return;
    setApplyingCoupon(true);
    try {
      const baseAmount = Math.max(0, subtotal - itemDiscount - pos.billDiscount);
      const r = await api.post('/coupons/preview', { code: couponInput.trim(), base_amount: baseAmount });
      pos.applyCoupon(couponInput.trim().toUpperCase(), r.data.data.discount_amount);
      setCouponInput('');
      toast.success(`Coupon "${couponInput.trim().toUpperCase()}" applied`);
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Invalid coupon code');
    } finally {
      setApplyingCoupon(false);
    }
  };

  const openShift = async () => {
    try {
      const r = await api.post('/shifts/open', { opening_cash: parseFloat(openingCash) || 0 });
      setHasShift(true);
      setCurrentShift(r.data.data);
      toast.success('Shift opened');
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Failed to open shift');
    }
  };

  // ── Promotion helpers ──────────────────────────────────────────────────────

  // Bill-wide promotions (applies to all items) shown in the bill summary
  const billPromos = useMemo(
    () => activePromos.filter((p) => p.applies_to === 'all'),
    [activePromos]
  );

  // ── Open Shift Screen ──────────────────────────────────────────────────────
  if (hasShift === null) {
    return <div className="flex items-center justify-center h-screen"><LoadingSpinner size="lg" /></div>;
  }

  if (hasShift === false) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface-50">
        <div className="card p-8 w-full max-w-sm text-center space-y-5">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-surface-900">{t.pos_open_shift_title}</h2>
            <p className="text-surface-500 text-sm mt-1">{t.pos_open_shift_hint}</p>
          </div>
          <div>
            <label className="label">{t.pos_opening_cash} ({settings?.currency_symbol ?? '$'})</label>
            <input type="number" className="input-lg text-center font-mono" value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)} min="0" step="0.01" autoFocus />
          </div>
          <button onClick={openShift} className="btn-primary btn-lg w-full">
            {t.pos_open_shift_btn}
          </button>
        </div>
      </div>
    );
  }

  const subtotal      = pos.subtotal();
  const itemDiscount  = pos.itemDiscountTotal();
  const tax           = pos.taxTotal();
  const total         = pos.total();
  const canOverridePrice = useAuthStore.getState().hasPermission('price_override');

  return (
    <div className="flex h-screen overflow-hidden bg-surface-100 no-print">

      {/* ── LEFT: Cart Main Area ──────────────────────────────────────────────── */}
      <div className={`flex-1 flex-col min-w-0 overflow-hidden ${mobileView === 'bill' ? 'hidden md:flex' : 'flex'}`}>

        {/* Top Bar */}
        <div className="bg-white border-b border-surface-200 px-5 py-3 flex items-center gap-4">
          {/* Search */}
          <div className="flex-1 max-w-2xl">
            <ProductSearch onScan={(p) => pos.addProduct(p)} onPick={(p) => setPickedProduct(p)} />
          </div>

          {/* Browse / Cart toggle */}
          <div className="flex items-center gap-1 bg-surface-100 rounded-lg p-1 shrink-0">
            <button
              onClick={() => setCatalogView('grid')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${catalogView === 'grid' ? 'bg-white shadow-sm text-primary-700' : 'text-surface-500 hover:text-surface-700'}`}
            >
              Browse
            </button>
            <button
              onClick={() => setCatalogView('cart')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${catalogView === 'cart' ? 'bg-white shadow-sm text-primary-700' : 'text-surface-500 hover:text-surface-700'}`}
            >
              Cart{pos.cart.length > 0 ? ` (${pos.cart.length})` : ''}
            </button>
          </div>

          {/* Shift info */}
          <div className="hidden lg:flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-xs text-surface-500">{t.pos_shift}</p>
              <p className="text-sm font-semibold text-surface-700">{currentShift?.shift_number}</p>
            </div>
            <div className="w-px h-8 bg-surface-200" />
            <div className="text-right">
              <p className="text-xs text-surface-500">{t.pos_cashier}</p>
              <p className="text-sm font-semibold text-surface-700">{user?.name}</p>
            </div>
            <div className="w-px h-8 bg-surface-200" />
            <div className="flex items-center gap-1.5 text-xs text-surface-400 select-none">
              <kbd className="px-1.5 py-0.5 bg-surface-100 rounded font-mono text-surface-600">F2</kbd><span>Search</span>
              <kbd className="ml-1 px-1.5 py-0.5 bg-surface-100 rounded font-mono text-surface-600">F10</kbd><span>Pay</span>
            </div>
            <button
              onClick={() => setIsReturnOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-100 text-surface-600 hover:bg-amber-50 hover:text-amber-700 text-sm font-medium transition-colors border border-surface-200"
              title="Process a return"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              Return
            </button>
          </div>
        </div>

        {catalogView === 'grid' && <ProductGrid onPick={(p) => setPickedProduct(p)} />}

        {/* Cart — card-based with inline promotions */}
        {catalogView === 'cart' && (
        <>
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {pos.cart.length === 0 ? (
            <EmptyCart />
          ) : pos.cart.map((item, index) => {
            const itemPromos = activePromos.filter((p) =>
              (p.applies_to === 'product' && p.product_id === item.product_id) ||
              (p.applies_to === 'category' && p.category_id != null && p.category_id === item.category_id)
            );
            return (
              <div key={item.product_id} className="bg-primary-50 rounded-lg border border-primary-100 shadow-sm overflow-hidden flex">

                {/* Single row: # · name · qty · price · discount · total · remove */}
                <div className="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-primary-200 text-primary-700 text-[10px] font-bold flex items-center justify-center select-none">
                    {index + 1}
                  </span>

                  {/* Name — natural width, max 38%, truncates if long */}
                  <p className="min-w-0 max-w-[38%] text-sm font-semibold text-surface-900 truncate shrink-0">{item.product_name}</p>

                  {/* Qty controls */}
                  {(() => {
                    const unitOptions = getReceiveUnitOptions(item.unit_type);
                    const displayUnit = displayUnits[item.product_id] || item.unit_type || '';
                    const displayMeta = unitOptions.find((o) => o.value === displayUnit);
                    const step = displayMeta?.step ?? getUnitMeta(item.unit_type).step;
                    const displayQty = convertFromBaseUnit(item.quantity, displayUnit, item.unit_type);
                    const setDisplayQty = (qty: number) =>
                      pos.updateQty(item.product_id, convertToBaseUnit(qty, displayUnit, item.unit_type));
                    return (
                      <>
                        <div className="flex items-center border border-primary-200 rounded overflow-hidden h-7 bg-white shrink-0 focus-within:border-primary-400 transition-colors">
                          <button onClick={() => { setQtyDrafts((prev) => { const { [item.product_id]: _, ...rest } = prev; return rest; }); setDisplayQty(displayQty - step); }} className="w-7 h-full flex items-center justify-center text-surface-500 hover:bg-primary-100 transition-colors font-bold select-none">−</button>
                          <input
                            type="number"
                            value={qtyDrafts[item.product_id] ?? String(displayQty)}
                            onChange={(e) => setQtyDrafts((prev) => ({ ...prev, [item.product_id]: e.target.value }))}
                            onBlur={(e) => {
                              setQtyDrafts((prev) => { const { [item.product_id]: _, ...rest } = prev; return rest; });
                              const parsed = parseFloat(e.target.value);
                              if (parsed > 0) setDisplayQty(parsed);
                              // Empty/0/invalid on blur reverts to the last real quantity — clearing
                              // the field mid-edit must never remove the line on its own; only the
                              // explicit Remove button (or the − stepper reaching 0) does that.
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); return; }
                              if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                setQtyDrafts((prev) => { const { [item.product_id]: _, ...rest } = prev; return rest; });
                                setDisplayQty(displayQty + step);
                              } else if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                setQtyDrafts((prev) => { const { [item.product_id]: _, ...rest } = prev; return rest; });
                                if (displayQty - step > 0) setDisplayQty(displayQty - step);
                              }
                            }}
                            className="w-9 text-center text-sm font-bold bg-transparent border-0 focus:outline-none focus:ring-0 text-surface-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            min="0.001" step={step}
                          />
                          <button onClick={() => { setQtyDrafts((prev) => { const { [item.product_id]: _, ...rest } = prev; return rest; }); setDisplayQty(displayQty + step); }} className="w-7 h-full flex items-center justify-center text-surface-500 hover:bg-primary-100 transition-colors font-bold select-none">+</button>
                        </div>
                        {unitOptions.length > 1 ? (
                          <select
                            className="input py-0 h-7 text-[11px] w-auto shrink-0 -ml-1.5"
                            value={displayUnit}
                            onChange={(e) => setDisplayUnits((prev) => ({ ...prev, [item.product_id]: e.target.value }))}
                          >
                            {unitOptions.map((o) => <option key={o.value} value={o.value}>{o.abbr}</option>)}
                          </select>
                        ) : (
                          <span className="text-[10px] text-surface-400 shrink-0 -ml-1.5">{getUnitMeta(item.unit_type).abbr}</span>
                        )}
                      </>
                    );
                  })()}

                  {/* Unit price */}
                  {canOverridePrice ? (
                    <input type="number" value={item.unit_price} onChange={(e) => pos.updateUnitPrice(item.product_id, parseFloat(e.target.value) || 0)} className="h-7 px-2 text-sm font-mono border border-primary-200 rounded w-24 text-right bg-white focus:outline-none focus:border-primary-400 text-primary-700 shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" placeholder="Price" min="0" step="0.01" />
                  ) : (
                    <p className="text-sm text-surface-500 font-mono shrink-0">{fmt(item.unit_price)}</p>
                  )}

                  {/* Discount */}
                  <input type="number" value={item.item_discount || ''} onChange={(e) => pos.updateItemDiscount(item.product_id, parseFloat(e.target.value) || 0)} className="h-7 px-2 text-sm font-mono border border-primary-200 rounded w-24 text-right bg-white focus:outline-none focus:border-red-400 text-red-500 shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" placeholder="Disc" min="0" step="0.01" />

                  {/* Spacer pushes total+remove to far right */}
                  <div className="flex-1" />

                  {/* Total */}
                  <p className="text-sm font-black text-surface-900 font-mono shrink-0">{fmt((item.unit_price - item.item_discount) * item.quantity)}</p>

                  {/* Remove */}
                  <button onClick={() => { pos.removeItem(item.product_id); setDisplayUnits((prev) => { const { [item.product_id]: _, ...rest } = prev; return rest; }); setQtyDrafts((prev) => { const { [item.product_id]: _, ...rest } = prev; return rest; }); }} className="shrink-0 w-5 h-5 flex items-center justify-center text-surface-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all" title="Remove">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Right: offer panel — entire section is the button */}
                {itemPromos.length > 0 && (
                  <div className="border-l border-amber-200 shrink-0 flex flex-col divide-y divide-amber-200 w-28">
                    {itemPromos.map((promo) => {
                      const isApplied = pos.appliedPromotionIds.includes(promo.id);
                      const isApplying = applyingPromoId === promo.id;
                      return (
                        <button
                          key={promo.id}
                          onClick={() => !isApplied && handleApplyPromotion(promo)}
                          disabled={isApplied || !!isApplying}
                          className={`flex-1 flex flex-col items-center justify-center gap-0.5 px-2 py-1 transition-all disabled:opacity-50 ${
                            isApplied
                              ? 'bg-emerald-100 text-emerald-700 cursor-default'
                              : 'bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700'
                          }`}
                        >
                          <span className="text-[10px] font-medium text-center leading-tight">{promoDesc(promo)}</span>
                          <span className="text-sm font-black">{isApplying ? '…' : isApplied ? '✓ Applied' : 'Apply'}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Cart footer — item count + clear */}
        {pos.cart.length > 0 && (
          <div className="bg-white border-t border-surface-200 px-4 md:px-6 py-3 flex items-center justify-between gap-2">
            <span className="text-sm text-surface-500 font-medium">
              {pos.cart.length} {pos.cart.length !== 1 ? t.pos_lines_plural : t.pos_lines} &nbsp;·&nbsp;{' '}
              {pos.cart.reduce((s, i) => s + i.quantity, 0).toFixed(0)} {t.pos_items_total}
            </span>
            <div className="flex items-center gap-2">
              {/* Mobile: View Bill button */}
              <button
                onClick={() => setMobileView('bill')}
                className="md:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                </svg>
                Bill
              </button>
              <button
                onClick={() => { pos.clearCart(); setDisplayUnits({}); setQtyDrafts({}); }}
                className="text-sm text-red-400 hover:text-red-600 font-semibold transition-colors"
              >
                {t.pos_clear_cart}
              </button>
            </div>
          </div>
        )}
        </>
        )}
      </div>

      {/* ── RIGHT: Bill Summary ───────────────────────────────────────────────── */}
      <div className={`w-full md:w-72 xl:w-80 bg-white md:border-l border-surface-200 flex-col shrink-0 ${mobileView === 'cart' ? 'hidden md:flex' : 'flex'}`}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-surface-100 flex items-center gap-3">
          {/* Mobile back button */}
          <button
            onClick={() => setMobileView('cart')}
            className="md:hidden p-1.5 rounded-lg text-surface-500 hover:bg-surface-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h2 className="font-semibold text-surface-900">{t.pos_bill_summary}</h2>
            <p className="text-xs text-surface-400 mt-0.5">{new Date().toLocaleTimeString()}</p>
          </div>
        </div>

        {/* Restaurant Mode: current order context — the till only ever runs
            ONE mode at a time (see restaurantModeOn/its effect above), so
            this bar is either always showing or never showing, no manual
            "start" step needed. */}
        {restaurantModeOn && (
          <div className="px-5 py-2.5 border-b border-surface-100 flex items-center justify-between bg-primary-50">
            <span className="text-sm font-semibold text-primary-700">
              {restaurant.orderType === 'dine_in' ? '🍽 Dine In' : restaurant.orderType === 'delivery' ? '🚚 Delivery' : '🥡 Take Away'}
              {restaurant.tableName && ` — ${restaurant.tableName}`}
            </span>
            <div className="flex items-center gap-3">
              {restaurant.orderType !== 'dine_in' && pos.cart.length === 0 && !restaurant.heldSaleId && (
                <Link to="/tables" className="text-xs text-primary-600 hover:text-primary-800 font-medium">Dine In Instead</Link>
              )}
              <button onClick={handleCancelHeldOrder} className="text-xs text-red-500 hover:text-red-700 font-medium">
                {restaurant.heldSaleId || pos.cart.length > 0 ? 'Cancel Order' : 'Reset'}
              </button>
            </div>
          </div>
        )}

        {/* POS Mode: hold-bill context — a plain till doesn't use tables, so
            "held bills" get their own simple browse-and-resume list instead. */}
        {!restaurantModeOn && (
          <div className="px-5 py-2 border-b border-surface-100 flex items-center justify-between">
            {restaurant.heldSaleId ? (
              <>
                <span className="text-sm font-semibold text-primary-700">⏸ Resuming Held Bill</span>
                <button onClick={handleCancelHeldOrder} className="text-xs text-red-500 hover:text-red-700 font-medium">Cancel</button>
              </>
            ) : (
              <button onClick={openHeldBills} className="text-xs font-medium text-primary-600 hover:text-primary-700">
                📋 Held Bills{heldBillsCount > 0 ? ` (${heldBillsCount})` : ''}
              </button>
            )}
          </div>
        )}

        {/* Optional fields */}
        <div className="px-5 py-3 space-y-3 border-b border-surface-100">
          <div>
            <label className="label text-xs">{t.pos_customer}</label>
            <input
              type="text"
              className="input py-2 text-sm"
              value={pos.customerName}
              onChange={(e) => pos.setCustomerName(e.target.value)}
              placeholder={t.pos_customer_placeholder}
            />
          </div>
          <div>
            <label className="label text-xs">{t.pos_bill_discount} ({settings?.currency_symbol ?? '$'})</label>
            <input
              type="number"
              className="input py-2 text-sm font-mono"
              value={pos.billDiscount || ''}
              onChange={(e) => pos.setBillDiscount(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              min="0" step="0.01"
            />
          </div>
          {hasFeature('coupons') && (
            <div>
              <label className="label text-xs">Coupon Code</label>
              {pos.couponCode ? (
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <span className="text-sm font-mono font-semibold text-emerald-700">{pos.couponCode}</span>
                  <button onClick={() => pos.clearCoupon()} className="text-xs text-red-400 hover:text-red-600 font-medium">
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input py-2 text-sm font-mono uppercase"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleApplyCoupon(); }}
                    placeholder="e.g. SAVE10"
                  />
                  <button onClick={handleApplyCoupon} disabled={applyingCoupon || !couponInput.trim()} className="btn-secondary btn-sm shrink-0 disabled:opacity-40">
                    {applyingCoupon ? '...' : 'Apply'}
                  </button>
                </div>
              )}
            </div>
          )}
          {hasFeature('vat_invoice') && (
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input type="checkbox" checked={markAsVat} onChange={(e) => setMarkAsVat(e.target.checked)} />
              <span className="text-xs font-medium text-surface-600">Mark as VAT Invoice</span>
            </label>
          )}
        </div>

        {/* Applied promotions chips */}
        {pos.appliedPromotionNames.length > 0 && (
          <div className="border-b border-surface-100 px-5 py-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Applied Offers</span>
              <button onClick={() => pos.clearPromotions()} className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors">
                Clear
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {pos.appliedPromotionNames.map((name, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                  <svg className="w-2.5 h-2.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="flex-1 px-5 py-5 flex flex-col justify-end space-y-2.5">

          {/* Bill-wide promotions */}
          {billPromos.length > 0 && pos.cart.length > 0 && (
            <div className="space-y-1.5 pb-1">
              <p className="text-xs font-semibold text-surface-400 uppercase tracking-wide">Bill Offers</p>
              {billPromos.map((promo) => {
                const isApplied = pos.appliedPromotionIds.includes(promo.id);
                const isApplying = applyingPromoId === promo.id;
                return (
                  <div key={promo.id} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 border ${
                    isApplied ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
                  }`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-surface-800 truncate">{promo.name}</p>
                      <p className="text-xs text-surface-400">{promoDesc(promo)}</p>
                      {promo.min_purchase_amount && !isApplied && (
                        <p className="text-xs text-amber-600">Min. {fmt(Number(promo.min_purchase_amount))}</p>
                      )}
                    </div>
                    <button
                      onClick={() => !isApplied && handleApplyPromotion(promo)}
                      disabled={isApplied || isApplying}
                      className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all min-w-[48px] flex items-center justify-center ${
                        isApplied ? 'bg-emerald-100 text-emerald-700 cursor-default' : 'bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40'
                      }`}
                    >
                      {isApplying ? '...' : isApplied ? '✓' : 'Apply'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between text-surface-600">
              <span className="font-medium">{t.pos_subtotal}</span>
              <span className="font-mono font-semibold">{fmt(subtotal)}</span>
            </div>
            {itemDiscount > 0 && (
              <div className="flex justify-between text-red-500">
                <span className="font-medium">{t.pos_item_discounts}</span>
                <span className="font-mono font-semibold">−{fmt(itemDiscount)}</span>
              </div>
            )}
            {pos.billDiscount > 0 && (
              <div className="flex justify-between text-red-500">
                <span className="font-medium">{t.pos_bill_discount_label}</span>
                <span className="font-mono font-semibold">−{fmt(pos.billDiscount)}</span>
              </div>
            )}
            {pos.couponDiscount > 0 && (
              <div className="flex justify-between text-red-500">
                <span className="font-medium">Coupon ({pos.couponCode})</span>
                <span className="font-mono font-semibold">−{fmt(pos.couponDiscount)}</span>
              </div>
            )}
            {tax > 0 && (
              <div className="flex justify-between text-surface-600">
                <span className="font-medium">{t.pos_tax}</span>
                <span className="font-mono font-semibold">{fmt(tax)}</span>
              </div>
            )}
          </div>

          {/* Total */}
          <div className="pt-4 mt-1 border-t-2 border-surface-900 flex items-baseline justify-between">
            <span className="text-lg font-bold text-surface-900 tracking-wide">{t.pos_total}</span>
            <span className="text-4xl font-black text-surface-900 font-mono">{fmt(total)}</span>
          </div>

          {/* Charge button(s) */}
          {!restaurantModeOn ? (
            <div className="mt-2 space-y-2">
              {!restaurant.heldSaleId && (
                <button
                  onClick={handleHoldBill}
                  disabled={pos.cart.length === 0 || isProcessing}
                  className="w-full btn-secondary py-2.5 text-sm font-semibold rounded-xl disabled:opacity-40"
                >
                  ⏸ Hold Bill
                </button>
              )}
              <button
                onClick={() => setIsPaymentOpen(true)}
                disabled={pos.cart.length === 0}
                className="w-full btn-success py-5 text-lg font-bold rounded-xl disabled:opacity-40 gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                {restaurant.heldSaleId ? 'Resume & ' : ''}{t.pos_charge} {fmt(total)}
                <span className="ml-auto text-xs font-normal opacity-60">F10</span>
              </button>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <button
                onClick={handleSendToKitchen}
                disabled={pos.cart.length === 0 || isProcessing}
                className="w-full btn-secondary py-3 text-sm font-bold rounded-xl disabled:opacity-40"
              >
                🖨 Send to Kitchen
              </button>
              <button
                onClick={() => setIsPaymentOpen(true)}
                disabled={pos.cart.length === 0}
                className="w-full btn-success py-4 text-lg font-bold rounded-xl disabled:opacity-40"
              >
                Settle Bill {fmt(total)}
              </button>
            </div>
          )}

          <p className="text-center text-xs text-surface-400 pb-1 select-none">
            {t.pos_ctrl_del}
          </p>
        </div>
      </div>

      {/* Modals */}
      <PaymentModal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        total={total}
        onConfirm={(restaurantModeOn || restaurant.heldSaleId) ? handleCompleteHeldSale : handlePayment}
        isProcessing={isProcessing}
      />
      <ReceiptModal sale={completedSale} onClose={() => setCompletedSale(null)} />
      <SaleReturnModal isOpen={isReturnOpen} onClose={() => setIsReturnOpen(false)} />

      <AddToCartModal product={pickedProduct} onClose={() => setPickedProduct(null)} onConfirm={handleAddToCart} />

      <Modal isOpen={heldBillsModalOpen} onClose={() => setHeldBillsModalOpen(false)} title="Held Bills" size="md">
        {loadingHeldBills ? (
          <LoadingSpinner />
        ) : heldBillsList.length === 0 ? (
          <p className="text-sm text-surface-400 text-center py-6">No held bills.</p>
        ) : (
          <div className="space-y-2">
            {heldBillsList.map((sale) => (
              <button
                key={sale.id}
                onClick={() => resumeHeldBill(sale)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-surface-200 hover:border-primary-300 hover:bg-primary-50 transition-colors text-left"
              >
                <div>
                  <p className="text-sm font-medium text-surface-900">{sale.customer_name || 'Walk-in'}</p>
                  <p className="text-xs text-surface-400">{new Date(sale.created_at).toLocaleString()}</p>
                </div>
                <span className="font-mono font-semibold text-primary-600">{fmt(sale.total_amount)}</span>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Empty Cart State ─────────────────────────────────────────────────────────
function EmptyCart() {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center h-full py-20 select-none">
      <div className="w-20 h-20 bg-surface-100 rounded-full flex items-center justify-center mb-4">
        <svg className="w-10 h-10 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      </div>
      <p className="text-lg font-semibold text-surface-400">{t.pos_empty_cart}</p>
      <p className="text-sm text-surface-300 mt-1">{t.pos_empty_hint}</p>
      <div className="mt-6 flex items-center gap-2 text-xs text-surface-300">
        <kbd className="px-2 py-1 bg-surface-100 rounded font-mono text-surface-400">F2</kbd>
        <span>to focus search</span>
      </div>
    </div>
  );
}
