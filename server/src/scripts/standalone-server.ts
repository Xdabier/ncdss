import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import * as dbSchema from '../database/schema';
import { seedDefaultAdmin, seedDefaultERConfig } from '../database';
import { authRouter } from '../api/routes/auth';
import { usersRouter } from '../api/routes/users';
import { configRouter } from '../api/routes/config';
import { scheduleRouter } from '../api/routes/schedule';
import { boxAssignmentsRouter } from '../api/routes/box-assignments';
import { pathologiesRouter } from '../api/routes/pathologies';
import { interventionsRouter } from '../api/routes/interventions';
import { syncRouter } from '../api/routes/sync';
import { authMiddleware } from '../api/middleware/auth';

// Initialize database manually for standalone server
const userDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'ncdss-server');
if (!fs.existsSync(userDataPath)) {
  fs.mkdirSync(userDataPath, { recursive: true });
}

const dbPath = path.join(userDataPath, 'ncdss-server.db');
console.log('Database path:', dbPath);

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
const db = drizzle(sqlite, { schema: dbSchema });

// Inject db into a global for getDb() to use
(global as any).__db = db;

// Initialize database with default data
(async () => {
  await seedDefaultAdmin();
  await seedDefaultERConfig();
  console.log('✅ Database initialized');
})();

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check (public)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public routes
app.use('/api/auth', authRouter);

// Protected routes (require authentication)
app.use('/api/users', authMiddleware, usersRouter);
app.use('/api/config', authMiddleware, configRouter);
app.use('/api/schedule', authMiddleware, scheduleRouter);
app.use('/api/box-assignments', authMiddleware, boxAssignmentsRouter);
app.use('/api/pathologies', authMiddleware, pathologiesRouter);
app.use('/api/interventions', authMiddleware, interventionsRouter);
app.use('/api/sync', authMiddleware, syncRouter);

// Start server
app.listen(PORT, () => {
  console.log(`✅ Standalone server running on http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop');
});
