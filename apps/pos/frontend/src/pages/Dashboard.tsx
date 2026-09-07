import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageContainer } from '../components/layout/Layout';
import { PageLoader } from '../components/ui/LoadingSpinner';
import { DashboardStats } from '../types';
import api from '../services/api';
import { useT } from '../i18n/translations';
import { formatCurrency as fmt } from '../utils/formatCurrency';

const fmtNum = (n: number) => Number(n).toLocaleString('en-US');

// Matches the app's existing stat-card palette (blue/green/purple/amber/red)
// so chart colors read as "the same app," not a bolted-on library default.
const CHART_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];

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
          <span className="hidden sm:inline text-sm text-surface-500">
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
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.revenue_trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={60} />
                  <Tooltip
                    formatter={(value: number) => fmt(value)}
                    labelFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <Bar dataKey="revenue" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Payment Method Mix */}
        <div className="card">
          <div className="px-5 py-4 border-b border-surface-200">
            <h3 className="font-semibold text-surface-900">{t.dashboard_payment_mix}</h3>
          </div>
          <div className="p-4">
            {stats.payment_method_mix.length === 0 ? (
              <p className="text-sm text-surface-400 text-center py-4">No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={stats.payment_method_mix}
                    dataKey="revenue"
                    nameKey="payment_method"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {stats.payment_method_mix.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => fmt(value)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
