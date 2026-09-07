import { useState, useEffect, useCallback } from 'react';
import { Terminal } from '../../types';
import { useToastStore } from '../../store/toastStore';
import api from '../../services/api';

interface TerminalRoleAPI {
  isTerminal: () => Promise<{ role: 'terminal'; serverHost: string; serverPort: number } | null>;
  disconnect: () => Promise<{ success: boolean }>;
  getServerInfo: () => Promise<{ lanIp: string | null; port: number }>;
}

declare global {
  interface Window {
    electronTerminalAPI?: TerminalRoleAPI;
  }
}

export function MultiTerminalCard() {
  const toast = useToastStore();
  const [roleInfo, setRoleInfo] = useState<{ role: 'terminal'; serverHost: string; serverPort: number } | null | undefined>(undefined);
  const [serverInfo, setServerInfo] = useState<{ lanIp: string | null; port: number } | null>(null);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  const load = useCallback(async () => {
    if (!window.electronTerminalAPI) { setLoading(false); return; }
    setLoading(true);
    try {
      const role = await window.electronTerminalAPI.isTerminal();
      setRoleInfo(role);
      if (!role) {
        const [info, list] = await Promise.all([
          window.electronTerminalAPI.getServerInfo(),
          api.get('/terminals').catch(() => ({ data: { data: [] } })),
        ]);
        setServerInfo(info);
        setTerminals(list.data.data);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const disconnect = async () => {
    if (!window.electronTerminalAPI) return;
    if (!confirm('Disconnect this device from the Server and use it standalone? You\'ll need to activate it with its own license key afterward.')) return;
    setDisconnecting(true);
    try {
      await window.electronTerminalAPI.disconnect();
      // App relaunches itself right after this resolves.
    } catch {
      toast.error('Failed to disconnect');
      setDisconnecting(false);
    }
  };

  const removeTerminal = async (id: number) => {
    if (!confirm('Remove this terminal? It will need to reconnect (and count against the seat limit again) to be used here.')) return;
    try {
      await api.delete(`/terminals/${id}`);
      load();
    } catch {
      toast.error('Failed to remove terminal');
    }
  };

  if (!window.electronTerminalAPI || loading) return null;

  if (roleInfo) {
    return (
      <div className="space-y-3">
        <div>
          <h3 className="font-semibold text-surface-900">Multi-Terminal</h3>
          <p className="text-surface-500 text-sm mt-0.5">
            This device is a <strong>Terminal</strong>, connected to the Server at{' '}
            <span className="font-mono">{roleInfo.serverHost}:{roleInfo.serverPort}</span>. It has no local database of its own.
          </p>
        </div>
        <button onClick={disconnect} disabled={disconnecting} className="btn-secondary btn-sm">
          {disconnecting ? 'Disconnecting...' : 'Disconnect from Server'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-surface-900">Multi-Terminal</h3>
        <p className="text-surface-500 text-sm mt-0.5">
          Other tills on this network can connect to this machine as a <strong>Terminal</strong> — give them the address below during their setup.
        </p>
      </div>

      {serverInfo && (
        <div className="bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 text-sm">
          <span className="text-surface-500">This Server's address: </span>
          <span className="font-mono font-semibold">{serverInfo.lanIp || 'Could not detect — check ipconfig'}:{serverInfo.port}</span>
        </div>
      )}

      {terminals.length === 0 ? (
        <p className="text-sm text-surface-400">No terminals connected yet.</p>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Last Seen</th><th></th></tr>
            </thead>
            <tbody>
              {terminals.map((t) => (
                <tr key={t.id}>
                  <td className="font-medium">{t.name || 'Unnamed terminal'}</td>
                  <td className="text-sm text-surface-500">{new Date(t.last_seen_at).toLocaleString()}</td>
                  <td>
                    <button onClick={() => removeTerminal(t.id)} className="btn-sm text-red-500 hover:bg-red-50 rounded-lg px-2 py-1 text-xs font-medium">Remove</button>
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
