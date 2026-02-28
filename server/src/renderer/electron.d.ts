export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface ElectronAPI {
  getServerStatus: () => Promise<{
    running: boolean;
    connectedClients: number;
    llmStatus: 'not_loaded' | 'loading' | 'ready' | 'error';
    ip: string;
  }>;
  startServer: () => Promise<void>;
  stopServer: () => Promise<void>;
  getIP: () => Promise<string>;
  triggerBackup: () => Promise<void>;
  openLogs: () => void;
  openDataFolder: () => void;
  getRecentLogs: () => Promise<LogEntry[]>;
  getLogFilePath: () => Promise<string>;
  copyLogsToClipboard: () => Promise<void>;
  onServerStatus: (callback: (status: any) => void) => void;
  onLogEntry: (callback: (entry: LogEntry) => void) => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
