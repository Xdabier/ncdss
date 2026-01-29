import { defineConfig } from 'drizzle-kit';
import path from 'path';
import os from 'os';

// Use the same database path as the application
const dbPath = path.join(
  process.env.APPDATA ||
  (os.platform() === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config')),
  'ncdss-server',
  'ncdss-server.db'
);

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './src/database/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: dbPath,
  },
});
