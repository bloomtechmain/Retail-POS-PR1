'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { fork, spawn } = require('child_process');
const http = require('http');

const { execSync } = require('child_process');
const { checkLicense, activateLicense } = require('./license');

const BACKEND_PORT = 5000;
const APP_VERSION = app.getVersion();

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

// ─── IPC: Activation ─────────────────────────────────────────────────────────
ipcMain.handle('activate-license', async (_event, { key, serverUrl }) => {
  return await activateLicense(key, serverUrl, app.getPath('userData'));
});

ipcMain.on('activation-complete', () => {
  if (activationWindow) {
    activationWindow.close();
    activationWindow = null;
  }
  startApp().catch((err) => {
    dialog.showErrorBox('Startup Error', err.message);
    app.quit();
  });
});

// ─── App Ready ────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Check license first
  const payload = checkLicense(app.getPath('userData'));
  if (!payload) {
    showActivationWindow();
  } else {
    await startApp();
  }
});

app.on('window-all-closed', () => {
  cleanup();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', cleanup);

// ─── Activation Window ────────────────────────────────────────────────────────
function showActivationWindow() {
  activationWindow = new BrowserWindow({
    width: 500,
    height: 560,
    resizable: false,
    frame: false,
    center: true,
    show: false,
    backgroundColor: '#0f0f0f',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  activationWindow.loadFile(path.join(__dirname, 'activation.html'));
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
      nodeIntegration: true,
      contextIsolation: false,
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
    updateSplash('Connecting…', 75);
    await waitForBackend(30, 500);

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

// ─── Embedded PostgreSQL ─────────────────────────────────────────────────────
async function startPostgres() {
  const pgDataDir = path.join(app.getPath('userData'), 'pgdata');
  const PG_PORT = 5435;

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
    const appRoot = isDev ? path.join(__dirname, '..') : app.getAppPath();
    const backendEntry    = path.join(appRoot, 'backend', 'dist', 'app.js');
    const frontendDist    = path.join(appRoot, 'frontend', 'dist');
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(BACKEND_PORT),
      ELECTRON_APP: '1',
      FRONTEND_DIST: frontendDist,
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
function waitForBackend(maxRetries = 30, intervalMs = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    function tryPing() {
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
        reject(new Error(`Backend did not become ready after ${maxRetries} attempts`));
      } else {
        setTimeout(tryPing, intervalMs);
      }
    }

    tryPing();
  });
}

// ─── Main Window ─────────────────────────────────────────────────────────────
function createMainWindow() {
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
    },
    titleBarStyle: 'default',
    title: 'BloomPOS',
  });

  mainWindow.loadURL(`http://localhost:${BACKEND_PORT}`);

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
    ? path.join(__dirname, '..', 'database', 'schema.sql')
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
      ];
      for (const sql of alterations) {
        await client.query(sql);
      }
      console.log('[Main] Incremental migrations complete');
    }
  } finally {
    await client.end().catch(() => {});
  }
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────
function cleanup() {
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
