import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  startServer: () => ipcRenderer.invoke('start-server'),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  getIP: () => ipcRenderer.invoke('get-ip'),
  triggerBackup: () => ipcRenderer.invoke('trigger-backup'),
  openLogs: () => ipcRenderer.invoke('open-logs'),
  openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
  getRecentLogs: () => ipcRenderer.invoke('get-recent-logs'),
  getLogFilePath: () => ipcRenderer.invoke('get-log-file-path'),
  copyLogsToClipboard: () => ipcRenderer.invoke('copy-logs-to-clipboard'),
  getLLMProviderStatus: () => ipcRenderer.invoke('get-llm-provider-status'),
  switchLLMProvider: (type: string) => ipcRenderer.invoke('switch-llm-provider', type),
  onServerStatus: (callback: (status: any) => void) => {
    ipcRenderer.on('server-status', (_event, status) => callback(status));
  },
  clearPatientData: () => ipcRenderer.invoke('clear-patient-data'),
  onLogEntry: (callback: (entry: any) => void) => {
    ipcRenderer.on('log-entry', (_event, entry) => callback(entry));
  },
});
