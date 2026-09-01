// Runs with Node access even though the splash window itself doesn't
// (contextIsolation: true, nodeIntegration: false) — contextBridge exposes
// only these two specific listeners into the page's world.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onSplashStatus: (callback) => ipcRenderer.on('splash-status', (_event, data) => callback(data)),
  onSplashVersion: (callback) => ipcRenderer.on('splash-version', (_event, version) => callback(version)),
});
