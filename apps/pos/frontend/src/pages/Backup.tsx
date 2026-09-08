import { useState, useEffect, useCallback } from 'react';
import { PageContainer } from '../components/layout/Layout';
import { PageLoader } from '../components/ui/LoadingSpinner';
import { useToastStore } from '../store/toastStore';
import api from '../services/api';
import { AxiosError } from 'axios';

type Frequency = 'daily' | 'weekly' | 'monthly';

interface ElectronBackupConfig {
  enabled: boolean;
  frequency: Frequency;
  time: string;
  dayOfWeek: number;
  dayOfMonth: number;
  folder: string | null;
  lastRunAt: string | null;
}

interface ElectronBackupEntry {
  name: string;
  path: string;
  createdAt: string | null;
  appVersion: string | null;
  sizeBytes: number;
}

interface ElectronBackupAPI {
  chooseFolder: () => Promise<{ canceled: boolean; path?: string }>;
  chooseRestoreFolder: () => Promise<{ canceled: boolean; path?: string }>;
  getConfig: () => Promise<ElectronBackupConfig>;
  saveConfig: (config: Partial<ElectronBackupConfig>) => Promise<ElectronBackupConfig>;
  runNow: (folder: string) => Promise<{ success: boolean; path?: string; sizeBytes?: number; error?: string }>;
  list: (folder: string) => Promise<{ success: boolean; backups: ElectronBackupEntry[]; error?: string }>;
  restore: (backupFolderPath: string) => Promise<{ success: boolean; canceled?: boolean; error?: string }>;
  openFolder: (folder: string) => Promise<void>;
}

declare global {
  interface Window {
    electronBackupAPI?: ElectronBackupAPI;
  }
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Unknown date';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown date';
  return d.toLocaleString();
}

// A plain `<a href>` download can't carry the Bearer token this app's axios
// instance attaches on every request (see services/api.ts) — the browser's
// native navigation never runs axios interceptors. Fetching as a blob and
// triggering a synthetic link click is the standard way to download
// authenticated content.
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function errorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ message: string }>;
  return axiosErr.response?.data?.message || fallback;
}

export default function BackupPage() {
  const electronApi = typeof window !== 'undefined' ? window.electronBackupAPI : undefined;
  const isTerminal = typeof window !== 'undefined' && !!window.electronTerminalAPI;

  if (electronApi) return <ElectronBackupPanel api={electronApi} isTerminal={isTerminal} />;
  return <WebBackupPanel />;
}

// ─── Offline desktop app — local folder, native dialogs ─────────────────────

