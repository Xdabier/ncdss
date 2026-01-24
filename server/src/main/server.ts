import express from 'express';
import cors from 'cors';
import { Server } from 'http';
import { authRouter } from '../api/routes/auth';
import { usersRouter } from '../api/routes/users';
import { syncRouter } from '../api/routes/sync';
import { configRouter } from '../api/routes/config';
import { scheduleRouter } from '../api/routes/schedule';
import { pathologiesRouter } from '../api/routes/pathologies';
import { interventionsRouter } from '../api/routes/interventions';
import { boxAssignmentsRouter } from '../api/routes/box-assignments';
import { patientsRouter } from '../api/routes/patients';
import { statsRouter } from '../api/routes/stats';
import { prescriptionsRouter } from '../api/routes/prescriptions';
import { diagnosesRouter } from '../api/routes/diagnoses';
import { authMiddleware } from '../api/middleware/auth';
import { initDatabase } from '../database';

let server: Server | null = null;
let connectedClients = 0;

// CORS Configuration
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3001', 'http://localhost:5173', 'capacitor://localhost'];

export async function startServer(port: number): Promise<void> {
  // Initialize database
  await initDatabase();

  const app = express();

  // Configure CORS with origin validation
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, same-origin)
      if (!origin) return callback(null, true);

      // In development, allow all origins
      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }

      // In production, only allow specified origins
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Accès CORS non autorisé'));
      }
    },
    credentials: true
  }));
  app.use(express.json());

  // Public routes
  app.use('/api/auth', authRouter);

  // Protected routes
  app.use('/api/users', authMiddleware, usersRouter);
  app.use('/api/sync', authMiddleware, syncRouter);
  app.use('/api/config', authMiddleware, configRouter);
  app.use('/api/schedule', authMiddleware, scheduleRouter);
  app.use('/api/pathologies', authMiddleware, pathologiesRouter);
  app.use('/api/interventions', authMiddleware, interventionsRouter);
  app.use('/api/box-assignments', authMiddleware, boxAssignmentsRouter);
  app.use('/api/patients', authMiddleware, patientsRouter);
  app.use('/api/stats', authMiddleware, statsRouter);
  app.use('/api/prescriptions', authMiddleware, prescriptionsRouter);
  app.use('/api/diagnoses', authMiddleware, diagnosesRouter);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  server = app.listen(port, '0.0.0.0', () => {
    console.log(`✓ Server running on port ${port}`);
  });
}

export function stopServer(): void {
  if (server) {
    server.close();
    server = null;
    console.log('✓ Server stopped');
  }
}

export function getServerStatus() {
  return {
    running: server !== null,
    connectedClients,
    llmStatus: 'not_loaded',
  };
}

export function incrementClients() {
  connectedClients++;
}

export function decrementClients() {
  connectedClients--;
}
