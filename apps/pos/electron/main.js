'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { fork, spawn } = require('child_process');
const http = require('http');

const { execSync } = require('child_process');
const { checkLicense, activateLicense, getMachineFingerprint } = require('./license');

const BACKEND_PORT = 5000;
const PG_PORT = 5435;
const APP_VERSION = app.getVersion();

// Same default shown on the activation screen — used for the background
// revocation check below, which never prompts the user for a server URL.
const DEFAULT_LICENSE_SERVER_URL = 'https://dashboard.bloomswiftpos.com/license-api';
const REVOCATION_CHECK_INTERVAL_MS = 30 * 60 * 1000;

// ─── Single Instance Lock ─────────────────────────────────────────────────────
// Prevents EADDRINUSE when user double-clicks the shortcut while app is running.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}
app.on('second-instance', () => {
  // Someone tried to open a second instance — focus our window instead.
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

let mainWindow = null;
let splashWindow = null;
let activationWindow = null;
let backendProcess = null;
let pgInstance = null;
let backendExitInfo = null; // set once backendProcess exits, read by waitForBackend for diagnostics
let revocationCheckInterval = null;
let pgBinaryPath = null; // set once in startPostgres(), reused to restart postgres after a backup/restore
let backupScheduleInterval = null;

// Best-effort re-verification of the currently stored key against the
// license server — this is the ONLY point where an already-activated
// offline install ever talks to the server again. It exists purely to
// notice when an admin/agent has upgraded or renewed the package (both
// generate a brand-new key and revoke this one), so we can bring the
// customer back to the activation screen instead of leaving them silently
// stuck on their old plan forever. Any network failure (no internet, server
// down, timeout) is swallowed — this must never disrupt normal offline use.
async function checkForPackageRevocation() {
  try {
    const payload = checkLicense(app.getPath('userData'));
    if (!payload || !payload.lk) return null;
    const result = await activateLicense(payload.lk, DEFAULT_LICENSE_SERVER_URL, app.getPath('userData'));
    if (!result.success && /revoked/i.test(result.error || '')) {
      return 'revoked';
    }
  } catch {
    // No internet / unreachable server — ignore, try again next interval.
  }
  return null;
}

// Called once revocation is confirmed. Deletes the stale local token so a
// relaunch can't slip back in on it, warns whoever is at the till, then
// swaps the main window for the activation screen.
function triggerReactivation() {
  if (revocationCheckInterval) {
    clearInterval(revocationCheckInterval);
    revocationCheckInterval = null;
  }
  try {
    fs.unlinkSync(path.join(app.getPath('userData'), 'activation.token'));
  } catch {}

  if (mainWindow && !mainWindow.isDestroyed()) {
    dialog.showMessageBoxSync(mainWindow, {
      type: 'info',
      title: 'Package Updated',
      message: 'Your subscription package has been updated by your administrator.',
      detail: 'Click Continue to enter your new license key and activate your new plan.',
      buttons: ['Continue'],
    });
    mainWindow.close();
    mainWindow = null;
  }

  showActivationWindow('revoked');
}

function startRevocationChecks() {
  checkForPackageRevocation().then((status) => {
    if (status === 'revoked') triggerReactivation();
  });
  revocationCheckInterval = setInterval(() => {
    checkForPackageRevocation().then((status) => {
      if (status === 'revoked') triggerReactivation();
    });
  }, REVOCATION_CHECK_INTERVAL_MS);
}

// ─── IPC: Activation ─────────────────────────────────────────────────────────
ipcMain.handle('activate-license', async (_event, { key, serverUrl }) => {
  return await activateLicense(key, serverUrl, app.getPath('userData'));
});

ipcMain.on('activation-complete', (_event, presetCredentials) => {
  if (activationWindow) {
    activationWindow.close();
    activationWindow = null;
  }
  if (presetCredentials && presetCredentials.presetAdminEmail && presetCredentials.presetAdminPassword) {
    try {
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      fs.writeFileSync(
        path.join(app.getPath('userData'), 'preset-credentials.json'),
        JSON.stringify({
          email: presetCredentials.presetAdminEmail,
          password: presetCredentials.presetAdminPassword,
        }),
        'utf8'
      );
    } catch (err) {
      console.error('[Main] Failed to write preset credentials:', err);
    }
  }
  startApp().then(() => {
    startRevocationChecks();
    startBackupScheduler();
  }).catch((err) => {
    dialog.showErrorBox('Startup Error', err.message);
    app.quit();
  });
});

// ─── Multi-terminal / LAN mode ───────────────────────────────────────────────
// Absent (or any value other than 'terminal') means "standalone" — the
// exact single-machine flow this app has always had, completely unchanged.
// A machine only ever becomes a Terminal by explicitly connecting to a
// Server from the activation screen (see terminal:connect below); nothing
// here is ever shown to, or changes behavior for, a normal single-till
// customer. There is no separate "Server mode" file/flag — any standalone
// install is already everything a Server needs (Express already listens on
// all interfaces; see apps/pos/backend/src/app.ts), so becoming a Server is
// just a Terminal successfully pairing to it, not a local setting.
function getRoleConfigPath() {
  return path.join(app.getPath('userData'), 'role-config.json');
}

function readRoleConfig() {
  try {
    const raw = fs.readFileSync(getRoleConfigPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.role === 'terminal' && parsed.serverHost) {
      return { role: 'terminal', serverHost: parsed.serverHost, serverPort: parsed.serverPort || BACKEND_PORT };
    }
    return null;
  } catch {
    return null;
  }
}

function writeRoleConfig(config) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(getRoleConfigPath(), JSON.stringify(config, null, 2), 'utf8');
}

function clearRoleConfig() {
  try { fs.unlinkSync(getRoleConfigPath()); } catch {}
}

function fetchJson(url, options, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options || {}, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: body ? JSON.parse(body) : {} });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('Connection timed out')); });
    if (options && options.body) req.write(options.body);
    req.end();
  });
}

