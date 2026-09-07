import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '../components/layout/Layout';
import { PageLoader } from '../components/ui/LoadingSpinner';
import { DiningTable, CartItem } from '../types';
import { useToastStore } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';
import { usePOSStore } from '../store/posStore';
import { useRestaurantStore } from '../store/restaurantStore';
import api from '../services/api';
import { AxiosError } from 'axios';

const STATUS_STYLE: Record<DiningTable['status'], string> = {
  available: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  occupied: 'bg-red-50 border-red-200 text-red-700',
  reserved: 'bg-amber-50 border-amber-200 text-amber-700',
};

export default function TableGrid() {
  const navigate = useNavigate();
  const toast = useToastStore();
  const { user } = useAuthStore();
  const pos = usePOSStore();
  const restaurant = useRestaurantStore();
  const isAdmin = user?.role_name === 'admin';

  const [tables, setTables] = useState<DiningTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [newCapacity, setNewCapacity] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/tables');
      setTables(r.data.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addTable = async () => {
    if (!newName.trim()) { toast.error('Enter a table name'); return; }
    setSaving(true);
    try {
      await api.post('/tables', { name: newName.trim(), capacity: newCapacity ? parseInt(newCapacity) : undefined });
      setNewName(''); setNewCapacity('');
      load();
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Failed to add table');
    } finally { setSaving(false); }
  };

  const removeTable = async (id: number) => {
    if (!confirm('Delete this table?')) return;
    try {
      await api.delete(`/tables/${id}`);
      load();
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Failed to delete table (it may have an open order)');
    }
  };

  const openTable = async (table: DiningTable) => {
    if (table.status !== 'available' && table.status !== 'occupied') return;
    setOpening(table.id);
    try {
      if (table.status === 'available') {
        restaurant.startOrder('dine_in', table.id, table.name);
        pos.loadCart([]);
        navigate('/pos');
        return;
      }

      // Occupied — resume its held order: find the held sale, load its
      // current items as the starting cart, and record them as already
      // sent to the kitchen (a fresh "Send to Kitchen" from here should
      // only fire for items added after resuming, not re-fire the whole order).
      const heldRes = await api.get(`/sales?status=held&table_id=${table.id}&limit=1`);
      const held = heldRes.data.data?.[0];
      if (!held) {
        toast.error('No open order found for this table');
        return;
      }
      const detail = await api.get(`/sales/${held.id}`);
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

      const quantities: Record<number, number> = {};
      for (const item of items) quantities[item.product_id] = (quantities[item.product_id] || 0) + item.quantity;

      restaurant.startOrder('dine_in', table.id, table.name);
      restaurant.setHeldSale(held.id);
      restaurant.recordSent(quantities);
      pos.loadCart(items);
      navigate('/pos');
    } finally {
      setOpening(null);
    }
  };

  if (loading) return <PageLoader />;

  return (
    <PageContainer>
      <div className="page-header">
        <h1 className="page-title">Tables</h1>
      </div>

      {isAdmin && (
        <div className="card p-4 mb-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="label text-xs">New Table</label>
            <input className="input py-2 text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Table 5" />
          </div>
          <div>
            <label className="label text-xs">Capacity</label>
            <input type="number" className="input py-2 text-sm w-24" value={newCapacity} onChange={(e) => setNewCapacity(e.target.value)} min="1" placeholder="Optional" />
          </div>
          <button onClick={addTable} disabled={saving} className="btn-primary btn-sm">
            {saving ? 'Saving...' : 'Add Table'}
          </button>
        </div>
      )}

      {tables.length === 0 ? (
        <p className="text-sm text-surface-400 text-center py-10">No tables configured yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {tables.map((table) => (
            <div
              key={table.id}
              className={`relative rounded-xl border-2 p-4 text-center transition-all ${STATUS_STYLE[table.status]} ${
                table.status === 'reserved' ? 'cursor-default opacity-70' : 'cursor-pointer hover:shadow-md'
              }`}
              onClick={() => openTable(table)}
            >
              {isAdmin && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeTable(table.id); }}
                  className="absolute top-1 right-1 text-xs text-surface-400 hover:text-red-500 px-1"
                >
                  ✕
                </button>
              )}
              <div className="text-lg font-bold">{table.name}</div>
              {table.capacity && <div className="text-xs opacity-70">Seats {table.capacity}</div>}
              <div className="text-xs font-semibold uppercase tracking-wide mt-2">
                {opening === table.id ? '...' : table.status}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
