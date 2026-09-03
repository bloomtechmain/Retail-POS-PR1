'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
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
const ALLOWED_ORIGINS = [
  'https://app.bloomswiftpos.com',
  'http://localhost:5173',
];

const APP_VERSION = app.getVersion();

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

function readConfig() {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return { defaultPrinter: parsed.defaultPrinter || null };
  } catch {
    return { defaultPrinter: null };
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
      reject(new Error('No default printer configured. Open the Print Agent settings and pick a printer first.'));
      return;
    }

    let settled = false;
    const win = createHiddenWindow();
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
        if (!origin || ALLOWED_ORIGINS.includes(origin)) callback(null, true);
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
    const config = { defaultPrinter };
    writeConfig(config);
    broadcastConfig(config);
    res.json(config);
  });

  expressApp.post('/print', async (req, res) => {
    const html = req.body && req.body.html;
    if (!html || typeof html !== 'string') {
      res.status(400).json({ success: false, error: 'Missing html' });
      return;
    }
    try {
      const config = readConfig();
      await printHtml(html, config.defaultPrinter);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
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
  const next = { defaultPrinter: (config && config.defaultPrinter) || null };
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