ipcMain.handle('terminal:test-connection', async (_event, { host, port }) => {
  try {
    const res = await fetchJson(`http://${host}:${port || BACKEND_PORT}/health`, { method: 'GET' });
    return { success: res.status === 200 };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Registers this machine with the Server (counts against its max_terminals
// seat cap — see terminal.service.ts), then commits to Terminal role and
// relaunches into it. Registration failure (wrong plan, cap reached,
// unreachable) leaves the machine untouched — still standalone, still on
// the activation screen, nothing partially applied.
ipcMain.handle('terminal:connect', async (_event, { host, port }) => {
  const serverPort = port || BACKEND_PORT;
  try {
    const res = await fetchJson(
      `http://${host}:${serverPort}/api/terminal/register`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: getMachineFingerprint(), name: require('os').hostname() }),
      }
    );
    if (res.status !== 200) {
      return { success: false, error: (res.data && res.data.message) || 'Could not pair with that Server' };
    }
  } catch (err) {
    return { success: false, error: `Could not reach ${host}:${serverPort} — ${err.message}` };
  }

  writeRoleConfig({ role: 'terminal', serverHost: host, serverPort });
  // Relaunch into Terminal role — deliberately after a short delay so this
  // handler's success response actually reaches the renderer first (an
  // immediate app.exit() here would race the IPC reply).
  setTimeout(() => {
    app.relaunch();
    app.exit(0);
  }, 300);
  return { success: true };
});

// Reverts a Terminal machine back to standalone — deletes the pairing and
// relaunches into the normal activation flow. Does NOT deregister from the
// Server's side (no staff session exists to authenticate that call from
// here); an admin removes stale terminals from the Server's own Settings
// page (see terminal.routes.ts's DELETE /terminals/:id).
ipcMain.handle('terminal:get-role', () => readRoleConfig());

// Best-effort convenience for the Settings screen ("give this address to a
// Terminal") — not authoritative, just the first non-internal IPv4 address
// found, same discovery approach license.js's fingerprint already uses.
// If a machine has multiple network adapters the admin may need to confirm
// which one is actually on the shop's LAN.
ipcMain.handle('terminal:get-server-info', () => {
  const nets = require('os').networkInterfaces();
  let lanIp = null;
  outer: for (const name of Object.keys(nets)) {
    for (const iface of nets[name] || []) {
      if (!iface.internal && iface.family === 'IPv4') {
        lanIp = iface.address;
        break outer;
      }
    }
  }
  return { lanIp, port: BACKEND_PORT };
});

ipcMain.handle('terminal:disconnect', () => {
  clearRoleConfig();
  setTimeout(() => {
    app.relaunch();
    app.exit(0);
  }, 300);
  return { success: true };
});

// ─── Printer setup (offline printing, in-process — no separate agent app) ───
// Same job the standalone online Print Agent does (apps/print-agent/main.js),
// done in-process here since the offline POS is already an Electron app.
function getPrinterConfigPath() {
  return path.join(app.getPath('userData'), 'printer-config.json');
}

// `printers` maps a kitchen-station id (string) to a printer name, for KOT
// routing — separate from `defaultPrinter` (the receipt printer). Old
// installs' config files predate this key entirely; reading one back
// always backfills `printers: {}` so they never crash on the new shape.
function readPrinterConfig() {
  try {
    const raw = fs.readFileSync(getPrinterConfigPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      defaultPrinter: parsed.defaultPrinter || null,
      printers: parsed.printers && typeof parsed.printers === 'object' ? parsed.printers : {},
    };
  } catch {
    return { defaultPrinter: null, printers: {} };
  }
}

function writePrinterConfig(config) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(getPrinterConfigPath(), JSON.stringify(config, null, 2), 'utf8');
}

// A hidden, sandboxed window is the only way Electron exposes
// getPrintersAsync()/print() — it never becomes visible to the user.
function createHiddenPrintWindow() {
  return new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
}

async function listPrinters() {
  const win = createHiddenPrintWindow();
  try {
    const printers = await win.webContents.getPrintersAsync();
    return printers.map((p) => p.name);
  } finally {
    win.close();
  }
}

// Some printer types (notably virtual "print to PDF/XPS" writers) never
// invoke the print() callback under silent:true — Windows still wants an
// interactive save-location dialog that silent printing can't show, so the
// callback just never fires. A hard timeout turns that into a clear error
// instead of hanging the caller forever. Real physical/thermal printers
// don't have this problem — there's no destination to pick.
const PRINT_TIMEOUT_MS = 20000;

function printHtml(html, deviceName) {
  return new Promise((resolve, reject) => {
    if (!deviceName) {
      reject(new Error('No default printer configured. Open Settings and pick a printer first.'));
      return;
    }

    let settled = false;
    const win = createHiddenPrintWindow();
    const cleanup = () => {
      if (!win.isDestroyed()) win.close();
    };
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      fn(value);
    };
    const timer = setTimeout(() => {
      settle(reject, new Error('Print timed out — this printer may need an interactive dialog that silent printing can\'t show.'));
    }, PRINT_TIMEOUT_MS);

    win.webContents.once('did-finish-load', () => {
      win.webContents.print(
        { silent: true, deviceName, printBackground: true, margins: { marginType: 'none' } },
        (success, failureReason) => {
          if (success) settle(resolve);
          else settle(reject, new Error(failureReason || 'Print failed'));
        }
      );
    });
    win.webContents.once('did-fail-load', (_event, _code, description) => {
      settle(reject, new Error(`Failed to load receipt content: ${description}`));
    });

    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  });
}

