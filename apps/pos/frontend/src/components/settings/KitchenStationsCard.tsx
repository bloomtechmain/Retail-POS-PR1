import { useState, useEffect, useCallback } from 'react';
import { KitchenStation } from '../../types';
import { useToastStore } from '../../store/toastStore';
import { getAgentPrinters, getAgentPrinterConfig, setStationPrinter, isElectronPrint, checkPrintAgentStatus } from '../../utils/printAgent';
import api from '../../services/api';
import { AxiosError } from 'axios';

export function KitchenStationsCard() {
  const toast = useToastStore();
  const [stations, setStations] = useState<KitchenStation[]>([]);
  const [printerMap, setPrinterMap] = useState<Record<string, string>>({});
  const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);
  const [agentOnline, setAgentOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stationsRes, online] = await Promise.all([api.get('/kitchen-stations'), checkPrintAgentStatus()]);
      setStations(stationsRes.data.data);
      setAgentOnline(online);
      if (online) {
        const [printers, config] = await Promise.all([getAgentPrinters(), getAgentPrinterConfig()]);
        setAvailablePrinters(printers);
        setPrinterMap(config.printers);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addStation = async () => {
    if (!name.trim()) { toast.error('Enter a station name'); return; }
    setSaving(true);
    try {
      await api.post('/kitchen-stations', { name: name.trim() });
      setName('');
      toast.success('Kitchen station added');
      load();
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Failed to add station');
    } finally { setSaving(false); }
  };

  const toggleActive = async (s: KitchenStation) => {
    try {
      await api.put(`/kitchen-stations/${s.id}`, { name: s.name, is_active: !s.is_active });
      load();
    } catch {
      toast.error('Failed to update station');
    }
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this kitchen station? Products assigned to it will no longer route to any station.')) return;
    try {
      await api.delete(`/kitchen-stations/${id}`);
      toast.success('Station deleted');
      load();
    } catch {
      toast.error('Failed to delete station');
    }
  };

  const assignPrinter = async (stationId: number, printerName: string) => {
    try {
      await setStationPrinter(stationId, printerName);
      setPrinterMap((prev) => {
        const next = { ...prev };
        if (printerName) next[String(stationId)] = printerName;
        else delete next[String(stationId)];
        return next;
      });
    } catch {
      toast.error('Failed to save printer assignment');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-surface-900">Kitchen Stations</h3>
        <p className="text-surface-500 text-sm mt-0.5">
          Kitchen tickets (KOT) route to a station based on each product's assigned station (set on the product itself). Assign which physical printer on this device prints each station's tickets.
        </p>
      </div>

      {!agentOnline && (
        <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {isElectronPrint() ? 'Loading printer list…' : 'Print Agent not running — install/start it under the Receipt Printer section above to assign station printers.'}
        </p>
      )}

      <div className="flex items-end gap-2">
        <div>
          <label className="label text-xs">New Station</label>
          <input className="input py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grill, Bar, Dessert" />
        </div>
        <button onClick={addStation} disabled={saving} className="btn-primary btn-sm">
          {saving ? 'Saving...' : 'Add Station'}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-surface-400">Loading...</p>
      ) : stations.length === 0 ? (
        <p className="text-sm text-surface-400">No kitchen stations configured yet.</p>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Station</th>
                <th>Printer (this device)</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stations.map((s) => (
                <tr key={s.id}>
                  <td className="font-medium">{s.name}</td>
                  <td>
                    <select
                      className="input py-1.5 text-sm"
                      value={printerMap[String(s.id)] || ''}
                      onChange={(e) => assignPrinter(s.id, e.target.value)}
                      disabled={!agentOnline}
                    >
                      <option value="">Use default receipt printer</option>
                      {availablePrinters.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button onClick={() => toggleActive(s)} className={`badge ${s.is_active ? 'badge-green' : 'badge-gray'}`}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td>
                    <button onClick={() => remove(s.id)} className="btn-sm text-red-500 hover:bg-red-50 rounded-lg px-2 py-1 text-xs font-medium">Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
