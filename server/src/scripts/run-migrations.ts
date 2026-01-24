/**
 * Standalone migration script
 * Run with: npx tsx src/scripts/run-migrations.ts
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Determine database path (same as Electron app uses)
function getDbPath(): string {
  const platform = process.platform;
  let appDataPath: string;

  if (platform === 'win32') {
    appDataPath = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  } else if (platform === 'darwin') {
    appDataPath = path.join(os.homedir(), 'Library', 'Application Support');
  } else {
    appDataPath = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  }

  const dbDir = path.join(appDataPath, 'ncdss-server');

  // Ensure directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  return path.join(dbDir, 'ncdss-server.db');
}

async function runMigrations() {
  const dbPath = getDbPath();
  console.log('Database path:', dbPath);

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');

  const db = drizzle(sqlite);

  try {
    const migrationsFolder = path.join(__dirname, '..', 'database', 'migrations');
    console.log('Migrations folder:', migrationsFolder);

    // Check if migrations folder exists
    if (!fs.existsSync(migrationsFolder)) {
      console.error('Migrations folder not found:', migrationsFolder);
      process.exit(1);
    }

    // List migration files
    const files = fs.readdirSync(migrationsFolder).filter(f => f.endsWith('.sql'));
    console.log('Found migration files:', files);

    // Disable foreign keys for migration safety
    sqlite.pragma('foreign_keys = OFF');

    console.log('Running migrations...');
    migrate(db, { migrationsFolder });

    // Re-enable foreign keys
    sqlite.pragma('foreign_keys = ON');

    console.log('✓ Migrations applied successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    sqlite.pragma('foreign_keys = ON');
    process.exit(1);
  } finally {
    sqlite.close();
  }
}

runMigrations();
