import './load-env'; // Must be first — loads .env into process.env
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { startServer, stopServer, getServerStatus } from './server';
import { getLocalIP } from '../utils/network';
import { closeDatabase } from '../database';
import { startShiftMonitor, stopShiftMonitor } from '../services/shiftMonitorService';

let mainWindow: BrowserWindow | null = null;

const PORT = 3000;
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 700,
    resizable: false,
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

  // Log to renderer
  mainWindow?.webContents.send('log', `Serveur démarré sur ${ip}:${PORT}`);
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
  console.log('TODO: Implement backup');
  mainWindow?.webContents.send('log', 'Sauvegarde non implémentée');
});

ipcMain.handle('open-logs', () => {
  console.log('TODO: Open logs folder');
});

ipcMain.handle('open-data-folder', () => {
  console.log('TODO: Open data folder');
});

app.on('window-all-closed', () => {
  stopShiftMonitor();
  stopServer();
  closeDatabase();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
