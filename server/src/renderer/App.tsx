import React, { useState, useEffect } from 'react';
import { StatusPanel } from './components/StatusPanel';
import { ConnectionInfo } from './components/ConnectionInfo';
import { ActionButtons } from './components/ActionButtons';
import { ActivityLog } from './components/ActivityLog';
import './electron.d';

interface ServerStatus {
  running: boolean;
  ip: string;
  connectedClients: number;
  llmStatus: 'not_loaded' | 'loading' | 'ready' | 'error';
}

export default function App() {
  const [status, setStatus] = useState<ServerStatus>({
    running: false,
    ip: '...',
    connectedClients: 0,
    llmStatus: 'not_loaded',
  });
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    // Check if electron API is available
    if (!window.electron) {
      console.error('Electron API not available');
      return;
    }

    // Get initial status
    window.electron.getServerStatus().then(setStatus).catch(console.error);
    window.electron.getIP().then((ip) => setStatus((s) => ({ ...s, ip }))).catch(console.error);

    // Listen for status updates
    window.electron.onServerStatus((newStatus: ServerStatus) => {
      setStatus(newStatus);
    });

    // Listen for logs
    window.electron.onLog((log: string) => {
      setLogs((prev) => [...prev.slice(-99), log]);
    });
  }, []);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString('fr-FR');
    setLogs((prev) => [...prev.slice(-99), `[${timestamp}] ${message}`]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 p-4">
      <div className="max-w-md mx-auto space-y-3">
        {/* Header */}
        <div className="bg-blue-600 text-white p-4 rounded-lg shadow-lg text-center">
          <h1 className="text-2xl font-bold">🏥 NCDSS Server</h1>
          <p className="text-sm text-blue-100 mt-1">
            Système d'Aide à la Décision Clinique
          </p>
        </div>

        {/* Status Panel */}
        <StatusPanel status={status} />

        {/* Connection Info */}
        <ConnectionInfo ip={status.ip} />

        {/* Action Buttons */}
        <ActionButtons
          running={status.running}
          onStart={async () => {
            await window.electron.startServer();
            addLog('Serveur démarré');
          }}
          onStop={async () => {
            await window.electron.stopServer();
            addLog('Serveur arrêté');
          }}
          onBackup={async () => {
            await window.electron.triggerBackup();
            addLog('Sauvegarde lancée');
          }}
          onOpenLogs={() => window.electron.openLogs()}
          onOpenData={() => window.electron.openDataFolder()}
        />

        {/* Activity Log */}
        <ActivityLog logs={logs} />
      </div>
    </div>
  );
}
