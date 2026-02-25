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
  addColumnIfMissing(sqlite, 'patients', 'medical_history', 'TEXT');
  addColumnIfMissing(sqlite, 'patients', 'surgical_history', 'TEXT');
  addColumnIfMissing(sqlite, 'patients', 'obstetric_history', 'TEXT');
  addColumnIfMissing(sqlite, 'patients', 'absent_call_history', 'TEXT');

  // Migration 0006: prescriptions.administered_in_box
  addColumnIfMissing(sqlite, 'prescriptions', 'administered_in_box', 'INTEGER DEFAULT 0');

  // Migration 0007: patient hold/consultation columns
  addColumnIfMissing(sqlite, 'patients', 'hold_status', 'TEXT');
  addColumnIfMissing(sqlite, 'patients', 'hold_reason', 'TEXT');
  addColumnIfMissing(sqlite, 'patients', 'hold_at', 'TEXT');
  addColumnIfMissing(sqlite, 'patients', 'hold_by', 'TEXT');
  addColumnIfMissing(sqlite, 'patients', 'consultation_notes', 'TEXT');

  // User profile completion feature
  addColumnIfMissing(sqlite, 'users', 'profile_completed', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(sqlite, 'users', 'pin_hash', 'TEXT');
  createUserProfilesTable(sqlite);
  syncProfileCompletedFlag(sqlite);

  // Create patient_identities table and migrate existing data
  createPatientIdentitiesTable(sqlite);
  addColumnIfMissing(sqlite, 'patients', 'patient_identity_id', 'TEXT');
  addColumnIfMissing(sqlite, 'patients', 'date_of_birth', 'TEXT');
  addColumnIfMissing(sqlite, 'patients', 'id_type', 'TEXT');
  addColumnIfMissing(sqlite, 'patients', 'nationality', 'TEXT');
  migratePatientIdentities(sqlite);
  createPatientIdentityIndexes(sqlite);

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
        profileCompleted: false,
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

function syncProfileCompletedFlag(sqliteDb: Database.Database): void {
  // Ensure profile_completed accurately reflects whether a user_profiles row exists.
  // Fixes users incorrectly marked as completed without an actual profile.
  const fixed = sqliteDb.prepare(`
    UPDATE users SET profile_completed = 0
    WHERE profile_completed = 1
      AND id NOT IN (SELECT user_id FROM user_profiles)
  `).run();
  if (fixed.changes > 0) {
    console.log(`✓ Reset profile_completed for ${fixed.changes} user(s) without a profile`);
  }
}

function createUserProfilesTable(sqliteDb: Database.Database): void {
  const tableExists = sqliteDb
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_profiles'")
    .get();

  if (!tableExists) {
    sqliteDb.exec(`
      CREATE TABLE user_profiles (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        cin TEXT,
        address TEXT,
        first_name TEXT,
        last_name TEXT,
        birth_date TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX idx_user_profiles_user_id ON user_profiles(user_id);
    `);
    console.log('✓ user_profiles table created');
  }
}

function createPatientIdentitiesTable(sqliteDb: Database.Database): void {
  const tableExists = sqliteDb
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='patient_identities'")
    .get();

  if (!tableExists) {
    sqliteDb.exec(`
      CREATE TABLE patient_identities (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        date_of_birth TEXT,
        sex TEXT NOT NULL,
        id_number TEXT,
        id_type TEXT,
        nationality TEXT,
        phone TEXT,
        address TEXT,
        allergies TEXT,
        chronic_conditions TEXT,
        current_medications TEXT,
        medical_history TEXT,
        surgical_history TEXT,
        obstetric_history TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ patient_identities table created');
  }
}

function migratePatientIdentities(sqliteDb: Database.Database): void {
  // Check if any patients need migration (have no identity linked)
  const unmigrated = sqliteDb
    .prepare('SELECT COUNT(*) as count FROM patients WHERE patient_identity_id IS NULL')
    .get() as { count: number };

  if (unmigrated.count === 0) {
    return;
  }

  console.log(`Migrating ${unmigrated.count} patient(s) to patient_identities...`);

  const now = new Date().toISOString();
  const currentYear = new Date().getFullYear();

  // Run migration in a transaction for safety
  const migrateTransaction = sqliteDb.transaction(() => {
    // Map: national_id -> identity UUID (for deduplication)
    const nationalIdToIdentity = new Map<string, string>();

    // Step 1: Handle patients WITH national_id (deduplication by national_id)
    // Get all unmigrated patients with national_id, ordered by created_at DESC (most recent first)
    const patientsWithNationalId = sqliteDb
      .prepare(`
        SELECT id, full_name, age, sex, national_id, phone, address,
               allergies, chronic_conditions, current_medications,
               medical_history, surgical_history, obstetric_history,
               created_at
        FROM patients
        WHERE patient_identity_id IS NULL AND national_id IS NOT NULL
        ORDER BY created_at DESC
      `)
      .all() as Array<{
        id: string;
        full_name: string;
        age: number;
        sex: string;
        national_id: string;
        phone: string | null;
        address: string | null;
        allergies: string | null;
        chronic_conditions: string | null;
        current_medications: string | null;
        medical_history: string | null;
        surgical_history: string | null;
        obstetric_history: string | null;
        created_at: string;
      }>;

    const insertIdentity = sqliteDb.prepare(`
      INSERT INTO patient_identities (id, full_name, date_of_birth, sex, id_number, id_type,
        phone, address, allergies, chronic_conditions, current_medications,
        medical_history, surgical_history, obstetric_history, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const linkPatient = sqliteDb.prepare(`
      UPDATE patients SET patient_identity_id = ?, date_of_birth = ?, id_type = ? WHERE id = ?
    `);

    for (const patient of patientsWithNationalId) {
      const approxDob = `${currentYear - patient.age}-01-01`;

      if (nationalIdToIdentity.has(patient.national_id)) {
        // Identity already created for this national_id - just link
        const existingIdentityId = nationalIdToIdentity.get(patient.national_id)!;
        linkPatient.run(existingIdentityId, approxDob, 'CIN', patient.id);
      } else {
        // Create new identity from this patient (most recent due to ORDER BY)
        const identityId = randomUUID();
        nationalIdToIdentity.set(patient.national_id, identityId);

        insertIdentity.run(
          identityId,
          patient.full_name,
          approxDob,
          patient.sex,
          patient.national_id,
          'CIN',
          patient.phone,
          patient.address,
          patient.allergies,
          patient.chronic_conditions,
          patient.current_medications,
          patient.medical_history,
          patient.surgical_history,
          patient.obstetric_history,
          now,
          now,
        );

        linkPatient.run(identityId, approxDob, 'CIN', patient.id);
      }
    }

    // Step 2: Handle patients WITHOUT national_id (each gets its own identity)
    const patientsWithoutNationalId = sqliteDb
      .prepare(`
        SELECT id, full_name, age, sex, phone, address,
               allergies, chronic_conditions, current_medications,
               medical_history, surgical_history, obstetric_history
        FROM patients
        WHERE patient_identity_id IS NULL AND national_id IS NULL
      `)
      .all() as Array<{
        id: string;
        full_name: string;
        age: number;
        sex: string;
        phone: string | null;
        address: string | null;
        allergies: string | null;
        chronic_conditions: string | null;
        current_medications: string | null;
        medical_history: string | null;
        surgical_history: string | null;
        obstetric_history: string | null;
      }>;

    for (const patient of patientsWithoutNationalId) {
      const identityId = randomUUID();
      const approxDob = `${currentYear - patient.age}-01-01`;

      insertIdentity.run(
        identityId,
        patient.full_name,
        approxDob,
        patient.sex,
        null,
        null,
        patient.phone,
        patient.address,
        patient.allergies,
        patient.chronic_conditions,
        patient.current_medications,
        patient.medical_history,
        patient.surgical_history,
        patient.obstetric_history,
        now,
        now,
      );

      linkPatient.run(identityId, approxDob, null, patient.id);
    }

    console.log(
      `✓ Migrated ${unmigrated.count} patient(s): ` +
      `${nationalIdToIdentity.size} shared identities (by national_id), ` +
      `${patientsWithoutNationalId.length} individual identities`,
    );
  });

  migrateTransaction();
}

function createPatientIdentityIndexes(sqliteDb: Database.Database): void {
  sqliteDb.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_identities_id_number
      ON patient_identities(id_number) WHERE id_number IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_patients_identity_id
      ON patients(patient_identity_id);
  `);
}
