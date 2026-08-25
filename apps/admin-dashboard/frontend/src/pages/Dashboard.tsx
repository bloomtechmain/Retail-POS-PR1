import { useEffect, useState } from 'react';
import { fetchDashboard, AdminDashboardStats, AgentDashboardStats, RecentCustomer } from '../services/api';
import { useAuth } from '../AuthContext';
import { PageLoader } from '../components/PageLoader';

const PLAN_LABELS: Record<string, string> = {
  basic: 'Basic',
  standard: 'Standard',
  professional: 'Professional',
  enterprise: 'Enterprise',
};

const hasOwnStats = (data: AdminDashboardStats | AgentDashboardStats): data is AgentDashboardStats =>
  'own' in data;

function BreakdownBars({ items, labelFor }: { items: Array<{ count: number; [k: string]: unknown }>; labelFor: (item: any) => string }) {
  const total = items.reduce((sum, i) => sum + i.count, 0) || 1;
  if (items.length === 0) {
    return <p className="text-sm text-surface-400">No data yet.</p>;
  }
  return (
    <div className="space-y-2.5">
      {items.map((item, i) => {
        const pct = Math.round((item.count / total) * 100);
        return (
          <div key={i}>
            <div className="flex justify-between text-xs text-surface-600 mb-1">
              <span className="capitalize">{labelFor(item)}</span>
              <span className="font-medium text-surface-900">{item.count} ({pct}%)</span>
            </div>
            <div className="h-2 rounded-full bg-surface-100 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary-400 to-primary-600 rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecentCustomersTable({ customers, showAgent }: { customers: RecentCustomer[]; showAgent: boolean }) {
  if (customers.length === 0) {
    return <p className="text-sm text-surface-400 py-6 text-center">No customers yet.</p>;
  }
  return (
    <div className="table-wrapper">
      <table className="table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Delivery</th>
            <th>Plan</th>
            {showAgent && <th>Agent</th>}
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id}>
              <td>
                <div className="font-medium text-surface-900">{c.customer_name}</div>
                <div className="text-xs text-surface-500">{c.customer_email}</div>
              </td>
              <td>
                <span className={c.delivery_type === 'online' ? 'badge-blue' : 'badge-gray'}>{c.delivery_type}</span>
              </td>
              <td className="capitalize">{PLAN_LABELS[c.plan_key] || c.plan_key}</td>
              {showAgent && <td>{c.agent_name}</td>}
              <td className="text-surface-500 text-xs">{new Date(c.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DailySignupsChart({ data }: { data: Array<{ day: string; count: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex items-end gap-1.5 h-32">
      {data.map((d) => (
        <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group relative">
          <div
            className="w-full bg-gradient-to-t from-primary-500 to-primary-400 rounded-t-sm min-h-[2px] transition-all"
            style={{ height: `${(d.count / max) * 100}%` }}
            title={`${d.day}: ${d.count}`}
          />
          <span className="text-[10px] text-surface-400">{d.day.slice(8)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { staff } = useAuth();
  const [stats, setStats] = useState<AdminDashboardStats | AgentDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard().then(setStats).finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoader />;
  if (!stats) return null;

  const own = hasOwnStats(stats) ? stats.own : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Platform Dashboard</h1>
        <p className="text-surface-500 text-sm mt-1">
          {own ? `Welcome back, ${staff?.name}. Live status across every agent and customer on the platform.` : 'Live status across every agent and customer on the platform.'}
        </p>
      </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="stat-card">
            <span className="stat-label">Agents</span>
            <span className="stat-value">{stats.total_agents}</span>
            <span className="text-xs text-surface-500">{stats.active_agents} active</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Customers</span>
            <span className="stat-value">{stats.total_customers}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Businesses (Tenants)</span>
            <span className="stat-value">{stats.total_tenants}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">POS User Logins</span>
            <span className="stat-value">{stats.total_pos_users}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">New (14 days)</span>
            <span className="stat-value">{stats.daily_signups_last_14_days.reduce((s, d) => s + d.count, 0)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="card p-5 lg:col-span-2">
            <h3 className="font-semibold text-surface-900 mb-4">New Customers — Last 14 Days</h3>
            <DailySignupsChart data={stats.daily_signups_last_14_days} />
          </div>
          <div className="card p-5">
            <h3 className="font-semibold text-surface-900 mb-4">Delivery Type</h3>
            <BreakdownBars items={stats.delivery_breakdown} labelFor={(i) => i.delivery_type} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="card p-5">
            <h3 className="font-semibold text-surface-900 mb-4">Plan Breakdown</h3>
            <BreakdownBars items={stats.plan_breakdown} labelFor={(i) => PLAN_LABELS[i.plan_key] || i.plan_key} />
          </div>
          <div className="card p-5 lg:col-span-2">
            <h3 className="font-semibold text-surface-900 mb-4">Top Agents</h3>
            {stats.top_agents.length === 0 ? (
              <p className="text-sm text-surface-400">No agents yet.</p>
            ) : (
              <div className="space-y-2">
                {stats.top_agents.map((a, i) => (
                  <div key={a.id} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-3">
                      <span className="w-5 text-xs text-surface-400 font-medium">#{i + 1}</span>
                      <div>
                        <div className="text-sm font-medium text-surface-900">{a.name}</div>
                        <div className="text-xs text-surface-500">{a.email}</div>
                      </div>
                    </div>
                    <span className="badge-blue">{a.customer_count} customer{a.customer_count === 1 ? '' : 's'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-surface-900 mb-4">Recent Customers</h3>
          <RecentCustomersTable customers={stats.recent_customers} showAgent />
        </div>

      {own && (
        <div className="space-y-4 pt-2 border-t border-surface-200">
          <div className="pt-4">
            <h2 className="text-lg font-bold text-surface-900">Your Customers</h2>
            <p className="text-surface-500 text-sm mt-1">Your own customer-scoped numbers within the platform above.</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="stat-card">
              <span className="stat-label">My Customers</span>
              <span className="stat-value">{own.total_customers}</span>
            </div>
            {own.delivery_breakdown.map((d) => (
              <div className="stat-card" key={d.delivery_type}>
                <span className="stat-label capitalize">{d.delivery_type}</span>
                <span className="stat-value">{d.count}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="font-semibold text-surface-900 mb-4">Delivery Type</h3>
              <BreakdownBars items={own.delivery_breakdown} labelFor={(i) => i.delivery_type} />
            </div>
            <div className="card p-5">
              <h3 className="font-semibold text-surface-900 mb-4">Plan Breakdown</h3>
              <BreakdownBars items={own.plan_breakdown} labelFor={(i) => PLAN_LABELS[i.plan_key] || i.plan_key} />
            </div>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-surface-900 mb-4">Your Recent Customers</h3>
            <RecentCustomersTable customers={own.recent_customers} showAgent={false} />
          </div>
        </div>
      )}
      </div>
  );
}
