import * as XLSX from 'xlsx';
import axios from 'axios';
import * as path from 'path';

// Import normalization utilities
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

interface ClinicalPathologyData {
  pathologyName: string;
  pathologyNameNormalized: string;
  abcdeCategory: string;
  severitySigns: string[];
  nursingInterventions: string[];
  medicalInterventions: string[];
  dosageFormulas: string;
  orientation: string;
  primaryOrientation: string;
  secondaryOrientation: string | null;
  isSAUV: boolean;
}

interface PresentingComplaintData {
  name: string;
  nameNormalized: string;
  category: string;
  primaryOrientation: string;
  secondaryOrientation: string | null;
  isMultiCategory: boolean;
}

async function seedReferenceData() {
  console.log('🌱 Starting reference data seeding...\n');

  try {
    // Step 1: Login as admin to get JWT token
    console.log('🔐 Authenticating as admin...');
    const loginRes = await axios.post('http://localhost:3000/api/auth/login', {
      username: 'admin',
      password: 'admin123'
    });
    const token = loginRes.data.accessToken;
    console.log('✅ Authentication successful\n');

    // Step 2: Parse and import ABCDE clinical pathologies (interventions)
    console.log('📊 Parsing ABCDE clinical pathologies Excel file...');
    const interventionsPath = path.join(process.cwd(), '..', 'ABCDE_assessment_interventions_and_orientation.xlsx');
    const workbook = XLSX.readFile(interventionsPath);
    const clinicalPathologies: ClinicalPathologyData[] = [];

    // Parse Générale sheet (no orientation column)
    console.log('  📄 Processing Générale sheet...');
    if (workbook.SheetNames.includes('Générale')) {
      const generaleSheet = workbook.Sheets['Générale'];
      const generaleData = XLSX.utils.sheet_to_json(generaleSheet, {
        header: 1,
        defval: '',
        range: 3 // Skip first 3 rows (title, empty, headers)
      }) as any[][];

      generaleData.forEach((row) => {
        const pathologyName = getCellValue(row, 0);
        if (!pathologyName) return; // Skip empty rows

        clinicalPathologies.push({
          pathologyName,
          pathologyNameNormalized: normalizeText(pathologyName),
          abcdeCategory: 'GENERAL',
          severitySigns: parseList(row[1]),
          nursingInterventions: parseList(row[2]),
          medicalInterventions: parseList(row[3]),
          dosageFormulas: getCellValue(row, 4),
          orientation: '', // Not present in Générale sheet
          primaryOrientation: 'MEDICAL', // Default for general
          secondaryOrientation: null,
          isSAUV: false
        });
      });
      console.log(`    ✓ Processed ${generaleData.filter(r => getCellValue(r, 0)).length} general interventions`);
    }

    // Parse Airway, Breathing, Circulation, Disability, Exposure sheets
    // These have the Orientation column at index 5
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
          range: 3 // Skip first 3 rows
        }) as any[][];

        const count = sheetData.filter(row => {
          const pathologyName = getCellValue(row, 0);
          const abcdeCategory = getCellValue(row, 1);

          if (!pathologyName || !abcdeCategory) return false;

          // Get orientation from column 5 (index 5)
          const orientationRaw = getCellValue(row, 5);
          const { primary, secondary, isSAUV } = parseOrientation(orientationRaw);

          clinicalPathologies.push({
            pathologyName,
            pathologyNameNormalized: normalizeText(pathologyName),
            abcdeCategory: abcdeCategory.toUpperCase(),
            severitySigns: parseList(row[2]),       // Symptoms / Signes
            nursingInterventions: parseList(row[3]), // Nursing interventions
            medicalInterventions: parseList(row[4]), // Medical intervention
            dosageFormulas: '',                      // Not present in these sheets
            orientation: orientationRaw,             // Raw value from Excel
            primaryOrientation: primary,
            secondaryOrientation: secondary,
            isSAUV
          });
          return true;
        }).length;

        console.log(`    ✓ Processed ${count} ${sheet.category} interventions (with orientation)`);
      }
    }

    console.log(`\n📤 Importing ${clinicalPathologies.length} clinical pathologies to database...`);
    await axios.post(
      'http://localhost:3000/api/interventions/import',
      { interventions: clinicalPathologies },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log('✅ Clinical pathologies imported successfully\n');

    // Step 3: Parse and import presenting complaints (motifs de consultation)
    console.log('📊 Parsing presenting complaints Excel file...');
    const pathologiesPath = path.join(process.cwd(), '..', 'pathologies_classification.xlsx');
    const pathologiesWorkbook = XLSX.readFile(pathologiesPath);

    if (!pathologiesWorkbook.SheetNames.includes('Pathologies motif consultation')) {
      throw new Error('Sheet "Pathologies motif consultation" not found');
    }

    const pathologiesSheet = pathologiesWorkbook.Sheets['Pathologies motif consultation'];
    const pathologiesData = XLSX.utils.sheet_to_json(pathologiesSheet, {
      header: 1,
      defval: '',
      range: 1 // Skip header row
    }) as any[][];

    const presentingComplaints: PresentingComplaintData[] = pathologiesData
      .filter(row => getCellValue(row, 0)) // Skip empty rows
      .map(row => {
        const name = getCellValue(row, 0);
        const category = getCellValue(row, 1);
        const isMultiCategory = category.includes('/');
        const primaryOrientation = mapCategoryToOrientation(category.split('/')[0]);
        const secondaryOrientation = isMultiCategory
          ? mapCategoryToOrientation(category.split('/')[1])
          : null;

        return {
          name,
          nameNormalized: normalizeText(name),
          category,
          primaryOrientation,
          secondaryOrientation,
          isMultiCategory
        };
      });

    console.log(`  ✓ Parsed ${presentingComplaints.length} presenting complaints`);

    console.log(`\n📤 Importing ${presentingComplaints.length} presenting complaints to database...`);
    await axios.post(
      'http://localhost:3000/api/pathologies/import',
      { pathologies: presentingComplaints },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log('✅ Presenting complaints imported successfully\n');

    console.log('🎉 Reference data seeding completed successfully!');
    console.log('\n📈 Summary:');
    console.log(`  - ${clinicalPathologies.length} clinical pathologies imported (ABCDE interventions)`);
    console.log(`  - ${presentingComplaints.length} presenting complaints imported (motifs de consultation)`);
    console.log('\n💡 Verify data using: npm run db:studio');

  } catch (error: any) {
    console.error('\n❌ Error seeding reference data:');
    if (error.response) {
      console.error(`  HTTP ${error.response.status}: ${error.response.statusText}`);
      console.error(`  ${JSON.stringify(error.response.data, null, 2)}`);
    } else if (error.code === 'ENOENT') {
      console.error(`  File not found: ${error.path}`);
      console.error('  Make sure Excel files are in the project root directory');
    } else {
      console.error(`  ${error.message}`);
    }
    process.exit(1);
  }
}

// Run the seed function
seedReferenceData();
