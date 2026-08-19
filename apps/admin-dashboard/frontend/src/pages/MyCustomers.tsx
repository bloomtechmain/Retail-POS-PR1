import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listCustomers, PlatformCustomer } from '../services/api';
import { useAuth } from '../AuthContext';

type Filter = 'all' | 'online' | 'offline';

function RenewalBadge({ c }: { c: PlatformCustomer }) {
  if (c.is_expired) {
    return <span className="badge-red">Expired {Math.abs(c.days_remaining)}d ago</span>;
  }
  if (c.days_remaining <= 5) {
    return <span className="badge-yellow">{c.days_remaining}d left</span>;
  }
  return <span className="badge-green">{c.days_remaining}d left</span>;
}

export default function MyCustomers() {
  const { staff } = useAuth();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<PlatformCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    listCustomers().then(setCustomers).finally(() => setLoading(false));
  }, []);

  const filtered = customers.filter((c) => filter === 'all' || c.delivery_type === filter);
  const tabClass = (t: Filter) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
      filter === t ? 'bg-primary-600 text-white' : 'text-surface-600 hover:bg-surface-100'
    }`;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-surface-900">
          {staff?.role === 'admin' ? 'All Customers' : 'My Customers'}
        </h1>
        <p className="text-surface-500 text-sm mt-1">Every customer account created through this dashboard. Click a row for full details.</p>
      </div>

      <div className="flex gap-1 mb-4">
        <button className={tabClass('all')} onClick={() => setFilter('all')}>All ({customers.length})</button>
        <button className={tabClass('online')} onClick={() => setFilter('online')}>
          Online ({customers.filter((c) => c.delivery_type === 'online').length})
        </button>
        <button className={tabClass('offline')} onClick={() => setFilter('offline')}>
          Offline ({customers.filter((c) => c.delivery_type === 'offline').length})
        </button>
      </div>

      <div className="card table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Delivery</th>
              <th>Plan</th>
              {staff?.role === 'admin' && <th>Agent</th>}
              <th>Started</th>
              <th>Renewal</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="text-center text-surface-400 py-8">Loading...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center text-surface-400 py-8">No customers yet.</td></tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className="cursor-pointer" onClick={() => navigate(`/customers/${c.id}`)}>
                <td>
                  <div className="font-medium text-surface-900">{c.customer_name}</div>
                  <div className="text-xs text-surface-500">{c.customer_email}</div>
                </td>
                <td>
                  <span className={c.delivery_type === 'online' ? 'badge-blue' : 'badge-gray'}>
                    {c.delivery_type}
                  </span>
                </td>
                <td>
                  <span className="capitalize">{c.plan_key}</span>
                  {c.custom_features && <span className="text-xs text-surface-400 ml-1">(customized)</span>}
                </td>
                {staff?.role === 'admin' && <td>{c.agent_name}</td>}
                <td className="text-surface-500 text-xs">{new Date(c.created_at).toLocaleDateString()}</td>
                <td><RenewalBadge c={c} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