ipcMain.handle('printer:list', () => listPrinters());
ipcMain.handle('printer:get-config', () => readPrinterConfig());
ipcMain.handle('printer:save-config', (_event, config) => {
  const next = {
    defaultPrinter: (config && config.defaultPrinter) || null,
    printers: config && config.printers && typeof config.printers === 'object' ? config.printers : {},
  };
  writePrinterConfig(next);
  return next;
});
// `target` (a kitchen-station id) is optional — omitted, this resolves
// exactly like before (the one receipt printer). Passed, it looks up that
// station's printer, falling back to the default if the station has none
// configured yet, so KOT printing degrades gracefully instead of failing
// outright on a freshly-added station.
ipcMain.handle('printer:print', async (_event, html, target) => {
  try {
    const config = readPrinterConfig();
    const deviceName = target ? (config.printers[target] || config.defaultPrinter) : config.defaultPrinter;
    await printHtml(html, deviceName);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Backup & Restore ─────────────────────────────────────────────────────────
// Physical backup: briefly stop the embedded postgres server and copy its
// whole data directory, rather than a logical pg_dump — the Windows
// embedded-postgres distribution bundles only postgres.exe/pg_ctl.exe/
// initdb.exe, no pg_dump/pg_restore/psql, so shelling out to those isn't an
// option without bundling a separate ~20MB client-tools download. A physical
// copy is also strictly more faithful (byte-identical data/indexes/
// sequences) and needs no FK-ordering or sequence-reset logic on restore.
const BACKUP_FOLDER_PREFIX = 'bloomswiftpos-backup-';

function getBackupConfigPath() {
  return path.join(app.getPath('userData'), 'backup-config.json');
}

function readBackupConfig() {
  const defaults = { enabled: false, frequency: 'daily', time: '23:00', dayOfWeek: 0, dayOfMonth: 1, folder: null, lastRunAt: null };
  try {
    const raw = fs.readFileSync(getBackupConfigPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      enabled: Boolean(parsed.enabled),
      frequency: ['daily', 'weekly', 'monthly'].includes(parsed.frequency) ? parsed.frequency : defaults.frequency,
      time: typeof parsed.time === 'string' ? parsed.time : defaults.time,
      dayOfWeek: Number.isInteger(parsed.dayOfWeek) ? parsed.dayOfWeek : defaults.dayOfWeek,
      dayOfMonth: Number.isInteger(parsed.dayOfMonth) ? parsed.dayOfMonth : defaults.dayOfMonth,
      folder: typeof parsed.folder === 'string' ? parsed.folder : defaults.folder,
      lastRunAt: typeof parsed.lastRunAt === 'string' ? parsed.lastRunAt : defaults.lastRunAt,
    };
  } catch {
    return defaults;
  }
}

function writeBackupConfig(config) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(getBackupConfigPath(), JSON.stringify(config, null, 2), 'utf8');
}

async function stopPostgresForMaintenance() {
  if (!pgInstance) return;
  await pgInstance.stop().catch(() => {});
  // pg_ctl stop can return slightly before the OS actually releases the
  // socket — poll until the port is free so the copy below never races a
  // still-shutting-down postgres.
  for (let i = 0; i < 20; i++) {
    if (!(await checkTcpPort(PG_PORT))) return;
    await delay(300);
  }
}

async function restartPostgresAfterMaintenance() {
  if (!pgBinaryPath) {
    const { postgres } = await import('@embedded-postgres/windows-x64');
    pgBinaryPath = postgres;
  }
  const pgDataDir = getPgDataDir();
  const pidFile = path.join(pgDataDir, 'postmaster.pid');
  if (fs.existsSync(pidFile)) fs.rmSync(pidFile, { force: true });
  const pgProc = await spawnPostgresAndWait(pgBinaryPath, pgDataDir, PG_PORT);
  pgInstance.process = pgProc;
  await waitForPostgresQueries(pgInstance);
}

function formatBackupTimestamp(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function dirSizeBytes(dir) {
  let total = 0;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSizeBytes(full);
    else { try { total += fs.statSync(full).size; } catch {} }
  }
  return total;
}

// Backups only make sense on a machine with a local database — a Terminal's
// data lives entirely on its Server (see readRoleConfig's big comment above).
function assertBackupCapableMachine() {
  if (readRoleConfig()) {
    throw new Error('Backup and restore are not available on a Terminal — its data lives on the Server machine.');
  }
}

async function runBackup(destFolder) {
  assertBackupCapableMachine();
  if (!destFolder) throw new Error('No backup folder selected.');
  if (!pgInstance) throw new Error('Database is not running.');

  const backupDir = path.join(destFolder, `${BACKUP_FOLDER_PREFIX}${formatBackupTimestamp(new Date())}`);
  fs.mkdirSync(backupDir, { recursive: true });

  await stopPostgresForMaintenance();
  try {
    fs.cpSync(getPgDataDir(), path.join(backupDir, 'pgdata'), { recursive: true });
    fs.writeFileSync(path.join(backupDir, 'backup-info.json'), JSON.stringify({
      createdAt: new Date().toISOString(),
      appVersion: APP_VERSION,
    }, null, 2), 'utf8');
  } finally {
    await restartPostgresAfterMaintenance();
  }

  return { path: backupDir, sizeBytes: dirSizeBytes(backupDir) };
}

function listBackups(folder) {
  if (!folder || !fs.existsSync(folder)) return [];
  let entries = [];
  try {
    entries = fs.readdirSync(folder, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith(BACKUP_FOLDER_PREFIX));
  } catch { return []; }

  const result = entries.map((e) => {
    const full = path.join(folder, e.name);
    let createdAt = null;
    let appVersion = null;
    try {
      const info = JSON.parse(fs.readFileSync(path.join(full, 'backup-info.json'), 'utf8'));
      createdAt = info.createdAt || null;
      appVersion = info.appVersion || null;
    } catch {
      try { createdAt = fs.statSync(full).birthtime.toISOString(); } catch {}
    }
    return { name: e.name, path: full, createdAt, appVersion, sizeBytes: dirSizeBytes(full) };
  });
  result.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return result;
}

async function runRestore(backupFolderPath) {
  assertBackupCapableMachine();
  const srcPgData = path.join(backupFolderPath, 'pgdata');
  if (!fs.existsSync(path.join(srcPgData, 'PG_VERSION'))) {
    throw new Error('This does not look like a valid BloomSwiftPOS backup folder.');
  }

  if (backendProcess) {
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
  await stopPostgresForMaintenance();

  const pgDataDir = getPgDataDir();
  // Move the current data aside rather than deleting it outright — if the
  // copy-in below fails partway (disk full, bad backup folder), the previous
  // data is still recoverable by hand instead of gone.
  const safetyDir = `${pgDataDir}.pre-restore-${formatBackupTimestamp(new Date())}`;
  if (fs.existsSync(pgDataDir)) fs.renameSync(pgDataDir, safetyDir);
  fs.cpSync(srcPgData, pgDataDir, { recursive: true });

  // Relaunch rather than resuming in-place — this runs the exact same
  // startPostgres()/startBackend() bootstrap (including runMigrations(), so
  // a backup taken on an older app version is brought up to the current
  // schema automatically) instead of trying to hand-resume live state.
  setTimeout(() => {
    app.relaunch();
    app.exit(0);
  }, 300);
}

// Distinguishes "not due yet" from "overdue — catch up regardless of the
// clock" so a schedule set for e.g. 11pm still runs the next time the app is
// opened even if that's days later and well before 11pm (a POS is typically
// only open during business hours, not 24/7) — a plain "did it already run
// today" check would otherwise wait for that exact time-of-day forever on a
// shop that always closes before it.
function isBackupDue(config, now) {
  if (!config.enabled || !config.folder) return false;

  const [h, m] = String(config.time || '23:00').split(':').map(Number);
  const todayAtTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h || 0, m || 0, 0, 0);

  if (!config.lastRunAt) {
    if (now < todayAtTime) return false;
    if (config.frequency === 'weekly' && now.getDay() !== config.dayOfWeek) return false;
    if (config.frequency === 'monthly' && now.getDate() !== config.dayOfMonth) return false;
    return true;
  }

  const last = new Date(config.lastRunAt);
  const lastMidnight = new Date(last.getFullYear(), last.getMonth(), last.getDate());
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysSinceLastRun = Math.round((todayMidnight - lastMidnight) / 86400000);

  const minGapDays = config.frequency === 'daily' ? 1 : config.frequency === 'weekly' ? 7 : 28;
  if (daysSinceLastRun < minGapDays) return false;
  if (daysSinceLastRun > minGapDays) return true;

  if (now < todayAtTime) return false;
  if (config.frequency === 'weekly' && now.getDay() !== config.dayOfWeek) return false;
  if (config.frequency === 'monthly' && now.getDate() !== config.dayOfMonth) return false;
  return true;
}

function startBackupScheduler() {
  const tick = async () => {
    if (readRoleConfig()) return;
    const config = readBackupConfig();
    if (!isBackupDue(config, new Date())) return;
    try {
      await runBackup(config.folder);
      writeBackupConfig({ ...config, lastRunAt: new Date().toISOString() });
    } catch (err) {
      console.warn('[Main] Scheduled backup failed:', err.message);
    }
  };
  tick();
  backupScheduleInterval = setInterval(tick, 60 * 1000);
}

ipcMain.handle('backup:choose-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow || undefined, { properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  return { canceled: false, path: result.filePaths[0] };
});

ipcMain.handle('backup:choose-restore-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow || undefined, { properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  return { canceled: false, path: result.filePaths[0] };
});

