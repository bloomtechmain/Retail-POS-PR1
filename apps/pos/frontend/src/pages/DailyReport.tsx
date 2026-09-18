import { useEffect, useState } from 'react';
import { PageContainer } from '../components/layout/Layout';
import { PageLoader } from '../components/ui/LoadingSpinner';
import api from '../services/api';
import { formatCurrency as fmt } from '../utils/formatCurrency';
import { generateDailyReportPdf } from '../utils/generateDailyReportPdf';
import { useSettingsStore } from '../store/settingsStore';

interface TransactionItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface Transaction {
  id: number;
  sale_number: string;
  created_at: string;
  status: string;
  payment_method: string;
  cashier_name: string | null;
  customer_name: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  items: TransactionItem[];
}

interface DailySummary {
  date: string;
  total_transactions: number;
  total_revenue: number;
  total_profit: number;
  total_discounts: number;
  transactions: Transaction[];
}

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  refunded: 'bg-amber-100 text-amber-700',
  voided: 'bg-red-100 text-red-700',
  held: 'bg-surface-100 text-surface-600',
};

// The Basic-tier view — today's numbers only, no date range, no history, no
// other report types. Backed by GET /reports/sales/daily, which computes
// "today" server-side and ignores any date params, so this restriction
// holds even if someone calls the API directly rather than clicking around
// the UI. Full Reports.tsx (Standard+) renders instead of this once the
// 'reports' feature is present — see Reports.tsx's own top-level check.
export default function DailyReport() {
  const [data, setData] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const settings = useSettingsStore((s) => s.settings);

  useEffect(() => {
    api.get('/reports/sales/daily')
      .then((r) => setData(r.data.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoader />;

  return (
    <PageContainer className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Today's Sales</h1>
          <p className="text-surface-500 text-sm mt-1">
            {data ? new Date(data.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''}
          </p>
        </div>
        <button
          onClick={() => data && settings && generateDailyReportPdf(data, settings)}
          disabled={!data || !settings}
          className="btn-secondary btn-sm shrink-0"
        >
          ⬇ Download PDF
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="card p-5">
          <div className="text-xs font-medium text-surface-500 uppercase tracking-wide">Transactions</div>
          <div className="text-2xl font-bold text-surface-900 mt-1">{data?.total_transactions ?? 0}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs font-medium text-surface-500 uppercase tracking-wide">Revenue</div>
          <div className="text-2xl font-bold text-surface-900 mt-1">{fmt(data?.total_revenue ?? 0)}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs font-medium text-surface-500 uppercase tracking-wide">Profit</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{fmt(data?.total_profit ?? 0)}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs font-medium text-surface-500 uppercase tracking-wide">Discounts Given</div>
          <div className="text-2xl font-bold text-red-500 mt-1">{fmt(data?.total_discounts ?? 0)}</div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-surface-200">
          <h2 className="text-sm font-semibold text-surface-900">Every Transaction Today</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-50 text-surface-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">Time</th>
                <th className="text-left px-4 py-2">Sale #</th>
                <th className="text-left px-4 py-2">Cashier</th>
                <th className="text-left px-4 py-2">Customer</th>
                <th className="text-left px-4 py-2">Items</th>
                <th className="text-left px-4 py-2">Payment</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Discount</th>
                <th className="text-right px-4 py-2">Tax</th>
                <th className="text-right px-4 py-2">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {(data?.transactions ?? []).map((tx) => (
                <tr key={tx.id}>
                  <td className="px-4 py-2 whitespace-nowrap text-surface-600">
                    {new Date(tx.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap font-medium text-surface-900">{tx.sale_number}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-surface-600">{tx.cashier_name ?? '-'}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-surface-600">{tx.customer_name ?? 'Walk-in'}</td>
                  <td className="px-4 py-2 text-surface-600 max-w-xs">
                    {tx.items.map((it) => `${Number(it.quantity)}x ${it.product_name}`).join(', ')}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-surface-600 capitalize">{tx.payment_method}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[tx.status] ?? 'bg-surface-100 text-surface-600'}`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-right text-surface-600">{fmt(tx.discount_amount)}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-right text-surface-600">{fmt(tx.tax_amount)}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-right font-semibold text-surface-900">{fmt(tx.total_amount)}</td>
                </tr>
              ))}
              {(data?.transactions ?? []).length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-surface-400">No transactions yet today.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-5 bg-primary-50 border border-primary-200">
        <p className="text-sm text-primary-800">
          This is today's summary only. Upgrade to Standard or above for full sales history, per-product breakdowns, cashier accountability, stock movement logs, and more — any date range, not just today.
        </p>
      </div>
    </PageContainer>
  );
}
