import './load-env'; // Must be first — loads .env into process.env
import { app, BrowserWindow, ipcMain, shell, clipboard } from 'electron';
import path from 'path';
import { startServer, stopServer, getServerStatus } from './server';
import { getLocalIP } from '../utils/network';
import { closeDatabase } from '../database';
import { startShiftMonitor, stopShiftMonitor } from '../services/shiftMonitorService';
import {
  initLogger,
  setLogWindow,
  closeLogger,
  getRecentLogs,
  getCurrentLogFilePath,
  getLogDirPath,
  getRecentLogsAsText,
} from '../utils/logger';

// Initialize logger immediately — patches console.* before any other code runs
initLogger();

let mainWindow: BrowserWindow | null = null;

const PORT = 3000;
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 550,
    height: 800,
    minWidth: 450,
    minHeight: 600,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'NCDSS Server',
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Forward log entries to this window
  setLogWindow(mainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  createWindow();

  // Auto-start server
  const ip = getLocalIP();
  await startServer(PORT);

  // Start background shift monitor
  startShiftMonitor();

  // Send initial status to renderer
  mainWindow?.webContents.send('server-status', {
    running: true,
    ip: `${ip}:${PORT}`,
    connectedClients: 0,
    llmStatus: 'not_loaded',
  });

  // This log is now automatically captured by the logger monkey-patch
  console.log(`Serveur démarré sur ${ip}:${PORT}`);
});

// IPC handlers
ipcMain.handle('get-server-status', () => {
  const status = getServerStatus();
  const ip = getLocalIP();
  return {
    ...status,
    ip: `${ip}:${PORT}`,
  };
});

ipcMain.handle('start-server', async () => {
  await startServer(PORT);
  const ip = getLocalIP();
  mainWindow?.webContents.send('server-status', {
    running: true,
    ip: `${ip}:${PORT}`,
    connectedClients: 0,
    llmStatus: 'not_loaded',
  });
});

ipcMain.handle('stop-server', () => {
  stopServer();
  const ip = getLocalIP();
  mainWindow?.webContents.send('server-status', {
    running: false,
    ip: `${ip}:${PORT}`,
    connectedClients: 0,
    llmStatus: 'not_loaded',
  });
});

ipcMain.handle('get-ip', () => {
  return `${getLocalIP()}:${PORT}`;
});

ipcMain.handle('trigger-backup', () => {
  console.log('Sauvegarde non implémentée');
});

ipcMain.handle('open-logs', () => {
  shell.openPath(getLogDirPath());
});

ipcMain.handle('open-data-folder', () => {
  shell.openPath(app.getPath('userData'));
});

ipcMain.handle('get-recent-logs', () => {
  return getRecentLogs();
});

ipcMain.handle('get-log-file-path', () => {
  return getCurrentLogFilePath();
});

ipcMain.handle('copy-logs-to-clipboard', () => {
  clipboard.writeText(getRecentLogsAsText());
});

app.on('window-all-closed', () => {
  stopShiftMonitor();
  stopServer();
  closeDatabase();
  closeLogger();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
