// Runs with Node access even though the settings window itself doesn't
// (contextIsolation: true, nodeIntegration: false) — contextBridge exposes
// only these specific calls into the page's world, nothing else of
// Node/Electron is reachable from settings.html.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('printAgentAPI', {
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  onConfigUpdated: (callback) => {
    ipcRenderer.on('config-updated', (_event, config) => callback(config));
  },
});