function ElectronBackupPanel({ api: electronApi, isTerminal }: { api: ElectronBackupAPI; isTerminal: boolean }) {
  const toast = useToastStore();

  const [loading, setLoading] = useState(true);
  const [terminalRole, setTerminalRole] = useState<{ role: 'terminal' } | null>(null);

  const [config, setConfig] = useState<ElectronBackupConfig | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  const [manualFolder, setManualFolder] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);

  const [backups, setBackups] = useState<ElectronBackupEntry[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [restoreFolder, setRestoreFolder] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const refreshBackups = useCallback(async (folder: string | null) => {
    if (!folder) { setBackups([]); return; }
    setLoadingBackups(true);
    try {
      const r = await electronApi.list(folder);
      setBackups(r.success ? r.backups : []);
    } finally {
      setLoadingBackups(false);
    }
  }, [electronApi]);

  useEffect(() => {
    (async () => {
      if (isTerminal) {
        const role = await window.electronTerminalAPI!.isTerminal();
        setTerminalRole(role ? { role: 'terminal' } : null);
      }
      const cfg = await electronApi.getConfig();
      setConfig(cfg);
      setManualFolder(cfg.folder);
      if (cfg.folder) await refreshBackups(cfg.folder);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseManualFolder = async () => {
    const r = await electronApi.chooseFolder();
    if (r.canceled || !r.path) return;
    setManualFolder(r.path);
  };

  const backupNow = async () => {
    if (!manualFolder) return;
    setBackingUp(true);
    try {
      const r = await electronApi.runNow(manualFolder);
      if (r.success) {
        toast.success(`Backup complete — ${formatSize(r.sizeBytes || 0)} saved to ${r.path}`);
        if (config?.folder === manualFolder) await refreshBackups(manualFolder);
      } else {
        toast.error(r.error || 'Backup failed');
      }
    } finally {
      setBackingUp(false);
    }
  };

  const chooseScheduleFolder = async () => {
    if (!config) return;
    const r = await electronApi.chooseFolder();
    if (r.canceled || !r.path) return;
    setConfig({ ...config, folder: r.path });
  };

  const saveSchedule = async () => {
    if (!config) return;
    setSavingConfig(true);
    try {
      const saved = await electronApi.saveConfig(config);
      setConfig(saved);
      toast.success('Backup schedule saved');
      await refreshBackups(saved.folder);
    } finally {
      setSavingConfig(false);
    }
  };

  const chooseRestoreFolder = async () => {
    const r = await electronApi.chooseRestoreFolder();
    if (r.canceled || !r.path) return;
    setRestoreFolder(r.path);
    setConfirmRestore(false);
  };

  const doRestore = async () => {
    if (!restoreFolder) return;
    setRestoring(true);
    try {
      const r = await electronApi.restore(restoreFolder);
      if (r.canceled) { setRestoring(false); return; }
      if (!r.success) {
        toast.error(r.error || 'Restore failed');
        setRestoring(false);
        return;
      }
      // On success the app relaunches itself within ~300ms — nothing more to do here.
    } catch {
      setRestoring(false);
    }
  };

  if (loading) return <PageLoader />;

  if (terminalRole) {
    return (
      <PageContainer className="max-w-2xl mx-auto">
        <div className="card p-6">
          <h1 className="text-xl font-bold text-surface-900 mb-2">Backup &amp; Restore</h1>
          <p className="text-surface-500 text-sm">
            This device is a Terminal, connected to a Server &mdash; it has no local database of its own. Set up
            backups on the Server machine instead; they cover every Terminal's data automatically.
          </p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-surface-900">Backup &amp; Restore</h1>
        <p className="text-surface-500 text-sm mt-1">Back up your data to a folder on this computer, and restore it if anything ever goes wrong.</p>
      </div>

      {/* Manual backup */}
      <div className="card p-6 mb-6">
        <h3 className="font-semibold text-surface-900">Backup Now</h3>
        <p className="text-surface-500 text-sm mt-0.5 mb-3">Pick a folder and back up your current data into it right away.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-secondary btn-sm" onClick={chooseManualFolder} disabled={backingUp}>
            {manualFolder ? 'Change Folder' : 'Choose Folder'}
          </button>
          {manualFolder && <span className="text-sm font-mono text-surface-600 truncate max-w-xs" title={manualFolder}>{manualFolder}</span>}
        </div>
        <div className="mt-3">
          <button className="btn-primary" disabled={!manualFolder || backingUp} onClick={backupNow}>
            {backingUp ? 'Backing up… (app will pause briefly)' : 'Backup Now'}
          </button>
        </div>
      </div>

      {/* Scheduled backup */}
      {config && (
        <div className="card p-6 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-surface-900">Automatic Backup</h3>
              <p className="text-surface-500 text-sm mt-0.5">Back up automatically on a schedule, into a default folder.</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium text-surface-700">Enabled</span>
            </label>
          </div>

          <div>
            <label className="label">Default Folder</label>
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn-secondary btn-sm" onClick={chooseScheduleFolder}>
                {config.folder ? 'Change Folder' : 'Choose Folder'}
              </button>
              {config.folder && <span className="text-sm font-mono text-surface-600 truncate max-w-xs" title={config.folder}>{config.folder}</span>}
            </div>
          </div>

          <ScheduleFields config={config} setConfig={setConfig} />

          <p className="text-xs text-surface-400">
            Runs automatically while the app is open, at or after your chosen time. If the app wasn't open at that
            time, it backs up the next time you open it that day.
            {config.lastRunAt && <> Last automatic backup: {formatDate(config.lastRunAt)}.</>}
          </p>

          <div className="flex justify-end">
            <button className="btn-primary btn-sm" disabled={savingConfig} onClick={saveSchedule}>
              {savingConfig ? 'Saving…' : 'Save Schedule'}
            </button>
          </div>
        </div>
      )}

      {/* Restore */}
      <div className="card p-6">
        <h3 className="font-semibold text-surface-900">Restore</h3>
        <p className="text-surface-500 text-sm mt-0.5 mb-3">
          Replace your current data with a previous backup. Use this if your database is lost or corrupted.
        </p>

        {config?.folder && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-surface-700">Backups in default folder</span>
              {loadingBackups && <span className="text-xs text-surface-400">Loading…</span>}
            </div>
            {backups.length === 0 ? (
              <p className="text-sm text-surface-400">No backups found in the default folder yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {backups.map((b) => (
                  <button
                    key={b.path}
                    onClick={() => { setRestoreFolder(b.path); setConfirmRestore(false); }}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                      restoreFolder === b.path ? 'border-primary-400 bg-primary-50' : 'border-surface-200 hover:border-primary-200'
                    }`}
                  >
                    <div className="font-medium text-surface-900">{formatDate(b.createdAt)}</div>
                    <div className="text-xs text-surface-400">{formatSize(b.sizeBytes)}{b.appVersion ? ` · v${b.appVersion}` : ''}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 mb-3">
          <button className="btn-secondary btn-sm" onClick={chooseRestoreFolder}>Choose a Different Backup Folder</button>
          {restoreFolder && <span className="text-sm font-mono text-surface-600 truncate max-w-xs" title={restoreFolder}>{restoreFolder}</span>}
        </div>

        {restoreFolder && (
          <div className="border-t border-surface-100 pt-3">
            <label className="flex items-start gap-2 cursor-pointer mb-3">
              <input
                type="checkbox" checked={confirmRestore}
                onChange={(e) => setConfirmRestore(e.target.checked)}
                className="w-4 h-4 mt-0.5"
              />
              <span className="text-sm text-surface-600">
                I understand this will <strong>replace all current data</strong> with this backup, and that anything
                added or changed since then will be lost. The app will restart to finish restoring.
              </span>
            </label>
            <button
              className="btn-danger"
              disabled={!confirmRestore || restoring}
              onClick={doRestore}
            >
              {restoring ? 'Restoring… the app will restart shortly' : 'Restore This Backup'}
            </button>
          </div>
        )}
      </div>
    </PageContainer>
  );
}

// Shared frequency/day-of-week/day-of-month/time fields — identical shape on
// both the Electron and web panels, just backed by different config types
// that happen to share these five field names.
function ScheduleFields<T extends { frequency: Frequency; dayOfWeek: number; dayOfMonth: number; time: string }>({
  config, setConfig,
}: { config: T; setConfig: (c: T) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div>
        <label className="label">Frequency</label>
        <select
          className="input"
          value={config.frequency}
          onChange={(e) => setConfig({ ...config, frequency: e.target.value as Frequency })}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>
      {config.frequency === 'weekly' && (
        <div>
          <label className="label">Day of Week</label>
          <select
            className="input"
            value={config.dayOfWeek}
            onChange={(e) => setConfig({ ...config, dayOfWeek: parseInt(e.target.value) })}
          >
            {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
      )}
      {config.frequency === 'monthly' && (
        <div>
          <label className="label">Day of Month</label>
          <input
            type="number" min="1" max="28" className="input"
            value={config.dayOfMonth}
            onChange={(e) => setConfig({ ...config, dayOfMonth: Math.min(28, Math.max(1, parseInt(e.target.value) || 1)) })}
          />
        </div>
      )}
      <div>
        <label className="label">Time</label>
        <input
          type="time" className="input"
          value={config.time}
          onChange={(e) => setConfig({ ...config, time: e.target.value })}
        />
      </div>
    </div>
  );
}

// ─── Hosted (web) app — download/upload, server-side schedule ───────────────

interface WebSchedule {
  enabled: boolean;
  frequency: Frequency;
  time: string;
  dayOfWeek: number;
  dayOfMonth: number;
  lastRunAt: string | null;
}

interface WebBackupEntry {
  filename: string;
  createdAt: string;
  sizeBytes: number;
}

function WebBackupPanel() {
  const toast = useToastStore();

  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState<WebSchedule | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  const [scheduled, setScheduled] = useState<WebBackupEntry[]>([]);
  const [loadingScheduled, setLoadingScheduled] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);

  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const refreshScheduled = useCallback(async () => {
    setLoadingScheduled(true);
    try {
      const r = await api.get('/backup/scheduled');
      setScheduled(r.data.data);
    } catch {
      setScheduled([]);
    } finally {
      setLoadingScheduled(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/backup/schedule');
        setSchedule(r.data.data);
      } catch {
        // Leave schedule null — the schedule card just won't render.
      }
      await refreshScheduled();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const backupNow = async () => {
    setBackingUp(true);
    try {
      const r = await api.get('/backup/export', { responseType: 'blob' });
      const disposition = r.headers['content-disposition'] as string | undefined;
      const match = disposition?.match(/filename="?([^"]+)"?/);
      downloadBlob(r.data, match?.[1] || 'backup.dump');
      toast.success('Backup downloaded');
    } catch (err) {
      toast.error(errorMessage(err, 'Backup failed'));
    } finally {
      setBackingUp(false);
    }
  };

  const saveSchedule = async () => {
    if (!schedule) return;
    setSavingSchedule(true);
    try {
      const r = await api.put('/backup/schedule', schedule);
      setSchedule(r.data.data);
      toast.success('Backup schedule saved');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to save schedule'));
    } finally {
      setSavingSchedule(false);
    }
  };

  const downloadScheduled = async (filename: string) => {
    setDownloadingFile(filename);
    try {
      const r = await api.get(`/backup/scheduled/${encodeURIComponent(filename)}`, { responseType: 'blob' });
      downloadBlob(r.data, filename);
    } catch (err) {
      toast.error(errorMessage(err, 'Download failed'));
    } finally {
      setDownloadingFile(null);
    }
  };

  const doRestore = async () => {
    if (!restoreFile) return;
    setRestoring(true);
    try {
      const form = new FormData();
      form.append('file', restoreFile);
      form.append('confirm', 'true');
      await api.post('/backup/restore', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Restore complete — your data has been replaced with this backup.');
      setRestoreFile(null);
      setConfirmRestore(false);
    } catch (err) {
      toast.error(errorMessage(err, 'Restore failed'));
    } finally {
      setRestoring(false);
    }
  };

  if (loading) return <PageLoader />;

  return (
    <PageContainer className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-surface-900">Backup &amp; Restore</h1>
        <p className="text-surface-500 text-sm mt-1">Download a backup of your business data, and restore it if anything ever goes wrong.</p>
      </div>

      {/* Manual backup */}
      <div className="card p-6 mb-6">
        <h3 className="font-semibold text-surface-900">Backup Now</h3>
        <p className="text-surface-500 text-sm mt-0.5 mb-3">
          Download a full backup file right away — your browser will prompt you where to save it.
        </p>
        <button className="btn-primary" disabled={backingUp} onClick={backupNow}>
          {backingUp ? 'Preparing backup…' : 'Download Backup'}
        </button>
      </div>

      {/* Scheduled backup */}
      {schedule && (
        <div className="card p-6 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-surface-900">Automatic Backup</h3>
              <p className="text-surface-500 text-sm mt-0.5">
                Back up automatically on a schedule. Runs on our server, so it happens even if your browser is closed.
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={schedule.enabled}
                onChange={(e) => setSchedule({ ...schedule, enabled: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium text-surface-700">Enabled</span>
            </label>
          </div>

          <ScheduleFields config={schedule} setConfig={setSchedule} />

          <p className="text-xs text-surface-400">
            Up to the 7 most recent automatic backups are kept below — older ones are removed automatically.
            {schedule.lastRunAt && <> Last automatic backup: {formatDate(schedule.lastRunAt)}.</>}
          </p>

          <div className="flex justify-end">
            <button className="btn-primary btn-sm" disabled={savingSchedule} onClick={saveSchedule}>
              {savingSchedule ? 'Saving…' : 'Save Schedule'}
            </button>
          </div>
        </div>
      )}

      {/* Stored automatic backups + Restore */}
      <div className="card p-6">
        <h3 className="font-semibold text-surface-900">Restore</h3>
        <p className="text-surface-500 text-sm mt-0.5 mb-3">
          Replace your current data with a previous backup. Use this if your data is lost or something goes wrong.
        </p>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-surface-700">Automatic backups on our server</span>
            {loadingScheduled && <span className="text-xs text-surface-400">Loading…</span>}
          </div>
          {scheduled.length === 0 ? (
            <p className="text-sm text-surface-400">No automatic backups yet — enable the schedule above, or download one manually.</p>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {scheduled.map((b) => (
                <div key={b.filename} className="flex items-center justify-between px-3 py-2 rounded-lg border border-surface-200 text-sm">
                  <div>
                    <div className="font-medium text-surface-900">{formatDate(b.createdAt)}</div>
                    <div className="text-xs text-surface-400">{formatSize(b.sizeBytes)}</div>
                  </div>
                  <button
                    className="btn-secondary btn-sm"
                    disabled={downloadingFile === b.filename}
                    onClick={() => downloadScheduled(b.filename)}
                  >
                    {downloadingFile === b.filename ? 'Downloading…' : 'Download'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-surface-100 pt-3">
          <label className="label">Restore From a Backup File</label>
          <p className="text-xs text-surface-400 mb-2">Download one of the backups above, or use one you saved earlier, then upload it here.</p>
          <input
            type="file" accept=".dump"
            onChange={(e) => { setRestoreFile(e.target.files?.[0] || null); setConfirmRestore(false); }}
            className="input"
          />

          {restoreFile && (
            <div className="mt-3">
              <label className="flex items-start gap-2 cursor-pointer mb-3">
                <input
                  type="checkbox" checked={confirmRestore}
                  onChange={(e) => setConfirmRestore(e.target.checked)}
                  className="w-4 h-4 mt-0.5"
                />
                <span className="text-sm text-surface-600">
                  I understand this will <strong>replace all current data</strong> with this backup, and that anything
                  added or changed since then will be lost. This cannot be undone.
                </span>
              </label>
              <button
                className="btn-danger"
                disabled={!confirmRestore || restoring}
                onClick={doRestore}
              >
                {restoring ? 'Restoring…' : 'Restore This Backup'}
              </button>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