ipcMain.handle('backup:get-config', () => readBackupConfig());

ipcMain.handle('backup:save-config', (_event, config) => {
  const current = readBackupConfig();
  const next = {
    ...current,
    enabled: Boolean(config && config.enabled),
    frequency: config && ['daily', 'weekly', 'monthly'].includes(config.frequency) ? config.frequency : current.frequency,
    time: config && typeof config.time === 'string' ? config.time : current.time,
    dayOfWeek: config && Number.isInteger(config.dayOfWeek) ? config.dayOfWeek : current.dayOfWeek,
    dayOfMonth: config && Number.isInteger(config.dayOfMonth) ? config.dayOfMonth : current.dayOfMonth,
    folder: config && typeof config.folder === 'string' ? config.folder : current.folder,
  };
  writeBackupConfig(next);
  return next;
});

ipcMain.handle('backup:run-now', async (_event, folder) => {
  try {
    const result = await runBackup(folder);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('backup:list', (_event, folder) => {
  try {
    return { success: true, backups: listBackups(folder) };
  } catch (err) {
    return { success: false, error: err.message, backups: [] };
  }
});

ipcMain.handle('backup:restore', async (_event, backupFolderPath) => {
  const choice = dialog.showMessageBoxSync(mainWindow || undefined, {
    type: 'warning',
    title: 'Restore Backup',
    message: 'This will replace all current data with the selected backup.',
    detail: 'Everything added or changed since that backup was made will be lost. The app will restart to finish restoring. This cannot be undone.',
    buttons: ['Cancel', 'Restore and Restart'],
    defaultId: 0,
    cancelId: 0,
  });
  if (choice !== 1) return { success: false, canceled: true };
  try {
    await runRestore(backupFolderPath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('backup:open-folder', (_event, folder) => {
  if (folder && fs.existsSync(folder)) shell.openPath(folder);
});

// ─── App Ready ────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Terminal role short-circuits everything else — no local Postgres, no
  // local backend, no license check on this machine at all (see the big
  // comment above readRoleConfig for why that's the intended design, not
  // an oversight). Every other machine (the overwhelming majority of
  // installs) takes the exact same path it always has.
  const role = readRoleConfig();
  if (role) {
    startTerminalMode(role);
    return;
  }

  // Check license first
  const payload = checkLicense(app.getPath('userData'));
  if (!payload) {
    // A token file existing but failing checkLicense() (vs. no file at all)
    // means this isn't a genuine first run — most likely the month+week
    // grace period lapsed. Different copy on the activation screen so a
    // renewing customer isn't left thinking something broke.
    const tokenPath = path.join(app.getPath('userData'), 'activation.token');
    const reason = fs.existsSync(tokenPath) ? 'expired' : 'first-run';
    showActivationWindow(reason);
  } else {
    await startApp();
    startRevocationChecks();
    startBackupScheduler();
  }
});

app.on('window-all-closed', () => {
  cleanup();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', cleanup);

// ─── Activation Window ────────────────────────────────────────────────────────
function showActivationWindow(reason) {
  activationWindow = new BrowserWindow({
    width: 500,
    height: 560,
    resizable: false,
    frame: false,
    center: true,
    show: false,
    backgroundColor: '#0f0f0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-activation.js'),
    },
  });

  activationWindow.loadFile(path.join(__dirname, 'activation.html'), reason ? { query: { reason } } : undefined);
  activationWindow.once('ready-to-show', () => activationWindow.show());

  activationWindow.on('closed', () => {
    activationWindow = null;
  });
}

// ─── Splash Window ───────────────────────────────────────────────────────────
function showSplash() {
  splashWindow = new BrowserWindow({
    width: 380,
    height: 340,
    resizable: false,
    frame: false,
    center: true,
    show: false,
    transparent: false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-splash.js'),
    },
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.once('ready-to-show', () => {
    splashWindow.show();
    splashWindow.webContents.send('splash-version', APP_VERSION);
  });
}

function updateSplash(message, progress) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('splash-status', { message, progress });
  }
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

// ─── Main Startup Flow ───────────────────────────────────────────────────────
async function startApp() {
  showSplash();

  try {
    // Step 1: Start PostgreSQL
    updateSplash('Starting database…', 20);
    await startPostgres();

    // Step 2: Kill any orphaned process on backend port, then start backend
    updateSplash('Starting backend…', 50);
    killProcessOnPort(BACKEND_PORT);
    await startBackend();

    // Step 3: Wait for backend
    // 45s budget, not 15s — a fresh install's first launch can be genuinely
    // slow (antivirus scanning the newly-extracted postgres binary, cold
    // disk cache), and 15s was tight enough to false-positive on real,
    // still-starting installs.
    updateSplash('Connecting…', 75);
    await waitForBackend(90, 500);

    // Step 4: Run DB migrations if needed
    updateSplash('Ready!', 100);
    await delay(400);

    // Step 5: Open main window
    createMainWindow();
    closeSplash();
  } catch (err) {
    closeSplash();
    const choice = dialog.showMessageBoxSync({
      type: 'error',
      title: 'BloomPOS — Startup Error',
      message: 'Failed to start BloomPOS',
      detail: err.message,
      buttons: ['Retry', 'Quit'],
    });
    if (choice === 0) {
      await startApp();
    } else {
      app.quit();
    }
  }
}

// ─── Terminal Startup Flow ───────────────────────────────────────────────────
// No Postgres, no backend, no license check on this machine at all — a
// Terminal is a thin client pointed at a Server's already-running web app.
async function waitForServer(healthUrl, maxRetries, intervalMs) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetchJson(healthUrl, { method: 'GET' }, 2000);
      if (res.status === 200) return true;
    } catch {}
    await delay(intervalMs);
  }
  return false;
}

async function startTerminalMode(role) {
  showSplash();
  updateSplash('Connecting to Server…', 30);

  const targetUrl = `http://${role.serverHost}:${role.serverPort}`;
  const reachable = await waitForServer(`${targetUrl}/health`, 15, 1000);

  if (!reachable) {
    closeSplash();
    const choice = dialog.showMessageBoxSync({
      type: 'error',
      title: 'BloomPOS Terminal — Cannot Reach Server',
      message: `Could not connect to the Server at ${role.serverHost}:${role.serverPort}.`,
      detail: 'Make sure the Server till is running and this device is on the same network.\n\nA Terminal cannot take sales while disconnected from its Server — there is no local database on this device.',
      buttons: ['Retry', 'Disconnect (use this device standalone)', 'Quit'],
      defaultId: 0,
      cancelId: 2,
    });
    if (choice === 0) {
      await startTerminalMode(role);
    } else if (choice === 1) {
      clearRoleConfig();
      app.relaunch();
      app.exit(0);
    } else {
      app.quit();
    }
    return;
  }

  updateSplash('Ready!', 100);
  await delay(300);
  createMainWindow(targetUrl);
  closeSplash();

  // Hard-dead by design if the Server goes away mid-session (e.g. it's
  // rebooted or the LAN drops) — a Terminal has no local data to fall back
  // to, so a clear "reconnecting" screen is more honest than a blank/broken
  // window. Only guards page-level navigation failures (a reload, or the
  // initial load racing the Server coming up); an already-loaded page whose
  // individual API calls start failing surfaces through the app's normal
  // error toasts instead, not this overlay.
  mainWindow.webContents.on('did-fail-load', (_event, _code, _description, failedUrl) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    // Only the top-level navigation to the Server matters here — ignore
    // failed sub-resource loads (a missing favicon, etc.) so this doesn't
    // fire on every minor hiccup.
    if (!failedUrl || !failedUrl.startsWith(targetUrl)) return;
    mainWindow.loadURL(
      'data:text/html;charset=utf-8,' + encodeURIComponent(`
        <html><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
          background:#111827;color:#e5e5e5;font-family:'Segoe UI',system-ui,sans-serif;">
          <div style="text-align:center;">
            <h2>Reconnecting to Server…</h2>
            <p style="color:#888;">${role.serverHost}:${role.serverPort}</p>
            <button id="retryBtn" style="margin-top:16px;padding:10px 20px;
              background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;">Retry Now</button>
          </div>
          <script>
            const go = () => { window.location.href = ${JSON.stringify(targetUrl)}; };
            document.getElementById('retryBtn').addEventListener('click', go);
            setTimeout(go, 5000);
          </script>
        </body></html>
      `)
    );
  });
}

// ─── Embedded PostgreSQL ─────────────────────────────────────────────────────
function getPgDataDir() {
  return path.join(app.getPath('userData'), 'pgdata');
}

async function startPostgres() {
  const pgDataDir = getPgDataDir();

  try {
    const { default: EmbeddedPostgres } = await import('embedded-postgres');

    // ── If postgres is already accepting connections, reuse it ──────────────
    // This handles the case where a previous app session left postgres running.
    if (await checkTcpPort(PG_PORT)) {
      console.log('[Main] PostgreSQL already running on port', PG_PORT, '— reusing');
      pgInstance = new EmbeddedPostgres({
        databaseDir: pgDataDir, user: 'retailpos',
        password: 'retailpos_local', port: PG_PORT, persistent: true,
      });
      // Set a stub process so createDatabase()'s "is running" guard passes.
      // We won't kill a postgres we didn't start.
      pgInstance.process = { pid: null };
    } else {
      // ── Clean up any incomplete pgdata (no PG_VERSION = failed initdb) ───
      const pgVersionFile = path.join(pgDataDir, 'PG_VERSION');
      if (fs.existsSync(pgDataDir) && !fs.existsSync(pgVersionFile)) {
        console.log('[Main] Cleaning up incomplete pgdata...');
        fs.rmSync(pgDataDir, { recursive: true, force: true });
      }

      pgInstance = new EmbeddedPostgres({
        databaseDir: pgDataDir,
        user: 'retailpos',
        password: 'retailpos_local',
        port: PG_PORT,
        persistent: true,
      });

      // ── Run initdb only if pgdata is not yet initialized ─────────────────
      if (!fs.existsSync(path.join(pgDataDir, 'PG_VERSION'))) {
        console.log('[Main] Running initdb...');
        await pgInstance.initialise();
        console.log('[Main] initdb complete');
      }

      // ── Remove stale postmaster.pid if present ────────────────────────────
      // On Windows, postgres checks the PID in postmaster.pid and refuses to
      // start if that PID is alive — even if it's a different process that
      // reused the same PID. Since checkTcpPort confirmed nothing is on 5435,
      // any existing pid file is definitely stale and safe to delete.
      const pidFile = path.join(pgDataDir, 'postmaster.pid');
      if (fs.existsSync(pidFile)) {
        console.log('[Main] Removing stale postmaster.pid...');
        fs.rmSync(pidFile, { force: true });
      }

      // ── Spawn postgres and wait for TCP readiness ─────────────────────────
      // We bypass embedded-postgres's start() which detects readiness via
      // stderr — unreliable in packaged Electron on Windows (no real console,
      // so piped stdio behaves differently). Polling the TCP port is reliable.
      const { postgres: pgBinary } = await import('@embedded-postgres/windows-x64');
      pgBinaryPath = pgBinary; // reused by restartPostgresAfterMaintenance()
      console.log('[Main] Starting PostgreSQL...');
      const pgProc = await spawnPostgresAndWait(pgBinary, pgDataDir, PG_PORT);
      pgInstance.process = pgProc;  // Stored so cleanup() can kill it

      // TCP port open doesn't mean postgres is ready for queries yet —
      // wait until it actually accepts a connection before proceeding.
      await waitForPostgresQueries(pgInstance);
      console.log('[Main] PostgreSQL ready on port', PG_PORT);
    }

    // ── Set env vars the backend reads ───────────────────────────────────────
    process.env.DB_HOST = '127.0.0.1';
    process.env.DB_PORT = String(PG_PORT);
    process.env.DB_NAME = 'retail_pos';
    process.env.DB_USER = 'retailpos';
    process.env.DB_PASSWORD = 'retailpos_local';

    // ── Create retail_pos database if it doesn't exist yet ──────────────────
    try {
      await pgInstance.createDatabase('retail_pos');
      console.log('[Main] Created retail_pos database');
    } catch (dbErr) {
      const msg = dbErr ? String(dbErr.message || dbErr) : '';
      if (!msg.toLowerCase().includes('already exists') && !msg.includes('42P04')) {
        console.warn('[Main] createDatabase warning:', msg);
      }
    }

    // ── Apply schema on first launch (idempotent — safe every launch) ────────
    await runMigrations();

    console.log('[Main] Embedded PostgreSQL started on port', PG_PORT);

  } catch (err) {
    const code = err ? err.code : undefined;
    const msg  = err ? (err.message || String(err)) : 'initdb exited with a non-zero code';

    if (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') {
      console.warn('[Main] embedded-postgres not found — using system PostgreSQL');
    } else {
      throw new Error(`Database startup failed: ${msg}`);
    }
  }
}

// ─── TCP Port Check ───────────────────────────────────────────────────────────
function checkTcpPort(port) {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.connect(port, '127.0.0.1', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
  });
}

