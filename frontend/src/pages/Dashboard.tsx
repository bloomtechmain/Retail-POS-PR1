import { useEffect, useState } from 'react';
import { PageContainer } from '../components/layout/Layout';
import { PageLoader } from '../components/ui/LoadingSpinner';
import { DashboardStats } from '../types';
import api from '../services/api';
import { useT } from '../i18n/translations';

const fmt = (n: number) => `LKR ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum = (n: number) => Number(n).toLocaleString('en-US');

function StatCard({ label, value, sub, color = 'blue' }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  const colors: Record<string, string> = {
    blue: 'bg-primary-50 text-primary-600',
    green: 'bg-emerald-50 text-emerald-600',
    purple: 'bg-violet-50 text-violet-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <div className="stat-card">
      <p className="stat-label">{label}</p>
      <p className={`stat-value ${color === 'green' ? 'text-emerald-600' : ''}`}>{value}</p>
      {sub && <p className="text-xs text-surface-500 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const t = useT();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/dashboard')
      .then((r) => setStats(r.data.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoader />;
  if (!stats) return null;

  return (
    <PageContainer>
      <div className="page-header">
        <h1 className="page-title">{t.dashboard_title}</h1>
        <div className="flex items-center gap-2">
          {stats.open_shift ? (
            <span className="badge-green">{t.shifts_open_btn}</span>
          ) : (
            <span className="badge-red">{t.dashboard_no_shift}</span>
          )}
          <span className="text-sm text-surface-500">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Today stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label={t.dashboard_today_revenue} value={fmt(stats.today_revenue)} color="blue" />
        <StatCard label={t.dashboard_today_profit} value={fmt(stats.today_profit)} color="green" />
        <StatCard label={t.dashboard_today_tx} value={fmtNum(stats.today_transactions)} color="purple" />
        <StatCard label={t.dashboard_today_items} value={fmtNum(stats.today_items_sold)} color="amber" />
      </div>

      {/* Month & period stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label={t.dashboard_month_revenue} value={fmt(stats.month_revenue)} color="blue" />
        <StatCard label={t.dashboard_month_profit} value={fmt(stats.month_profit)} color="green" />
        <StatCard label={t.dashboard_low_stock} value={fmtNum(stats.low_stock_count)} color="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Products */}
        <div className="card">
          <div className="px-5 py-4 border-b border-surface-200">
            <h3 className="font-semibold text-surface-900">{t.dashboard_top_products}</h3>
          </div>
          <div className="p-2">
            {stats.top_products.length === 0 ? (
              <p className="text-sm text-surface-400 px-3 py-4 text-center">No sales data</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t.dashboard_col_product}</th>
                    <th className="text-right">{t.dashboard_col_qty}</th>
                    <th className="text-right">{t.dashboard_col_revenue}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.top_products.map((p, i) => (
                    <tr key={i}>
                      <td className="font-medium">{p.product_name}</td>
                      <td className="text-right font-mono">{p.qty_sold}</td>
                      <td className="text-right font-mono text-primary-600">{fmt(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Revenue Trend */}
        <div className="card">
          <div className="px-5 py-4 border-b border-surface-200">
            <h3 className="font-semibold text-surface-900">{t.dashboard_revenue_trend}</h3>
          </div>
          <div className="p-4">
            {stats.revenue_trend.length === 0 ? (
              <p className="text-sm text-surface-400 text-center py-4">No data available</p>
            ) : (
              <div className="space-y-2">
                {stats.revenue_trend.slice(-7).map((d, i) => {
                  const max = Math.max(...stats.revenue_trend.map((x) => x.revenue));
                  const width = max > 0 ? (d.revenue / max) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-surface-500 w-20 shrink-0">
                        {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      <div className="flex-1 bg-surface-100 rounded-full h-2">
                        <div
                          className="bg-primary-500 h-2 rounded-full transition-all"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-surface-700 w-20 text-right shrink-0">
                        {fmt(d.revenue)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
