'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const express = require('express');
const cors = require('cors');

// Fixed, documented port the online POS frontend talks to. Kept in sync by
// hand with apps/pos/frontend/src/utils/printAgent.ts — deliberately not
// negotiated/discovered, since the spec is "the agent listens on a known
// port and the web app just calls it".
const PORT = 41205;

// Only the real POS origins may reach this local server — the server binds
// to 127.0.0.1 (not reachable off this machine) AND rejects unknown
// origins, so a random website can't silently print to someone's printer.
// Any localhost/127.0.0.1 port is allowed (not just :5173) because Vite
// silently bumps to :5174/:5175/etc. when the default port is already
// taken — a fixed single dev origin here caused the agent to look "online"
// (health check has no Origin check issue) while every /print call got
// rejected by CORS and silently fell back to the browser print popup.
const PROD_ORIGIN = 'https://app.bloomswiftpos.com';
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
function isAllowedOrigin(origin) {
  return origin === PROD_ORIGIN || LOCAL_ORIGIN_RE.test(origin);
}

const APP_VERSION = app.getVersion();

// Kept in sync by hand with ReceiptTemplateName in
// apps/pos/frontend/src/utils/printAgent.ts.
const RECEIPT_TEMPLATES = ['standard', 'compact', 'detailed', 'minimal', 'formal'];

// ─── Single Instance Lock ────────────────────────────────────────────────────
// Prevents a second tray icon / EADDRINUSE if the installer's "run after
// finish" or a Startup entry launches this twice.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}
app.on('second-instance', () => {
  showSettingsWindow();
});

let tray = null;
let settingsWindow = null;
let httpServer = null;

// ─── Config persistence (per-device, not per-tenant — lives only on this PC) ─
function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

// `printers` maps a kitchen-station id (string) to a printer name, for KOT
// routing (content-SPLITTING) — separate from `defaultPrinter` (the receipt
// printer). `receiptCopies` is different again: named extra destinations
// that get the exact SAME bill as the default printer (fan-out). Old
// config files predate one or both keys; reading one back always backfills
// `printers: {}`/`receiptCopies: []` so they never crash on the new shape.
function readConfig() {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      defaultPrinter: parsed.defaultPrinter || null,
      printers: parsed.printers && typeof parsed.printers === 'object' ? parsed.printers : {},
      receiptCopies: Array.isArray(parsed.receiptCopies) ? parsed.receiptCopies : [],
      paperWidth: parsed.paperWidth === '58mm' ? '58mm' : '80mm',
      receiptTemplate: RECEIPT_TEMPLATES.includes(parsed.receiptTemplate) ? parsed.receiptTemplate : 'standard',
      receiptLanguage: parsed.receiptLanguage === 'si' ? 'si' : 'en',
    };
  } catch {
    return { defaultPrinter: null, printers: {}, receiptCopies: [], paperWidth: '80mm', receiptTemplate: 'standard', receiptLanguage: 'en' };
  }
}

function writeConfig(config) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf8');
}

// ─── Printer enumeration + silent printing ──────────────────────────────────
// A hidden, sandboxed window is the only way Electron exposes
// getPrintersAsync()/print() — it never becomes visible to the user.
function createHiddenWindow() {
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
  const win = createHiddenWindow();
  try {
    const printers = await win.webContents.getPrintersAsync();
    return printers.map((p) => p.name);
  } finally {
    win.close();
  }
}

// A RAW-datatype print job bypasses the Windows print driver's own
// rendering entirely — the bytes go straight to the port (USB/etc.), which
// is what lets ESC/POS command bytes reach a thermal printer's firmware
// unmodified regardless of driver (see raw-print-helper.ps1). This
// replaced an earlier webContents.print()-based approach that rendered an
// HTML receipt through the printer's own driver — fine for normal
// printers, but many thermal receipt printers' drivers (often a bare
// "Generic / Text Only" driver) can't rasterize arbitrary HTML/CSS and
// produced garbled output instead of a real receipt.
const PRINT_TIMEOUT_MS = 10000;

function getRawPrintHelperPath() {
  return path.join(__dirname, 'raw-print-helper.ps1');
}

