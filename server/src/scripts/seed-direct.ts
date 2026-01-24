/**
 * Direct database seed script (no API required)
 * Run with: npx tsx src/scripts/seed-direct.ts
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { clinicalPathologies, presentingComplaints } from '../database/schema';
import { normalizeText, parseOrientation, mapCategoryToOrientation } from '../utils/textNormalization';

// Helper function to parse comma-separated string to array
function parseList(value: any): string[] {
  if (!value || value === '—' || value === '-' || value === '') return [];
  const str = String(value).trim();
  if (str === '') return [];
  return str.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

// Helper function to safely get cell value
function getCellValue(row: any[], index: number): string {
  const value = row[index];
  if (value === undefined || value === null || value === '—' || value === '-') return '';
  return String(value).trim();
}

// Determine database path
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

async function seedDirectly() {
  console.log('🌱 Starting direct reference data seeding...\n');

  const dbPath = getDbPath();
  console.log('Database path:', dbPath);

  if (!fs.existsSync(dbPath)) {
    console.error('❌ Database not found. Run migrations first.');
    process.exit(1);
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  const db = drizzle(sqlite);

  try {
    // Step 1: Parse and import ABCDE clinical pathologies
    console.log('📊 Parsing ABCDE clinical pathologies Excel file...');
    const interventionsPath = path.join(process.cwd(), '..', 'ABCDE_assessment_interventions_and_orientation.xlsx');

    if (!fs.existsSync(interventionsPath)) {
      console.error('❌ Excel file not found:', interventionsPath);
      process.exit(1);
    }

    const workbook = XLSX.readFile(interventionsPath);
    const clinicalPathologiesData: any[] = [];

    // Parse Générale sheet
    console.log('  📄 Processing Générale sheet...');
    if (workbook.SheetNames.includes('Générale')) {
      const generaleSheet = workbook.Sheets['Générale'];
      const generaleData = XLSX.utils.sheet_to_json(generaleSheet, {
        header: 1,
        defval: '',
        range: 3
      }) as any[][];

      generaleData.forEach((row) => {
        const pathologyName = getCellValue(row, 0);
        if (!pathologyName) return;

        clinicalPathologiesData.push({
          pathologyName,
          pathologyNameNormalized: normalizeText(pathologyName),
          abcdeCategory: 'GENERAL',
          severitySigns: JSON.stringify(parseList(row[1])),
          nursingInterventions: JSON.stringify(parseList(row[2])),
          medicalInterventions: JSON.stringify(parseList(row[3])),
          dosageFormulas: getCellValue(row, 4),
          orientation: '',
          primaryOrientation: 'MEDICAL',
          secondaryOrientation: null,
          isSAUV: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });
      console.log(`    ✓ Processed ${generaleData.filter(r => getCellValue(r, 0)).length} general interventions`);
    }

    // Parse ABCDE sheets
    const abcdeSheets = [
      { name: 'Airway', category: 'A' },
      { name: 'Breathing', category: 'B' },
      { name: 'Circulation', category: 'C' },
      { name: 'Disability', category: 'D' },
      { name: 'Exposure', category: 'E' }
    ];

    for (const sheet of abcdeSheets) {
      console.log(`  📄 Processing ${sheet.name} sheet...`);
      if (workbook.SheetNames.includes(sheet.name)) {
        const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheet.name], {
          header: 1,
          defval: '',
          range: 3
        }) as any[][];

        let count = 0;
        sheetData.forEach(row => {
          const pathologyName = getCellValue(row, 0);
          const abcdeCategory = getCellValue(row, 1);

          if (!pathologyName || !abcdeCategory) return;

          const orientationRaw = getCellValue(row, 5);
          const { primary, secondary, isSAUV } = parseOrientation(orientationRaw);

          clinicalPathologiesData.push({
            pathologyName,
            pathologyNameNormalized: normalizeText(pathologyName),
            abcdeCategory: abcdeCategory.toUpperCase(),
            severitySigns: JSON.stringify(parseList(row[2])),
            nursingInterventions: JSON.stringify(parseList(row[3])),
            medicalInterventions: JSON.stringify(parseList(row[4])),
            dosageFormulas: '',
            orientation: orientationRaw,
            primaryOrientation: primary,
            secondaryOrientation: secondary,
            isSAUV,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          count++;
        });

        console.log(`    ✓ Processed ${count} ${sheet.category} interventions`);
      }
    }

    // Clear existing data and insert new
    console.log(`\n📤 Inserting ${clinicalPathologiesData.length} clinical pathologies...`);
    sqlite.exec('DELETE FROM clinical_pathologies');

    for (const item of clinicalPathologiesData) {
      await db.insert(clinicalPathologies).values(item);
    }
    console.log('✅ Clinical pathologies imported successfully\n');

    // Step 2: Parse and import presenting complaints
    console.log('📊 Parsing presenting complaints Excel file...');
    const pathologiesPath = path.join(process.cwd(), '..', 'pathologies_classification.xlsx');

    if (!fs.existsSync(pathologiesPath)) {
      console.error('❌ Excel file not found:', pathologiesPath);
      process.exit(1);
    }

    const pathologiesWorkbook = XLSX.readFile(pathologiesPath);

    if (!pathologiesWorkbook.SheetNames.includes('Pathologies motif consultation')) {
      throw new Error('Sheet "Pathologies motif consultation" not found');
    }

    const pathologiesSheet = pathologiesWorkbook.Sheets['Pathologies motif consultation'];
    const pathologiesData = XLSX.utils.sheet_to_json(pathologiesSheet, {
      header: 1,
      defval: '',
      range: 1
    }) as any[][];

    const complaintsData: any[] = [];

    pathologiesData.forEach(row => {
      const name = getCellValue(row, 0);
      if (!name) return;

      const category = getCellValue(row, 1);
      const isMultiCategory = category.includes('/');
      const primaryOrientation = mapCategoryToOrientation(category.split('/')[0]);
      const secondaryOrientation = isMultiCategory
        ? mapCategoryToOrientation(category.split('/')[1])
        : null;

      complaintsData.push({
        name,
        nameNormalized: normalizeText(name),
        category,
        primaryOrientation,
        secondaryOrientation,
        isMultiCategory,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    });

    console.log(`  ✓ Parsed ${complaintsData.length} presenting complaints`);

    // Clear existing data and insert new
    console.log(`\n📤 Inserting ${complaintsData.length} presenting complaints...`);
    sqlite.exec('DELETE FROM presenting_complaints');

    for (const item of complaintsData) {
      await db.insert(presentingComplaints).values(item);
    }
    console.log('✅ Presenting complaints imported successfully\n');

    console.log('🎉 Reference data seeding completed successfully!');
    console.log('\n📈 Summary:');
    console.log(`  - ${clinicalPathologiesData.length} clinical pathologies imported`);
    console.log(`  - ${complaintsData.length} presenting complaints imported`);

  } catch (error: any) {
    console.error('\n❌ Error seeding reference data:', error.message);
    process.exit(1);
  } finally {
    sqlite.close();
  }
}

seedDirectly();
