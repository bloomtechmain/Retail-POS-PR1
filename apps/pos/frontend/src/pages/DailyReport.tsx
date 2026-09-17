import { useEffect, useState } from 'react';
import { PageContainer } from '../components/layout/Layout';
import { PageLoader } from '../components/ui/LoadingSpinner';
import api from '../services/api';
import { formatCurrency as fmt } from '../utils/formatCurrency';

interface DailySummary {
  date: string;
  total_transactions: number;
  total_revenue: number;
  total_profit: number;
  total_discounts: number;
}

// The Basic-tier view — today's numbers only, no date range, no history, no
// other report types. Backed by GET /reports/sales/daily, which computes
// "today" server-side and ignores any date params, so this restriction
// holds even if someone calls the API directly rather than clicking around
// the UI. Full Reports.tsx (Standard+) renders instead of this once the
// 'reports' feature is present — see Reports.tsx's own top-level check.
export default function DailyReport() {
  const [data, setData] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/sales/daily')
      .then((r) => setData(r.data.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoader />;

  return (
    <PageContainer className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-surface-900">Today's Sales</h1>
        <p className="text-surface-500 text-sm mt-1">
          {data ? new Date(data.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''}
        </p>
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

      <div className="card p-5 bg-primary-50 border border-primary-200">
        <p className="text-sm text-primary-800">
          This is today's summary only. Upgrade to Standard or above for full sales history, per-product breakdowns, cashier accountability, stock movement logs, and more — any date range, not just today.
        </p>
      </div>
    </PageContainer>
  );
}
