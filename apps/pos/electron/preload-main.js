// Runs with Node access even though the main window itself doesn't
// (contextIsolation: true, nodeIntegration: false) — contextBridge exposes
// only these printer-related calls into the page's world, nothing else of
// Node/Electron is reachable from the loaded app.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronPrintAPI', {
  getPrinters: () => ipcRenderer.invoke('printer:list'),
  getConfig: () => ipcRenderer.invoke('printer:get-config'),
  saveConfig: (config) => ipcRenderer.invoke('printer:save-config', config),
  print: (html) => ipcRenderer.invoke('printer:print', html),
});
