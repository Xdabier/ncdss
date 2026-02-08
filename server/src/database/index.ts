import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';
import path from 'path';
import { app } from 'electron';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

let db: BetterSQLite3Database<typeof schema>;
let sqlite: Database.Database;

export async function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'ncdss-server.db');
  console.log('Database path:', dbPath);

  sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');

  db = drizzle(sqlite, { schema });

  // Run migrations only if needed
  try {
    const migrationsFolder = path.join(__dirname, 'migrations');

    // Check if tables already exist (db:push was used)
    const tablesExist = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
      .get();

    if (tablesExist) {
      console.log('✓ Database tables already exist (using db:push schema)');
    } else {
      console.log('Running migrations from:', migrationsFolder);

      // Temporarily disable FKs for migration safety
      sqlite.pragma('foreign_keys = OFF');

      migrate(db, { migrationsFolder });

      // Re-enable FKs
      sqlite.pragma('foreign_keys = ON');

      console.log('✓ Migrations applied');
    }
  } catch (error) {
    console.error('Migration failed:', error);
    // Re-enable FKs even on error
    sqlite.pragma('foreign_keys = ON');
    throw error;
  }

  // Create refresh_tokens table if it doesn't exist
  await createRefreshTokensTable();

  // Add missing columns to existing tables
  addColumnIfMissing(sqlite, 'patients', 'medical_history_notes', 'TEXT');

  // Seed default admin if no users exist
  await seedDefaultAdmin();

  // Seed default ER configuration if none exists
  await seedDefaultERConfig();

  return db;
}

export function getDb() {
  // Check for global db (used by standalone server)
  if ((global as any).__db) {
    return (global as any).__db;
  }
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function closeDatabase() {
  if (sqlite) {
    sqlite.close();
  }
}

export async function seedDefaultAdmin() {
  try {
    const existingUsers = await getDb().select().from(schema.users).limit(1);

    if (existingUsers.length === 0) {
      const passwordHash = await bcrypt.hash('admin123', 10);

      await getDb().insert(schema.users).values({
        id: randomUUID(),
        username: 'admin',
        passwordHash,
        fullName: 'Administrateur Système',
        role: 'SUPER_ADMIN',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      console.log('✓ Default admin created: admin / admin123');
    }
  } catch (error) {
    console.error('Error seeding admin:', error);
  }
}

export async function seedDefaultERConfig() {
  try {
    const existingConfig = await getDb().select().from(schema.erConfiguration).limit(1);

    if (existingConfig.length === 0) {
      await getDb().insert(schema.erConfiguration).values({
        id: randomUUID(),
        inscriptionDesks: 2,
        triageBoxes: 2,
        medicalBoxes: 4,
        surgicalBoxes: 2,
        traumaBoxes: 2,
        sauvBeds: 4,
        updatedBy: null,
        updatedAt: new Date().toISOString(),
      });

      console.log('✓ Default ER configuration created');
    }
  } catch (error) {
    console.error('Error seeding ER config:', error);
  }
}

function addColumnIfMissing(
  sqliteDb: Database.Database,
  table: string,
  column: string,
  type: string,
): void {
  const columns = sqliteDb.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  const exists = columns.some((c) => c.name === column);
  if (!exists) {
    sqliteDb.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    console.log(`✓ Added column ${table}.${column}`);
  }
}

async function createRefreshTokensTable() {
  try {
    // Check if table exists
    const tableExists = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='refresh_tokens'")
      .get();

    if (!tableExists) {
      console.log('Creating refresh_tokens table...');

      sqlite.exec(`
        CREATE TABLE refresh_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          revoked_at TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
        CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
        CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
      `);

      console.log('✓ refresh_tokens table created');
    }
  } catch (error) {
    console.error('Error creating refresh_tokens table:', error);
  }
}
