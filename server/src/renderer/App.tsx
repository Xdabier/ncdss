import React, { useState, useEffect } from 'react';
import { StatusPanel } from './components/StatusPanel';
import { ConnectionInfo } from './components/ConnectionInfo';
import { ActionButtons } from './components/ActionButtons';
import { ActivityLog } from './components/ActivityLog';
import { LLMProviderToggle } from './components/LLMProviderToggle';
import './electron.d';
import type { LogEntry, LLMProviderType, LLMProviderStatus } from './electron.d';

interface ServerStatus {
  running: boolean;
  ip: string;
  llmStatus: 'not_loaded' | 'loading' | 'ready' | 'error';
  llmProvider?: LLMProviderType;
}

export default function App() {
  const [status, setStatus] = useState<ServerStatus>({
    running: false,
    ip: '...',
    llmStatus: 'not_loaded',
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [providerStatus, setProviderStatus] = useState<LLMProviderStatus | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    // Check if electron API is available
    if (!window.electron) {
      console.error('Electron API not available');
      return;
    }

    // Get initial status
    window.electron.getServerStatus().then(setStatus).catch(console.error);
    window.electron
      .getIP()
      .then((ip) => setStatus((s) => ({ ...s, ip })))
      .catch(console.error);

    // Load buffered logs (captures everything logged before the window was ready)
    window.electron
      .getRecentLogs()
      .then((entries) => setLogs(entries))
      .catch(console.error);

    // Load LLM provider status
    window.electron
      .getLLMProviderStatus()
      .then(setProviderStatus)
      .catch(console.error);

    // Listen for status updates
    window.electron.onServerStatus((newStatus: ServerStatus) => {
      setStatus(newStatus);
    });

    // Listen for new log entries
    window.electron.onLogEntry((entry: LogEntry) => {
      setLogs((prev) => [...prev.slice(-999), entry]);
    });
  }, []);

  const handleCopy = async () => {
    await window.electron.copyLogsToClipboard();
  };

  const handleClear = () => {
    setLogs([]);
  };

  const handleSwitchProvider = async (type: LLMProviderType) => {
    setSwitching(true);
    try {
      await window.electron.switchLLMProvider(type);
      const newStatus = await window.electron.getLLMProviderStatus();
      setProviderStatus(newStatus);
    } catch (err) {
      console.error('Failed to switch LLM provider:', err);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 p-4 flex flex-col">
      <div className="max-w-md mx-auto space-y-3 flex flex-col flex-1 w-full">
        {/* Header */}
        <div className="bg-blue-600 text-white p-4 rounded-lg shadow-lg text-center">
          <h1 className="text-2xl font-bold">NCDSS Server</h1>
          <p className="text-sm text-blue-100 mt-1">Systeme d'Aide a la Decision Clinique</p>
        </div>

        {/* Status Panel */}
        <StatusPanel status={status} />

        {/* LLM Provider Toggle */}
        <LLMProviderToggle
          providerStatus={providerStatus}
          onSwitch={handleSwitchProvider}
          switching={switching}
        />

        {/* Connection Info */}
        <ConnectionInfo ip={status.ip} />

        {/* Action Buttons */}
        <ActionButtons
          running={status.running}
          onStart={async () => {
            await window.electron.startServer();
          }}
          onStop={async () => {
            await window.electron.stopServer();
          }}
          onOpenLogs={() => window.electron.openLogs()}
          onOpenData={() => window.electron.openDataFolder()}
          onClearPatients={async () => {
            await window.electron.clearPatientData();
          }}
        />

        {/* Activity Log - grows to fill remaining space */}
        <div className="flex-1 flex flex-col min-h-0">
          <ActivityLog logs={logs} onCopy={handleCopy} onClear={handleClear} />
        </div>
      </div>
    </div>
  );
}
