import { useCallback, useEffect, useState } from 'react';
import { useToastStore } from '../../store/toastStore';
import {
  checkPrintAgentStatus,
  getAgentDefaultPrinter,
  getAgentPrinters,
  isElectronPrint,
  setAgentDefaultPrinter,
} from '../../utils/printAgent';

type AgentState = 'checking' | 'offline' | 'online';

export function PrintAgentCard() {
  const toast = useToastStore();
  const [state, setState] = useState<AgentState>('checking');
  const [printers, setPrinters] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const online = await checkPrintAgentStatus();
    if (!online) {
      setState('offline');
      return;
    }
    setState('online');
    try {
      const [list, current] = await Promise.all([getAgentPrinters(), getAgentDefaultPrinter()]);
      setPrinters(list);
      setSelected((prev) => current || prev || list[0] || '');
    } catch {
      // Agent answered /health but not /printers — leave the list as-is,
      // status still reads "online".
    }
  }, []);

  useEffect(() => {
    refresh();
    // Polls so the status/printer list updates live right after the
    // customer installs and launches the agent, without a page reload.
    const interval = setInterval(refresh, 4000);
    return () => clearInterval(interval);
  }, [refresh]);

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await setAgentDefaultPrinter(selected);
      toast.success(`Default printer set to "${selected}"`);
    } catch {
      toast.error('Could not save — is the Print Agent still running?');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-6 mt-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h3 className="font-semibold text-surface-900">Receipt Printer</h3>
          <p className="text-surface-500 text-sm mt-0.5">
            {isElectronPrint()
              ? 'Choose which printer this device prints receipts to — no print dialog.'
              : 'Install the Print Agent once so bills print straight to your receipt printer — no print dialog.'}
          </p>
        </div>
        {state === 'checking' && (
          <span className="shrink-0 px-2.5 py-1 rounded-full text-xs font-medium bg-surface-100 text-surface-500">Checking…</span>
        )}
        {state === 'offline' && (
          <span className="shrink-0 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-600">Not installed</span>
        )}
        {state === 'online' && (
          <span className="shrink-0 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
            {selected ? `Ready — ${selected}` : isElectronPrint() ? 'Pick a printer' : 'Installed — pick a printer'}
          </span>
        )}
      </div>

      {state === 'offline' && !isElectronPrint() && (
        <a href="/downloads/BloomPOS-PrintAgent-Setup.exe" className="btn-primary inline-block">
          Download Print Agent
        </a>
      )}

      {state === 'online' && (
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label className="label">Printer</label>
            {printers.length === 0 ? (
              <p className="text-sm text-surface-500">No printers found on that PC — plug one in, then reopen this page.</p>
            ) : (
              <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
                {printers.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            )}
          </div>
          <button className="btn-primary" disabled={saving || !selected} onClick={save}>
            {saving ? 'Saving...' : 'Save as Default'}
          </button>
        </div>
      )}
    </div>
  );
}
