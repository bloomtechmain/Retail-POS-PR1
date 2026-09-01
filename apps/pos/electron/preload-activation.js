// Runs with Node access even though the activation window itself doesn't
// (contextIsolation: true, nodeIntegration: false) — contextBridge exposes
// only these two specific calls into the page's world, nothing else of
// Node/Electron is reachable from the loaded HTML.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  activateLicense: (payload) => ipcRenderer.invoke('activate-license', payload),
  notifyActivationComplete: (payload) => ipcRenderer.send('activation-complete', payload),
});
