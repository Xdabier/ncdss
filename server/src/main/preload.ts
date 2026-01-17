import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  startServer: () => ipcRenderer.invoke('start-server'),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  getIP: () => ipcRenderer.invoke('get-ip'),
  triggerBackup: () => ipcRenderer.invoke('trigger-backup'),
  openLogs: () => ipcRenderer.invoke('open-logs'),
  openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
  onServerStatus: (callback: (status: any) => void) => {
    ipcRenderer.on('server-status', (_event, status) => callback(status));
  },
  onLog: (callback: (log: string) => void) => {
    ipcRenderer.on('log', (_event, log) => callback(log));
  }
});