// ─── Spawn postgres, poll TCP port for readiness ──────────────────────────────
function spawnPostgresAndWait(pgBinary, dataDir, port, maxWaitMs = 20000) {
  return new Promise((resolve, reject) => {
    // Write postgres output to a log file so we can diagnose failures
    const logPath = path.join(app.getPath('userData'), 'postgres-startup.log');
    const logFd = (() => {
      try { return fs.openSync(logPath, 'w'); } catch { return 'ignore'; }
    })();

    const pgProc = spawn(pgBinary, [
      '-D', dataDir,
      '-p', String(port),
      '-c', 'logging_collector=off',
    ], {
      stdio: ['ignore', logFd, logFd],
      windowsHide: true,   // Prevent console window appearing on Windows
    });

    // Close the fd once the process starts (process holds its own handle)
    if (typeof logFd === 'number') {
      try { fs.closeSync(logFd); } catch {}
    }

    let settled = false;

    pgProc.on('error', (err) => {
      if (!settled) { settled = true; reject(err); }
    });

    // Poll the TCP port every 500ms until postgres accepts connections
    let elapsed = 0;
    const INTERVAL = 500;
    const poll = setInterval(async () => {
      elapsed += INTERVAL;
      if (elapsed > maxWaitMs) {
        clearInterval(poll);
        pgProc.kill();
        if (!settled) { settled = true; reject(new Error(`PostgreSQL not ready after ${maxWaitMs}ms`)); }
        return;
      }
      if (await checkTcpPort(port)) {
        clearInterval(poll);
        if (!settled) { settled = true; resolve(pgProc); }
      }
    }, INTERVAL);

    pgProc.on('close', (code) => {
      clearInterval(poll);
      if (!settled) {
        settled = true;
        // Read log for diagnostic info
        let log = '';
        try { log = fs.readFileSync(logPath, 'utf8').slice(-1000); } catch {}
        reject(new Error(`postgres exited unexpectedly (code: ${code})\nLog: ${log || '(empty)'}\nLog file: ${logPath}`));
      }
    });
  });
}

