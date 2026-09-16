import { useCallback, useEffect, useState } from 'react';
import { useToastStore } from '../../store/toastStore';
import { useSettingsStore } from '../../store/settingsStore';
import { ReceiptPreview, TEMPLATE_INFO } from './BillTemplatePreview';
import {
  checkPrintAgentStatus,
  getAgentDefaultPrinter,
  getAgentPrinterConfig,
  getAgentPrinters,
  isElectronPrint,
  PaperWidth,
  ReceiptCopyDestination,
  ReceiptLanguage,
  ReceiptTemplateName,
  setAgentDefaultPrinter,
  setPaperWidth,
  setReceiptCopies,
  setReceiptLanguage,
  setReceiptTemplate,
} from '../../utils/printAgent';

type AgentState = 'checking' | 'offline' | 'online';

export function PrintAgentCard() {
  const toast = useToastStore();
  const settings = useSettingsStore((s) => s.settings);
  const [state, setState] = useState<AgentState>('checking');
  const [printers, setPrinters] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);
  const [copies, setCopies] = useState<ReceiptCopyDestination[]>([]);
  const [newCopyLabel, setNewCopyLabel] = useState('');
  const [newCopyPrinter, setNewCopyPrinter] = useState('');
  const [savingCopies, setSavingCopies] = useState(false);
  const [paperWidth, setPaperWidthState] = useState<PaperWidth>('80mm');
  const [template, setTemplateState] = useState<ReceiptTemplateName>('standard');
  const [language, setLanguageState] = useState<ReceiptLanguage>('en');
  const [savingFormat, setSavingFormat] = useState(false);

  const refresh = useCallback(async () => {
    const online = await checkPrintAgentStatus();
    if (!online) {
      setState('offline');
      return;
    }
    setState('online');
    try {
      const [list, current, config] = await Promise.all([getAgentPrinters(), getAgentDefaultPrinter(), getAgentPrinterConfig()]);
      setPrinters(list);
      setSelected((prev) => current || prev || list[0] || '');
      setCopies(config.receiptCopies);
      setPaperWidthState(config.paperWidth);
      setTemplateState(config.receiptTemplate);
      setLanguageState(config.receiptLanguage);
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

  const changePaperWidth = async (value: PaperWidth) => {
    setSavingFormat(true);
    try {
      await setPaperWidth(value);
      setPaperWidthState(value);
    } catch {
      toast.error('Could not save — is the Print Agent still running?');
    } finally {
      setSavingFormat(false);
    }
  };

  const changeTemplate = async (value: ReceiptTemplateName) => {
    setSavingFormat(true);
    try {
      await setReceiptTemplate(value);
      setTemplateState(value);
    } catch {
      toast.error('Could not save — is the Print Agent still running?');
    } finally {
      setSavingFormat(false);
    }
  };

  const changeLanguage = async (value: ReceiptLanguage) => {
    setSavingFormat(true);
    try {
      await setReceiptLanguage(value);
      setLanguageState(value);
    } catch {
      toast.error('Could not save — is the Print Agent still running?');
    } finally {
      setSavingFormat(false);
    }
  };

  const addCopy = async () => {
    if (!newCopyPrinter) return;
    setSavingCopies(true);
    try {
      const next = [...copies, { label: newCopyLabel.trim() || newCopyPrinter, printerName: newCopyPrinter }];
      await setReceiptCopies(next);
      setCopies(next);
      setNewCopyLabel('');
      setNewCopyPrinter('');
      toast.success('Added — every bill now also prints there');
    } catch {
      toast.error('Could not save — is the Print Agent still running?');
    } finally {
      setSavingCopies(false);
    }
  };

  const removeCopy = async (index: number) => {
    setSavingCopies(true);
    try {
      const next = copies.filter((_, i) => i !== index);
      await setReceiptCopies(next);
      setCopies(next);
    } catch {
      toast.error('Could not save — is the Print Agent still running?');
    } finally {
      setSavingCopies(false);
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

      {state === 'online' && (
        <div className="mt-5 pt-5 border-t border-surface-100">
          <h4 className="text-sm font-medium text-surface-800">Bill format</h4>
          <p className="text-surface-500 text-xs mt-0.5 mb-3">
            Match your printer's paper roll and pick how bills are laid out.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Paper width</label>
              <select
                className="input py-2 text-sm"
                value={paperWidth}
                disabled={savingFormat}
                onChange={(e) => changePaperWidth(e.target.value as PaperWidth)}
              >
                <option value="80mm">80mm (48 characters)</option>
                <option value="58mm">58mm (32 characters)</option>
              </select>
            </div>
            <div>
              <label className="label text-xs">Bill language</label>
              <select
                className="input py-2 text-sm"
                value={language}
                disabled={savingFormat}
                onChange={(e) => changeLanguage(e.target.value as ReceiptLanguage)}
              >
                <option value="en">English</option>
                <option value="si">සිංහල (Sinhala)</option>
              </select>
              <p className="text-surface-400 text-xs mt-1">
                Product/customer names print in whatever script they're entered in either way.
              </p>
            </div>
          </div>

          <div className="mt-5">
            <label className="label text-xs">Bill template</label>
            <p className="text-surface-400 text-xs mt-0.5 mb-3">
              Pick how the printed bill is laid out — click a template to make it the one that prints.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {TEMPLATE_INFO.map((t) => {
                const isSelected = template === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={savingFormat}
                    onClick={() => changeTemplate(t.id)}
                    className={`text-left rounded-lg border-2 transition-colors overflow-hidden focus:outline-none ${
                      isSelected ? 'border-primary-500 ring-2 ring-primary-100' : 'border-surface-200 hover:border-surface-300'
                    } ${savingFormat ? 'opacity-60 cursor-wait' : ''}`}
                  >
                    <div className="relative bg-surface-100 p-2">
                      <div className="max-h-[520px] overflow-y-auto rounded-sm shadow-sm">
                        <ReceiptPreview template={t.id} settings={settings} language={language} />
                      </div>
                      {isSelected && (
                        <span className="absolute top-1.5 right-1.5 flex items-center justify-center w-5 h-5 rounded-full bg-primary-500 text-white text-xs">
                          ✓
                        </span>
                      )}
                    </div>
                    <div className="px-2.5 py-2">
                      <div className="text-sm font-medium text-surface-800">{t.name}</div>
                      <div className="text-xs text-surface-500 mt-0.5">{t.blurb}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {state === 'online' && printers.length > 0 && (
        <div className="mt-5 pt-5 border-t border-surface-100">
          <h4 className="text-sm font-medium text-surface-800">Additional printers</h4>
          <p className="text-surface-500 text-xs mt-0.5 mb-3">
            Every bill also prints identically to each one below — e.g. a kitchen or store copy alongside the default receipt.
          </p>

          {copies.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {copies.map((c, i) => (
                <div key={`${c.label}-${c.printerName}-${i}`} className="flex items-center justify-between gap-2 bg-surface-50 rounded-lg px-3 py-2 text-sm">
                  <span><span className="font-medium text-surface-800">{c.label}</span> <span className="text-surface-400">— {c.printerName}</span></span>
                  <button
                    onClick={() => removeCopy(i)}
                    disabled={savingCopies}
                    className="text-surface-400 hover:text-red-600 text-xs font-medium"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div>
              <label className="label text-xs">Label</label>
              <input
                className="input py-2 text-sm"
                value={newCopyLabel}
                onChange={(e) => setNewCopyLabel(e.target.value)}
                placeholder="e.g. Kitchen"
              />
            </div>
            <div className="flex-1">
              <label className="label text-xs">Printer</label>
              <select className="input py-2 text-sm" value={newCopyPrinter} onChange={(e) => setNewCopyPrinter(e.target.value)}>
                <option value="">Select a printer...</option>
                {printers.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <button className="btn-secondary btn-sm" disabled={savingCopies || !newCopyPrinter} onClick={addCopy}>
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
