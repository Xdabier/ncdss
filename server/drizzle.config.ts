import type { Config } from 'drizzle-kit';
import path from 'path';
import os from 'os';

// Use the same database path as the application
const dbPath = path.join(
  process.env.APPDATA ||
  (os.platform() === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config')),
  'ncdss-server',
  'ncdss-server.db'
);

export default {
  schema: './src/database/schema.ts',
  out: './src/database/migrations',
  driver: 'better-sqlite',
  dbCredentials: {
    url: dbPath,
  },
} satisfies Config;