// ─── Wait until postgres accepts SQL queries ──────────────────────────────────
async function waitForPostgresQueries(pgInst, maxRetries = 20) {
  for (let i = 0; i < maxRetries; i++) {
    const client = pgInst.getPgClient('postgres');
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return;
    } catch (err) {
      await client.end().catch(() => {});
      const msg = err ? String(err.message || err) : '';
      // Retry on "starting up" or any connection error
      if (i < maxRetries - 1) {
        await delay(500);
      } else {
        throw new Error(`PostgreSQL not ready for queries: ${msg}`);
      }
    }
  }
}

// ─── Backend Process ─────────────────────────────────────────────────────────
function startBackend() {
  return new Promise((resolve, reject) => {
    // Determine the backend entry point.
    // In production, electron-builder puts `files` content under resources/app/
    // and `extraResources` directly under resources/. Use app.getAppPath() (= resources/app)
    // for files, and process.resourcesPath (= resources/) for extraResources.
    const isDev = !app.isPackaged;
    // __dirname is apps/pos/electron — three levels below the project root in
    // dev; app.getAppPath() (packaged) already lands on that same root because
    // electron-builder's `files` config preserves the full apps/pos/... path.
    const appRoot = isDev ? path.join(__dirname, '..', '..', '..') : app.getAppPath();
    const backendEntry    = path.join(appRoot, 'apps', 'pos', 'backend', 'dist', 'app.js');
    const frontendDist    = path.join(appRoot, 'apps', 'pos', 'frontend', 'dist');
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(BACKEND_PORT),
      ELECTRON_APP: '1',
      FRONTEND_DIST: frontendDist,
      // A marketing agent's preset login for this install, written here by
      // the activation-complete handler below if the license carried one —
      // read (and deleted) exactly once by Setup.tsx via the backend.
      PRESET_CREDENTIALS_PATH: path.join(app.getPath('userData'), 'preset-credentials.json'),
    };

    // Load .env from userData if it exists (allows user-configured PG)
    const userEnvPath = path.join(app.getPath('userData'), '.env');
    if (fs.existsSync(userEnvPath)) {
      const lines = fs.readFileSync(userEnvPath, 'utf8').split('\n');
      for (const line of lines) {
        const [k, ...v] = line.split('=');
        if (k && v.length && !env[k.trim()]) {
          env[k.trim()] = v.join('=').trim();
        }
      }
    }

    backendExitInfo = null;
    const backendLogPath = path.join(app.getPath('userData'), 'backend.log');
    backendProcess = fork(backendEntry, [], {
      env,
      silent: true,  // Capture output so we can log it
    });

    // Write backend stdout/stderr to a log file
    const backendLog = fs.createWriteStream(backendLogPath, { flags: 'w' });
    if (backendProcess.stdout) backendProcess.stdout.pipe(backendLog);
    if (backendProcess.stderr) backendProcess.stderr.pipe(backendLog);

    backendProcess.on('error', (err) => {
      reject(new Error(`Backend process error: ${err.message}`));
    });

    backendProcess.on('exit', (code, signal) => {
      backendExitInfo = { code, signal };
      // Only during normal operation (main window already up) do we show a
      // dedicated crash dialog here — a pre-startup exit is instead surfaced
      // through waitForBackend()'s own rejection (see backendExitInfo there),
      // which is the one dialog the user actually sees during startup.
      if (code !== 0 && mainWindow) {
        let detail = `Exit code: ${code}`;
        try {
          const log = fs.readFileSync(backendLogPath, 'utf8').slice(-800);
          if (log.trim()) detail += `\n\n${log}`;
        } catch {}
        dialog.showErrorBox('Backend Crashed', detail);
      }
    });

    // Give it a moment to start, then we'll poll /health
    setTimeout(resolve, 500);
  });
}

