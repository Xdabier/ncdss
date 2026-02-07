/**
 * Clinical Data Migration Script
 * Imports language-agnostic pathology data from the multi-sheet Excel file
 * into the new clinical tables (pathologies, pathology_symptoms,
 * nursing_interventions, medical_interventions).
 *
 * Run with: npx tsx src/scripts/migrate-clinical-data.ts
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import {
  pathologies,
  pathologySymptoms,
  nursingInterventions,
  medicalInterventions,
  patients,
} from '../database/schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

  return path.join(appDataPath, 'ncdss-server', 'ncdss-server.db');
}

function str(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function toBool(value: unknown): boolean {
  const s = str(value).toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function toNumberOrNull(value: unknown): number | null {
  const s = str(value);
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toInt(value: unknown, fallback: number = 0): number {
  const n = toNumberOrNull(value);
  return n !== null ? Math.round(n) : fallback;
}

/** Split semicolon-delimited department codes into a JSON array string. */
function deptCodesToJson(primary: unknown, secondary: unknown): string | null {
  const parts: string[] = [];
  for (const raw of [primary, secondary]) {
    const s = str(raw);
    if (s) {
      for (const code of s.split(';')) {
        const trimmed = code.trim();
        if (trimmed && !parts.includes(trimmed)) {
          parts.push(trimmed);
        }
      }
    }
  }
  return parts.length > 0 ? JSON.stringify(parts) : null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const PATHOLOGY_ID_RE = /^[A-E]-\d{3}$/;
const VALID_TRIAGE_PRIORITIES = new Set(['SAUV', 'SURGICAL', 'TRAUMA', 'MEDICAL', 'PEDIATRIC']);

interface ValidationError {
  sheet: string;
  row: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/** Ensure the 4 new clinical tables exist (idempotent). */
function ensureTables(sqlite: InstanceType<typeof Database>): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS pathologies (
      pathology_id TEXT PRIMARY KEY,
      icd10_code TEXT NOT NULL,
      abcde_category TEXT NOT NULL,
      name_fr TEXT NOT NULL,
      name_en TEXT,
      triage_priority TEXT NOT NULL,
      department_codes TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE TABLE IF NOT EXISTS pathology_symptoms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pathology_id TEXT NOT NULL REFERENCES pathologies(pathology_id),
      symptom_code TEXT NOT NULL,
      description_fr TEXT NOT NULL,
      description_en TEXT,
      is_vital_sign INTEGER NOT NULL DEFAULT 0,
      vital_operator TEXT,
      vital_value REAL,
      vital_unit TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE TABLE IF NOT EXISTS nursing_interventions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pathology_id TEXT NOT NULL REFERENCES pathologies(pathology_id),
      intervention_code TEXT NOT NULL,
      description_fr TEXT NOT NULL,
      description_en TEXT,
      priority_order INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE TABLE IF NOT EXISTS medical_interventions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pathology_id TEXT NOT NULL REFERENCES pathologies(pathology_id),
      intervention_code TEXT NOT NULL,
      description_fr TEXT NOT NULL,
      description_en TEXT,
      is_surgical INTEGER NOT NULL DEFAULT 0,
      priority_order INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
  `);
}

async function migrate(): Promise<void> {
  console.log('=== Clinical Data Migration ===\n');

  // --- Connect to database ---------------------------------------------------
  const dbPath = getDbPath();
  console.log('Database path:', dbPath);

  if (!fs.existsSync(dbPath)) {
    console.error('ERROR: Database not found at', dbPath);
    console.error('Run migrations first (npm run db:push or start the server once).');
    process.exit(1);
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  // Ensure tables exist before using Drizzle (schema may not have been pushed)
  ensureTables(sqlite);

  const db = drizzle(sqlite);

  // --- Locate Excel file -----------------------------------------------------
  const excelPath = path.join(process.cwd(), '..', 'docs', 'ABCDE_NCDSS_v2_updated.xlsx');

  if (!fs.existsSync(excelPath)) {
    console.error('ERROR: Excel file not found at', excelPath);
    process.exit(1);
  }

  console.log('Excel file:', excelPath, '\n');

  const workbook = XLSX.readFile(excelPath);

  // --- Parse sheets ----------------------------------------------------------

  function readSheet(name: string): Record<string, unknown>[] {
    if (!workbook.SheetNames.includes(name)) {
      console.error(`ERROR: Sheet "${name}" not found. Available: ${workbook.SheetNames.join(', ')}`);
      process.exit(1);
    }
    return XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: '' });
  }

  const rawPathologies = readSheet('Pathologies');
  const rawSymptoms = readSheet('Symptoms');
  const rawNursing = readSheet('NursingInterventions');
  const rawMedical = readSheet('MedicalInterventions');

  console.log(`Parsed sheets:`);
  console.log(`  Pathologies:          ${rawPathologies.length} rows`);
  console.log(`  Symptoms:             ${rawSymptoms.length} rows`);
  console.log(`  NursingInterventions: ${rawNursing.length} rows`);
  console.log(`  MedicalInterventions: ${rawMedical.length} rows\n`);

  // --- Validate --------------------------------------------------------------

  const errors: ValidationError[] = [];
  const now = new Date().toISOString();

  // 1. Pathologies
  const validPathologyIds = new Set<string>();
  const pathologyRows: (typeof pathologies.$inferInsert)[] = [];

  for (let i = 0; i < rawPathologies.length; i++) {
    const row = rawPathologies[i];
    const rowNum = i + 2; // 1-indexed header + 1
    const pid = str(row['pathology_id']);

    if (!PATHOLOGY_ID_RE.test(pid)) {
      errors.push({ sheet: 'Pathologies', row: rowNum, message: `Invalid pathology_id "${pid}" (expected pattern [A-E]-NNN)` });
      continue;
    }

    const tp = str(row['triage_priority']);
    if (!VALID_TRIAGE_PRIORITIES.has(tp)) {
      errors.push({ sheet: 'Pathologies', row: rowNum, message: `Invalid triage_priority "${tp}" for ${pid}` });
      continue;
    }

    const nameFr = str(row['name_fr']);
    if (!nameFr) {
      errors.push({ sheet: 'Pathologies', row: rowNum, message: `Empty name_fr for ${pid}` });
      continue;
    }

    if (validPathologyIds.has(pid)) {
      errors.push({ sheet: 'Pathologies', row: rowNum, message: `Duplicate pathology_id "${pid}"` });
      continue;
    }

    validPathologyIds.add(pid);

    pathologyRows.push({
      pathologyId: pid,
      icd10Code: str(row['icd10_code']),
      abcdeCategory: str(row['abcde_category']),
      nameFr,
      nameEn: str(row['name_en']) || null,
      triagePriority: tp,
      departmentCodes: deptCodesToJson(row['department_codes'], row['secondary_department_codes']),
      createdAt: now,
      updatedAt: now,
    });
  }

  // 2. Symptoms
  const symptomDupCheck = new Set<string>();
  const symptomRows: (typeof pathologySymptoms.$inferInsert)[] = [];
  const uniqueSymptomCodes = new Set<string>();

  for (let i = 0; i < rawSymptoms.length; i++) {
    const row = rawSymptoms[i];
    const rowNum = i + 2;
    const pid = str(row['pathology_id']);
    const code = str(row['symptom_code']);

    if (!validPathologyIds.has(pid)) {
      errors.push({ sheet: 'Symptoms', row: rowNum, message: `pathology_id "${pid}" not found in Pathologies sheet` });
      continue;
    }

    if (!code) {
      errors.push({ sheet: 'Symptoms', row: rowNum, message: `Empty symptom_code for pathology ${pid}` });
      continue;
    }

    const dupKey = `${pid}|${code}`;
    if (symptomDupCheck.has(dupKey)) {
      errors.push({ sheet: 'Symptoms', row: rowNum, message: `Duplicate (pathology_id + symptom_code): ${dupKey}` });
      continue;
    }
    symptomDupCheck.add(dupKey);

    const rawDescFr = str(row['symptom_fr']);
    const rawDescEn = str(row['symptom_en']);
    // Fall back to English or code when French is missing (cross-referenced shared symptoms)
    const descFr = rawDescFr || rawDescEn || code;
    if (!rawDescFr) {
      errors.push({ sheet: 'Symptoms', row: rowNum, message: `Empty symptom_fr for ${pid} / ${code} — using fallback "${descFr}"` });
    }

    const isVital = toBool(row['is_vital_sign']);
    const vitalOp = str(row['vital_sign_operator']) || null;
    const vitalVal = toNumberOrNull(row['vital_sign_value']);
    const vitalUnit = str(row['vital_sign_unit']) || null;

    if (isVital) {
      if (!vitalOp || vitalVal === null || !vitalUnit) {
        errors.push({
          sheet: 'Symptoms',
          row: rowNum,
          message: `Vital sign ${code} for ${pid} missing operator/value/unit (op=${vitalOp}, val=${vitalVal}, unit=${vitalUnit})`,
        });
        continue;
      }
    }

    uniqueSymptomCodes.add(code);

    symptomRows.push({
      pathologyId: pid,
      symptomCode: code,
      descriptionFr: descFr,
      descriptionEn: str(row['symptom_en']) || null,
      isVitalSign: isVital,
      vitalOperator: vitalOp,
      vitalValue: vitalVal,
      vitalUnit: vitalUnit,
      createdAt: now,
      updatedAt: now,
    });
  }

  // 3. Nursing Interventions
  const nursingRows: (typeof nursingInterventions.$inferInsert)[] = [];

  for (let i = 0; i < rawNursing.length; i++) {
    const row = rawNursing[i];
    const rowNum = i + 2;
    const pid = str(row['pathology_id']);
    const code = str(row['intervention_code']);

    if (!validPathologyIds.has(pid)) {
      errors.push({ sheet: 'NursingInterventions', row: rowNum, message: `pathology_id "${pid}" not found in Pathologies sheet` });
      continue;
    }

    if (!code) {
      errors.push({ sheet: 'NursingInterventions', row: rowNum, message: `Empty intervention_code for pathology ${pid}` });
      continue;
    }

    const descFr = str(row['intervention_fr']);
    if (!descFr) {
      errors.push({ sheet: 'NursingInterventions', row: rowNum, message: `Empty intervention_fr for ${pid} / ${code}` });
      continue;
    }

    nursingRows.push({
      pathologyId: pid,
      interventionCode: code,
      descriptionFr: descFr,
      descriptionEn: str(row['intervention_en']) || null,
      priorityOrder: toInt(row['priority_order'], 1),
      createdAt: now,
      updatedAt: now,
    });
  }

  // 4. Medical Interventions
  const medicalRows: (typeof medicalInterventions.$inferInsert)[] = [];

  for (let i = 0; i < rawMedical.length; i++) {
    const row = rawMedical[i];
    const rowNum = i + 2;
    const pid = str(row['pathology_id']);
    const code = str(row['intervention_code']);

    if (!validPathologyIds.has(pid)) {
      errors.push({ sheet: 'MedicalInterventions', row: rowNum, message: `pathology_id "${pid}" not found in Pathologies sheet` });
      continue;
    }

    if (!code) {
      errors.push({ sheet: 'MedicalInterventions', row: rowNum, message: `Empty intervention_code for pathology ${pid}` });
      continue;
    }

    const descFr = str(row['intervention_fr']);
    if (!descFr) {
      errors.push({ sheet: 'MedicalInterventions', row: rowNum, message: `Empty intervention_fr for ${pid} / ${code}` });
      continue;
    }

    medicalRows.push({
      pathologyId: pid,
      interventionCode: code,
      descriptionFr: descFr,
      descriptionEn: str(row['intervention_en']) || null,
      isSurgical: toBool(row['is_surgical']),
      priorityOrder: toInt(row['priority_order'], 1),
      createdAt: now,
      updatedAt: now,
    });
  }

  // --- Report validation errors ----------------------------------------------
  if (errors.length > 0) {
    console.log(`Validation errors (${errors.length}):`);
    for (const e of errors) {
      console.log(`  [${e.sheet} row ${e.row}] ${e.message}`);
    }
    console.log();
  }

  // --- Insert into database in a transaction ---------------------------------
  console.log('Inserting data into database...');

  const BATCH_SIZE = 100;

  sqlite.exec('BEGIN TRANSACTION');

  try {
    // Clear new tables (order matters for foreign keys)
    sqlite.exec('DELETE FROM medical_interventions');
    sqlite.exec('DELETE FROM nursing_interventions');
    sqlite.exec('DELETE FROM pathology_symptoms');
    sqlite.exec('DELETE FROM pathologies');

    // Insert pathologies
    for (let i = 0; i < pathologyRows.length; i += BATCH_SIZE) {
      const batch = pathologyRows.slice(i, i + BATCH_SIZE);
      await db.insert(pathologies).values(batch);
    }

    // Insert symptoms
    for (let i = 0; i < symptomRows.length; i += BATCH_SIZE) {
      const batch = symptomRows.slice(i, i + BATCH_SIZE);
      await db.insert(pathologySymptoms).values(batch);
    }

    // Insert nursing interventions
    for (let i = 0; i < nursingRows.length; i += BATCH_SIZE) {
      const batch = nursingRows.slice(i, i + BATCH_SIZE);
      await db.insert(nursingInterventions).values(batch);
    }

    // Insert medical interventions
    for (let i = 0; i < medicalRows.length; i += BATCH_SIZE) {
      const batch = medicalRows.slice(i, i + BATCH_SIZE);
      await db.insert(medicalInterventions).values(batch);
    }

    // Clear stale patient analysis caches
    const clearResult = sqlite.prepare(`
      UPDATE patients SET
        matched_pathologies = NULL,
        suggested_nursing_interventions = NULL,
        suggested_medical_interventions = NULL,
        suggested_orientation = NULL,
        orientation_source = NULL,
        orientation_reason = NULL,
        analysis_timestamp = NULL
    `).run();

    sqlite.exec('COMMIT');

    // --- Summary ---------------------------------------------------------------
    console.log('\n=== Migration Summary ===\n');
    console.log(`  Pathologies imported:          ${pathologyRows.length}`);
    console.log(`  Symptoms imported:             ${symptomRows.length} (${uniqueSymptomCodes.size} unique codes)`);
    console.log(`  Nursing interventions imported: ${nursingRows.length}`);
    console.log(`  Medical interventions imported: ${medicalRows.length}`);
    console.log(`  Validation errors:             ${errors.length}`);
    console.log(`  Patient caches cleared:        ${clearResult.changes}`);

    if (errors.length > 0) {
      console.log('\n  Validation errors listed above. Skipped rows were not imported.');
    }

    console.log('\nMigration complete.');
  } catch (error: unknown) {
    sqlite.exec('ROLLBACK');
    const msg = error instanceof Error ? error.message : String(error);
    console.error('\nERROR during insert — transaction rolled back:', msg);
    process.exit(1);
  } finally {
    sqlite.close();
  }
}

migrate();
