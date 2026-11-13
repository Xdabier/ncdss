export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export type LLMProviderType = 'local' | 'claude';

export interface LLMProviderStatus {
  activeType: LLMProviderType;
  localAvailable: boolean;
  claudeAvailable: boolean;
}

export interface ServerStatusEvent {
  running: boolean;
  ip: string;
  llmStatus: 'not_loaded' | 'loading' | 'ready' | 'error';
  llmProvider?: LLMProviderType;
}

export interface ElectronAPI {
  getServerStatus: () => Promise<{
    running: boolean;
    llmStatus: 'not_loaded' | 'loading' | 'ready' | 'error';
    llmProvider: LLMProviderType;
    ip: string;
  }>;
  startServer: () => Promise<void>;
  stopServer: () => Promise<void>;
  getIP: () => Promise<string>;
  openLogs: () => void;
  openDataFolder: () => void;
  getRecentLogs: () => Promise<LogEntry[]>;
  getLogFilePath: () => Promise<string>;
  copyLogsToClipboard: () => Promise<void>;
  clearPatientData: () => Promise<boolean>;
  getLLMProviderStatus: () => Promise<LLMProviderStatus>;
  switchLLMProvider: (type: LLMProviderType) => Promise<void>;
  onServerStatus: (callback: (status: ServerStatusEvent) => void) => void;
  onLogEntry: (callback: (entry: LogEntry) => void) => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