// ─── Wait For Backend ────────────────────────────────────────────────────────
function readBackendLogTail() {
  try {
    const backendLogPath = path.join(app.getPath('userData'), 'backend.log');
    const log = fs.readFileSync(backendLogPath, 'utf8').trim().slice(-800);
    return log || '(backend.log is empty)';
  } catch {
    return '(backend.log not found)';
  }
}

function waitForBackend(maxRetries = 30, intervalMs = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    function tryPing() {
      // If the backend process has already died, don't burn the remaining
      // retry budget pinging a port nothing is listening on — fail now with
      // the real reason instead of a generic timeout 15s later.
      if (backendExitInfo) {
        reject(new Error(
          `Backend process exited early (code: ${backendExitInfo.code}, signal: ${backendExitInfo.signal})\n\n${readBackendLogTail()}`
        ));
        return;
      }
      http.get(`http://localhost:${BACKEND_PORT}/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry();
        }
      }).on('error', retry);
    }

    function retry() {
      attempts++;
      if (attempts >= maxRetries) {
        reject(new Error(
          `Backend did not become ready after ${maxRetries} attempts\n\n${readBackendLogTail()}`
        ));
      } else {
        setTimeout(tryPing, intervalMs);
      }
    }

    tryPing();
  });
}

// ─── Main Window ─────────────────────────────────────────────────────────────
function createMainWindow(targetUrl) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    backgroundColor: '#111827',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: !app.isPackaged,
      // A Terminal keeps its own preload too — it still needs local IPC
      // printing for its own physically-attached receipt printer even
      // though the whole rest of the app is loaded from the Server.
      preload: path.join(__dirname, 'preload-main.js'),
    },
    titleBarStyle: 'default',
    title: 'BloomPOS',
  });

  mainWindow.loadURL(targetUrl || `http://localhost:${BACKEND_PORT}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (!app.isPackaged) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── Schema Migrations ───────────────────────────────────────────────────────
async function runMigrations() {
  const isDev = !app.isPackaged;
  const schemaPath = isDev
    ? path.join(__dirname, '..', '..', '..', 'database', 'schema.sql')
    : path.join(process.resourcesPath, 'database', 'schema.sql');

  if (!fs.existsSync(schemaPath)) {
    console.warn('[Main] schema.sql not found at', schemaPath);
    return;
  }

  // Use embedded-postgres's built-in pg client
  const client = pgInstance.getPgClient('retail_pos');
  try {
    await client.connect();

    // Check if the users table already exists
    const result = await client.query(
      "SELECT COUNT(*) AS cnt FROM information_schema.tables " +
      "WHERE table_schema = 'public' AND table_name = 'users'"
    );
    const hasSchema = parseInt(result.rows[0].cnt, 10) > 0;

    if (!hasSchema) {
      console.log('[Main] Applying database schema...');
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await client.query(sql);
      console.log('[Main] Schema applied successfully');
    } else {
      console.log('[Main] Database schema already applied — running incremental migrations...');
      // Add any columns that may have been added after the initial schema run.
      // ALTER TABLE ... ADD COLUMN IF NOT EXISTS is safe to run repeatedly.
      const alterations = [
        `ALTER TABLE products ADD COLUMN IF NOT EXISTS name_en VARCHAR(255)`,
        `CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY DEFAULT 1,
          business_name VARCHAR(255) NOT NULL DEFAULT 'My Business',
          business_type VARCHAR(100) DEFAULT '',
          logo_data_url TEXT,
          address TEXT,
          phone VARCHAR(50),
          email VARCHAR(255),
          currency_code VARCHAR(10) NOT NULL DEFAULT 'USD',
          currency_symbol VARCHAR(10) NOT NULL DEFAULT '$',
          setup_completed BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          CONSTRAINT settings_singleton CHECK (id = 1)
        )`,
        `INSERT INTO settings (id, business_name, currency_code, currency_symbol, setup_completed)
         VALUES (1, 'My Business', 'USD', '$', FALSE) ON CONFLICT (id) DO NOTHING`,
        `ALTER TABLE products ADD COLUMN IF NOT EXISTS costing_method VARCHAR(20)`,
        `CREATE TABLE IF NOT EXISTS product_batches (
          id SERIAL PRIMARY KEY,
          product_id INTEGER NOT NULL REFERENCES products(id),
          grn_item_id INTEGER REFERENCES grn_items(id),
          batch_number VARCHAR(100) NOT NULL,
          quantity_received DECIMAL(12,3) NOT NULL,
          quantity_remaining DECIMAL(12,3) NOT NULL,
          unit_cost DECIMAL(12,4) NOT NULL,
          expiry_date DATE,
          received_date DATE NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE INDEX IF NOT EXISTS idx_product_batches_product ON product_batches(product_id)`,
        `CREATE INDEX IF NOT EXISTS idx_product_batches_grn_item ON product_batches(grn_item_id)`,
        `CREATE TABLE IF NOT EXISTS tax_rates (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          rate DECIMAL(5,2) NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )`,
        `ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_vat_invoice BOOLEAN NOT NULL DEFAULT FALSE`,
        `ALTER TABLE sales ADD COLUMN IF NOT EXISTS vat_invoice_number VARCHAR(50)`,
        `ALTER TABLE sales ADD COLUMN IF NOT EXISTS buyer_vat_reg_no VARCHAR(100)`,
        `ALTER TABLE sales ADD COLUMN IF NOT EXISTS buyer_address TEXT`,
        `ALTER TABLE sales ADD COLUMN IF NOT EXISTS buyer_phone VARCHAR(50)`,
        `ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_date DATE`,
        `ALTER TABLE sales ADD COLUMN IF NOT EXISTS place_of_supply VARCHAR(255)`,
        `CREATE TABLE IF NOT EXISTS sale_item_taxes (
          id SERIAL PRIMARY KEY,
          sale_item_id INTEGER NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
          tax_rate_id INTEGER REFERENCES tax_rates(id),
          tax_name VARCHAR(100) NOT NULL,
          tax_rate DECIMAL(5,2) NOT NULL,
          tax_amount DECIMAL(12,2) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE INDEX IF NOT EXISTS idx_sale_item_taxes_item ON sale_item_taxes(sale_item_id)`,
        `ALTER TABLE settings ADD COLUMN IF NOT EXISTS vat_registration_number VARCHAR(100)`,
        `ALTER TABLE settings ADD COLUMN IF NOT EXISTS plan_key VARCHAR(20) NOT NULL DEFAULT 'basic'`,
        `ALTER TABLE settings ADD COLUMN IF NOT EXISTS custom_features JSONB`,
        `CREATE TABLE IF NOT EXISTS vat_invoice_counter (
          id INTEGER PRIMARY KEY DEFAULT 1,
          next_number INTEGER NOT NULL DEFAULT 1,
          CONSTRAINT vat_invoice_counter_singleton CHECK (id = 1)
        )`,
        `INSERT INTO vat_invoice_counter (id, next_number) VALUES (1, 1) ON CONFLICT (id) DO NOTHING`,
        // Coupons (distinct from promotions — code-entry, single/limited-use)
        `CREATE TABLE IF NOT EXISTS coupons (
          id SERIAL PRIMARY KEY,
          code VARCHAR(50) UNIQUE NOT NULL,
          type VARCHAR(20) NOT NULL,
          discount_value DECIMAL(10,4) NOT NULL,
          min_purchase_amount DECIMAL(12,2),
          max_uses INTEGER,
          uses_count INTEGER NOT NULL DEFAULT 0,
          max_uses_per_customer INTEGER,
          start_date DATE,
          end_date DATE,
          is_active BOOLEAN DEFAULT TRUE,
          created_by INTEGER REFERENCES users(id),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code)`,
        `ALTER TABLE sales ADD COLUMN IF NOT EXISTS coupon_id INTEGER REFERENCES coupons(id)`,
        `ALTER TABLE sales ADD COLUMN IF NOT EXISTS coupon_discount DECIMAL(12,2) DEFAULT 0`,
        // Restaurant Mode: kitchen stations, tables, held-order lifecycle
        `CREATE TABLE IF NOT EXISTS kitchen_stations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW()
        )`,
        `ALTER TABLE products ADD COLUMN IF NOT EXISTS station_id INTEGER REFERENCES kitchen_stations(id) ON DELETE SET NULL`,
        `CREATE INDEX IF NOT EXISTS idx_products_station ON products(station_id) WHERE station_id IS NOT NULL`,
        `CREATE TABLE IF NOT EXISTS tables (
          id SERIAL PRIMARY KEY,
          name VARCHAR(50) NOT NULL,
          capacity INTEGER,
          status VARCHAR(20) NOT NULL DEFAULT 'available',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          deleted_at TIMESTAMP
        )`,
        `ALTER TABLE sales ADD COLUMN IF NOT EXISTS table_id INTEGER REFERENCES tables(id)`,
        `ALTER TABLE sales ADD COLUMN IF NOT EXISTS order_type VARCHAR(20) NOT NULL DEFAULT 'retail'`,
        `ALTER TABLE sales ADD COLUMN IF NOT EXISTS kot_printed_at TIMESTAMP`,
        `CREATE INDEX IF NOT EXISTS idx_sales_table ON sales(table_id) WHERE table_id IS NOT NULL`,
        `ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS kot_sent_at TIMESTAMP`,
        // Multi-terminal/LAN mode
        `CREATE TABLE IF NOT EXISTS terminals (
          id SERIAL PRIMARY KEY,
          fingerprint VARCHAR(64) UNIQUE NOT NULL,
          name VARCHAR(255),
          last_seen_at TIMESTAMP DEFAULT NOW(),
          created_at TIMESTAMP DEFAULT NOW()
        )`,
        `ALTER TABLE settings ADD COLUMN IF NOT EXISTS restaurant_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
        `ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_vat_customer BOOLEAN NOT NULL DEFAULT FALSE`,
        `ALTER TABLE customers ADD COLUMN IF NOT EXISTS vat_reg_no VARCHAR(100)`,
      ];
      for (const sql of alterations) {
        await client.query(sql);
      }
      console.log('[Main] Incremental migrations complete');
    }

    // Sync the local package from the current valid license token, if any —
    // the only way an offline install ever learns what package it's on,
    // since this app never re-contacts the server after activation (see
    // license.js's checkLicense/activateLicense). Runs on every launch so it
    // also self-corrects right after a customer re-activates following a
    // renewal or a package upgrade (both issue a brand-new key/token).
    try {
      const payload = checkLicense(app.getPath('userData'));
      if (payload && payload.plan_key) {
        const current = await client.query('SELECT plan_key FROM settings WHERE id = 1');
        if (current.rows.length > 0 && current.rows[0].plan_key !== payload.plan_key) {
          await client.query('UPDATE settings SET plan_key = $1, updated_at = NOW() WHERE id = 1', [payload.plan_key]);
          console.log(`[Main] Synced local package to "${payload.plan_key}" from license`);
        }
      }
    } catch (err) {
      console.warn('[Main] Could not sync package from license:', err.message);
    }
  } finally {
    await client.end().catch(() => {});
  }
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────
function cleanup() {
  if (revocationCheckInterval) {
    clearInterval(revocationCheckInterval);
    revocationCheckInterval = null;
  }
  if (backupScheduleInterval) {
    clearInterval(backupScheduleInterval);
    backupScheduleInterval = null;
  }
  if (backendProcess) {
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
  if (pgInstance) {
    pgInstance.stop().catch(() => {});
    pgInstance = null;
  }
}

// ─── Kill any process occupying a port (Windows) ─────────────────────────────
// Handles the case where a previous crash left a zombie backend on the port.
function killProcessOnPort(port) {
  try {
    const out = execSync(`netstat -ano`, { encoding: 'utf8', windowsHide: true });
    const lines = out.split('\n').filter(l => l.includes(`:${port}`) && l.includes('LISTENING'));
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0') {
        console.log(`[Main] Killing orphaned process PID ${pid} on port ${port}`);
        try { execSync(`taskkill /F /PID ${pid}`, { windowsHide: true }); } catch {}
      }
    }
  } catch {}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
