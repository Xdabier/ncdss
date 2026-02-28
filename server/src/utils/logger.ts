import fs from 'fs';
import path from 'path';
import { app, BrowserWindow } from 'electron';

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

const BUFFER_SIZE = 1000;
const buffer: LogEntry[] = [];

let logStream: fs.WriteStream | null = null;
let currentLogDate: string = '';
let logWindow: BrowserWindow | null = null;

// Save original console methods before patching
const originalLog = console.log.bind(console);
const originalWarn = console.warn.bind(console);
const originalError = console.error.bind(console);

function getLogDir(): string {
  return path.join(app.getPath('userData'), 'logs');
}

function getDateString(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10); // YYYY-MM-DD
}

function ensureLogStream(): void {
  const today = getDateString();
  if (currentLogDate === today && logStream) return;

  // Close previous stream
  if (logStream) {
    logStream.end();
  }

  const logDir = getLogDir();
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  currentLogDate = today;
  const logPath = path.join(logDir, `server-${today}.log`);
  logStream = fs.createWriteStream(logPath, { flags: 'a' });
}

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return `${arg.message}\n${arg.stack ?? ''}`;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

function pushEntry(level: LogEntry['level'], args: unknown[]): void {
  const timestamp = new Date().toISOString();
  const message = formatArgs(args);
  const entry: LogEntry = { timestamp, level, message };

  // Ring buffer
  if (buffer.length >= BUFFER_SIZE) {
    buffer.shift();
  }
  buffer.push(entry);

  // Append to log file
  try {
    ensureLogStream();
    const tag = level.toUpperCase().padEnd(5);
    logStream?.write(`[${timestamp}] [${tag}] ${message}\n`);
  } catch {
    // Silently ignore file write errors to avoid infinite loops
  }

  // Forward to renderer
  try {
    if (logWindow && !logWindow.isDestroyed()) {
      logWindow.webContents.send('log-entry', entry);
    }
  } catch {
    // Window may have been destroyed between check and send
  }
}

export function initLogger(): void {
  console.log = (...args: unknown[]) => {
    originalLog(...args);
    pushEntry('info', args);
  };

  console.warn = (...args: unknown[]) => {
    originalWarn(...args);
    pushEntry('warn', args);
  };

  console.error = (...args: unknown[]) => {
    originalError(...args);
    pushEntry('error', args);
  };
}

export function setLogWindow(win: BrowserWindow): void {
  logWindow = win;
  win.on('closed', () => {
    if (logWindow === win) logWindow = null;
  });
}

export function closeLogger(): void {
  if (logStream) {
    logStream.end();
    logStream = null;
  }
}

export function getRecentLogs(): LogEntry[] {
  return [...buffer];
}

export function getCurrentLogFilePath(): string {
  const today = getDateString();
  return path.join(getLogDir(), `server-${today}.log`);
}

export function getLogDirPath(): string {
  return getLogDir();
}

export function getRecentLogsAsText(): string {
  return buffer
    .map((e) => {
      const time = e.timestamp.slice(11, 19); // HH:MM:SS
      const tag = e.level.toUpperCase().padEnd(5);
      return `[${time}] [${tag}] ${e.message}`;
    })
    .join('\n');
}
