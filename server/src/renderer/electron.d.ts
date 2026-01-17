export interface ElectronAPI {
  getServerStatus: () => Promise<{
    running: boolean;
    connectedClients: number;
    llmStatus: string;
    ip: string;
  }>;
  startServer: () => Promise<void>;
  stopServer: () => Promise<void>;
  getIP: () => Promise<string>;
  triggerBackup: () => Promise<void>;
  openLogs: () => void;
  openDataFolder: () => void;
  onServerStatus: (callback: (status: any) => void) => void;
  onLog: (callback: (log: string) => void) => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