function printRaw(buffer, deviceName) {
  return new Promise((resolve, reject) => {
    if (!deviceName) {
      reject(new Error('No default printer configured. Open the Print Agent settings and pick a printer first.'));
      return;
    }

    const tempFile = path.join(os.tmpdir(), `bloompos-print-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
    fs.writeFileSync(tempFile, buffer);
    const cleanup = () => {
      try { fs.unlinkSync(tempFile); } catch {}
    };

    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      fn(value);
    };

    const child = execFile('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', getRawPrintHelperPath(),
      '-PrinterName', deviceName,
      '-DataFile', tempFile,
    ], (error, stdout, stderr) => {
      if (error) {
        settle(reject, new Error(stderr || error.message));
        return;
      }
      const out = String(stdout || '').trim();
      if (out.startsWith('OK:')) settle(resolve);
      else settle(reject, new Error(out || 'Print failed'));
    });

    const timer = setTimeout(() => {
      child.kill();
      settle(reject, new Error('Print timed out — the printer may be offline.'));
    }, PRINT_TIMEOUT_MS);
  });
}

// ─── Embedded HTTP server the browser POS talks to ──────────────────────────
function startServer() {
  const expressApp = express();
  expressApp.use(express.json({ limit: '2mb' }));
  expressApp.use(
    cors({
      origin: (origin, callback) => {
        // No Origin header (e.g. curl, or a same-machine health check) is
        // allowed through; browser requests always send Origin and are
        // checked against the allowlist.
        if (!origin || isAllowedOrigin(origin)) callback(null, true);
        else callback(new Error('Origin not allowed'));
      },
    })
  );

  expressApp.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: APP_VERSION });
  });

  expressApp.get('/printers', async (_req, res) => {
    try {
      res.json({ printers: await listPrinters() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  expressApp.get('/config', (_req, res) => {
    res.json(readConfig());
  });

  expressApp.post('/config', (req, res) => {
    const defaultPrinter = (req.body && req.body.defaultPrinter) || null;
    const printers = req.body && req.body.printers && typeof req.body.printers === 'object' ? req.body.printers : {};
    const receiptCopies = req.body && Array.isArray(req.body.receiptCopies)
      ? req.body.receiptCopies.filter((c) => c && c.printerName).map((c) => ({ label: String(c.label || ''), printerName: String(c.printerName) }))
      : [];
    const paperWidth = req.body && req.body.paperWidth === '58mm' ? '58mm' : '80mm';
    const receiptTemplate = req.body && RECEIPT_TEMPLATES.includes(req.body.receiptTemplate) ? req.body.receiptTemplate : 'standard';
    const receiptLanguage = req.body && req.body.receiptLanguage === 'si' ? 'si' : 'en';
    const config = { defaultPrinter, printers, receiptCopies, paperWidth, receiptTemplate, receiptLanguage };
    writeConfig(config);
    broadcastConfig(config);
    res.json(config);
  });

  // `target` (a kitchen-station id) is optional. Passed, this looks up
  // that station's printer, falling back to the default if the station has
  // none configured yet (KOT — a single, content-specific destination).
  // Omitted, this is a normal bill print: the SAME document goes to the
  // default printer and every configured `receiptCopies` destination at
  // once (fan-out, e.g. a kitchen/store copy of the whole receipt).
  expressApp.post('/print', async (req, res) => {
    const dataBase64 = req.body && req.body.dataBase64;
    const target = req.body && req.body.target;
    if (!dataBase64 || typeof dataBase64 !== 'string') {
      res.status(400).json({ success: false, error: 'Missing dataBase64' });
      return;
    }
    const buffer = Buffer.from(dataBase64, 'base64');
    const config = readConfig();

    if (target) {
      try {
        const deviceName = config.printers[target] || config.defaultPrinter;
        await printRaw(buffer, deviceName);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
      return;
    }

    const destinations = [...new Set(
      [config.defaultPrinter, ...config.receiptCopies.map((c) => c.printerName)].filter(Boolean)
    )];
    if (destinations.length === 0) {
      res.status(500).json({ success: false, error: 'No default printer configured. Open the Print Agent settings and pick a printer first.' });
      return;
    }
    const results = await Promise.allSettled(destinations.map((deviceName) => printRaw(buffer, deviceName)));
    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length === results.length) {
      res.status(500).json({ success: false, error: failures[0].reason?.message || 'Print failed' });
      return;
    }
    if (failures.length > 0) {
      res.json({ success: true, warning: `Printed, but ${failures.length} of ${results.length} printer(s) failed` });
      return;
    }
    res.json({ success: true });
  });

  httpServer = expressApp.listen(PORT, '127.0.0.1', () => {
    console.log(`[PrintAgent] Listening on http://127.0.0.1:${PORT}`);
  });
}

function broadcastConfig(config) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('config-updated', config);
  }
}

// ─── Tray + settings window ──────────────────────────────────────────────────
function showSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 420,
    height: 520,
    resizable: false,
    title: 'BloomPOS Print Agent',
    icon: path.join(__dirname, 'build-assets', 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload-settings.js'),
    },
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'build-assets', 'icon.ico'));
  tray.setToolTip('BloomPOS Print Agent — running');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Configure Printer…', click: showSettingsWindow },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])
  );
  tray.on('click', showSettingsWindow);
}

// ─── IPC for the settings window (talks to main directly, not via HTTP) ────
ipcMain.handle('get-printers', () => listPrinters());
ipcMain.handle('get-config', () => readConfig());
ipcMain.handle('save-config', (_event, config) => {
  // The tray settings window only ever edits defaultPrinter — preserve
  // everything else already on disk rather than wiping it.
  const existing = readConfig();
  const next = { ...existing, defaultPrinter: (config && config.defaultPrinter) || null };
  writeConfig(next);
  return next;
});

// ─── Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  app.setLoginItemSettings({ openAtLogin: true });
  // The HTTP server is what actually matters — a tray icon failure (e.g. an
  // OS-level icon loading quirk) must never take the print server down with
  // it, so each is started independently.
  startServer();
  try {
    createTray();
  } catch (err) {
    console.error('[PrintAgent] Failed to create tray icon:', err.message);
  }
});

// Tray-only app: don't quit just because no window is open.
app.on('window-all-closed', () => {});

app.on('before-quit', () => {
  if (httpServer) httpServer.close();
});
