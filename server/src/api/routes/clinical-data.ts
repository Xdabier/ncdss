import { Router } from 'express';
import { eq, like, or, and, sql, count, countDistinct } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import { getDb } from '../../database';
import {
  pathologies,
  pathologySymptoms,
  nursingInterventions,
  medicalInterventions,
  patients,
} from '../../database/schema';

const router = Router();

// ---------------------------------------------------------------------------
// Helpers (same as migrate-clinical-data.ts)
// ---------------------------------------------------------------------------

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
// Validation constants
// ---------------------------------------------------------------------------

const PATHOLOGY_ID_RE = /^[A-E]-\d{3}$/;
const VALID_TRIAGE_PRIORITIES = new Set(['SAUV', 'DECHOCAGE', 'SURGICAL', 'TRAUMA', 'MEDICAL', 'PEDIATRIC']);
const VALID_CATEGORIES = new Set(['A', 'B', 'C', 'D', 'E']);

interface ValidationError {
  sheet: string;
  row: number;
  message: string;
}

// ---------------------------------------------------------------------------
// POST /import — Bulk import from Excel (ADMIN/SUPER_ADMIN only)
// ---------------------------------------------------------------------------

router.post('/import', async (req, res) => {
  try {
    const { role } = (req as any).user;
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { file } = req.body;
    if (!file || typeof file !== 'string') {
      return res.status(400).json({ error: 'Fichier Excel requis (base64)' });
    }

    // Parse Excel from base64
    const buffer = Buffer.from(file, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    function readSheet(name: string): Record<string, unknown>[] | null {
      if (!workbook.SheetNames.includes(name)) {
        return null;
      }
      return XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: '' });
    }

    const rawPathologies = readSheet('Pathologies');
    const rawSymptoms = readSheet('Symptoms');
    const rawNursing = readSheet('NursingInterventions');
    const rawMedical = readSheet('MedicalInterventions');

    if (!rawPathologies) {
      return res.status(400).json({ error: 'Feuille "Pathologies" introuvable dans le fichier Excel' });
    }
    if (!rawSymptoms) {
      return res.status(400).json({ error: 'Feuille "Symptoms" introuvable dans le fichier Excel' });
    }
    if (!rawNursing) {
      return res.status(400).json({ error: 'Feuille "NursingInterventions" introuvable dans le fichier Excel' });
    }
    if (!rawMedical) {
      return res.status(400).json({ error: 'Feuille "MedicalInterventions" introuvable dans le fichier Excel' });
    }

    // --- Validate all rows ---

    const errors: ValidationError[] = [];
    const now = new Date().toISOString();

    // 1. Pathologies
    const validPathologyIds = new Set<string>();
    const pathologyRows: (typeof pathologies.$inferInsert)[] = [];

    for (let i = 0; i < rawPathologies.length; i++) {
      const row = rawPathologies[i];
      const rowNum = i + 2;
      const pid = str(row['pathology_id']);

      if (!PATHOLOGY_ID_RE.test(pid)) {
        errors.push({ sheet: 'Pathologies', row: rowNum, message: `pathology_id invalide "${pid}" (format attendu: [A-E]-NNN)` });
        continue;
      }

      const tp = str(row['triage_priority']);
      if (!VALID_TRIAGE_PRIORITIES.has(tp)) {
        errors.push({ sheet: 'Pathologies', row: rowNum, message: `triage_priority invalide "${tp}" pour ${pid}` });
        continue;
      }

      const nameFr = str(row['name_fr']);
      if (!nameFr) {
        errors.push({ sheet: 'Pathologies', row: rowNum, message: `name_fr vide pour ${pid}` });
        continue;
      }

      if (validPathologyIds.has(pid)) {
        errors.push({ sheet: 'Pathologies', row: rowNum, message: `pathology_id dupliqué "${pid}"` });
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

    for (let i = 0; i < rawSymptoms.length; i++) {
      const row = rawSymptoms[i];
      const rowNum = i + 2;
      const pid = str(row['pathology_id']);
      const code = str(row['symptom_code']);

      if (!validPathologyIds.has(pid)) {
        errors.push({ sheet: 'Symptoms', row: rowNum, message: `pathology_id "${pid}" absent de la feuille Pathologies` });
        continue;
      }

      if (!code) {
        errors.push({ sheet: 'Symptoms', row: rowNum, message: `symptom_code vide pour la pathologie ${pid}` });
        continue;
      }

      const dupKey = `${pid}|${code}`;
      if (symptomDupCheck.has(dupKey)) {
        errors.push({ sheet: 'Symptoms', row: rowNum, message: `Doublon (pathology_id + symptom_code): ${dupKey}` });
        continue;
      }
      symptomDupCheck.add(dupKey);

      const rawDescFr = str(row['symptom_fr']);
      const rawDescEn = str(row['symptom_en']);
      const descFr = rawDescFr || rawDescEn || code;

      const isVital = toBool(row['is_vital_sign']);
      const vitalOp = str(row['vital_sign_operator']) || null;
      const vitalVal = toNumberOrNull(row['vital_sign_value']);
      const vitalUnit = str(row['vital_sign_unit']) || null;

      if (isVital && (!vitalOp || vitalVal === null || !vitalUnit)) {
        errors.push({
          sheet: 'Symptoms',
          row: rowNum,
          message: `Signe vital ${code} pour ${pid} : opérateur/valeur/unité manquant(s)`,
        });
        continue;
      }

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
        errors.push({ sheet: 'NursingInterventions', row: rowNum, message: `pathology_id "${pid}" absent de la feuille Pathologies` });
        continue;
      }

      if (!code) {
        errors.push({ sheet: 'NursingInterventions', row: rowNum, message: `intervention_code vide pour la pathologie ${pid}` });
        continue;
      }

      const descFr = str(row['intervention_fr']);
      if (!descFr) {
        errors.push({ sheet: 'NursingInterventions', row: rowNum, message: `intervention_fr vide pour ${pid} / ${code}` });
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
        errors.push({ sheet: 'MedicalInterventions', row: rowNum, message: `pathology_id "${pid}" absent de la feuille Pathologies` });
        continue;
      }

      if (!code) {
        errors.push({ sheet: 'MedicalInterventions', row: rowNum, message: `intervention_code vide pour la pathologie ${pid}` });
        continue;
      }

      const descFr = str(row['intervention_fr']);
      if (!descFr) {
        errors.push({ sheet: 'MedicalInterventions', row: rowNum, message: `intervention_fr vide pour ${pid} / ${code}` });
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

    // --- Insert in transaction ---

    const db = getDb();
    const BATCH_SIZE = 100;

    // Use raw SQL transaction via the underlying better-sqlite3 connection
    // Drizzle's getDb() wraps better-sqlite3, so we use drizzle's delete/insert
    // which are synchronous under the hood for better-sqlite3
    await db.delete(medicalInterventions);
    await db.delete(nursingInterventions);
    await db.delete(pathologySymptoms);
    await db.delete(pathologies);

    for (let i = 0; i < pathologyRows.length; i += BATCH_SIZE) {
      await db.insert(pathologies).values(pathologyRows.slice(i, i + BATCH_SIZE));
    }

    for (let i = 0; i < symptomRows.length; i += BATCH_SIZE) {
      await db.insert(pathologySymptoms).values(symptomRows.slice(i, i + BATCH_SIZE));
    }

    for (let i = 0; i < nursingRows.length; i += BATCH_SIZE) {
      await db.insert(nursingInterventions).values(nursingRows.slice(i, i + BATCH_SIZE));
    }

    for (let i = 0; i < medicalRows.length; i += BATCH_SIZE) {
      await db.insert(medicalInterventions).values(medicalRows.slice(i, i + BATCH_SIZE));
    }

    // Clear stale patient analysis caches
    await db
      .update(patients)
      .set({
        matchedPathologies: null,
        suggestedNursingInterventions: null,
        suggestedMedicalInterventions: null,
        suggestedOrientation: null,
        orientationSource: null,
        orientationReason: null,
        analysisTimestamp: null,
      });

    res.json({
      imported: {
        pathologies: pathologyRows.length,
        symptoms: symptomRows.length,
        nursingInterventions: nursingRows.length,
        medicalInterventions: medicalRows.length,
      },
      errors,
    });
  } catch (error) {
    console.error('Import clinical data error:', error);
    res.status(500).json({ error: 'Erreur serveur lors de l\'importation' });
  }
});

// ---------------------------------------------------------------------------
// GET /pathologies — List pathologies with filters
// ---------------------------------------------------------------------------

router.get('/pathologies', async (req, res) => {
  try {
    const { search, category, triagePriority, limit = '50', offset = '0' } = req.query;
    const db = getDb();

    const conditions = [];

    if (search && typeof search === 'string') {
      conditions.push(
        or(
          like(pathologies.nameFr, `%${search}%`),
          like(pathologies.nameEn, `%${search}%`),
          like(pathologies.pathologyId, `%${search}%`),
          like(pathologies.icd10Code, `%${search}%`)
        )
      );
    }

    if (category && typeof category === 'string' && VALID_CATEGORIES.has(category)) {
      conditions.push(eq(pathologies.abcdeCategory, category));
    }

    if (triagePriority && typeof triagePriority === 'string' && VALID_TRIAGE_PRIORITIES.has(triagePriority)) {
      conditions.push(eq(pathologies.triagePriority, triagePriority));
    }

    let query = db.select().from(pathologies);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const result = await (query as any)
      .limit(Math.min(Number(limit) || 50, 500))
      .offset(Number(offset) || 0);

    res.json(result);
  } catch (error) {
    console.error('List pathologies error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------------------------------------------------------------------------
// GET /pathologies/:id — Single pathology with symptoms + interventions
// ---------------------------------------------------------------------------

router.get('/pathologies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const [pathology] = await db
      .select()
      .from(pathologies)
      .where(eq(pathologies.pathologyId, id));

    if (!pathology) {
      return res.status(404).json({ error: 'Pathologie non trouvée' });
    }

    const symptoms = await db
      .select()
      .from(pathologySymptoms)
      .where(eq(pathologySymptoms.pathologyId, id))
      .orderBy(pathologySymptoms.symptomCode);

    const nursing = await db
      .select()
      .from(nursingInterventions)
      .where(eq(nursingInterventions.pathologyId, id))
      .orderBy(nursingInterventions.priorityOrder);

    const medical = await db
      .select()
      .from(medicalInterventions)
      .where(eq(medicalInterventions.pathologyId, id))
      .orderBy(medicalInterventions.priorityOrder);

    res.json({
      ...pathology,
      symptoms,
      nursingInterventions: nursing,
      medicalInterventions: medical,
    });
  } catch (error) {
    console.error('Get pathology error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------------------------------------------------------------------------
// GET /symptoms — All unique symptom codes
// ---------------------------------------------------------------------------

router.get('/symptoms', async (req, res) => {
  try {
    const db = getDb();

    const result = await db
      .selectDistinct({
        symptomCode: pathologySymptoms.symptomCode,
        descriptionFr: pathologySymptoms.descriptionFr,
        isVitalSign: pathologySymptoms.isVitalSign,
      })
      .from(pathologySymptoms)
      .orderBy(pathologySymptoms.symptomCode);

    res.json(result);
  } catch (error) {
    console.error('List symptoms error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------------------------------------------------------------------------
// GET /stats — Counts per table, per category
// ---------------------------------------------------------------------------

router.get('/stats', async (req, res) => {
  try {
    const db = getDb();

    const [pathologyCount] = await db
      .select({ count: count() })
      .from(pathologies);

    const [symptomCount] = await db
      .select({ count: count() })
      .from(pathologySymptoms);

    const [uniqueSymptomCount] = await db
      .select({ count: countDistinct(pathologySymptoms.symptomCode) })
      .from(pathologySymptoms);

    const [nursingCount] = await db
      .select({ count: count() })
      .from(nursingInterventions);

    const [medicalCount] = await db
      .select({ count: count() })
      .from(medicalInterventions);

    const categoryRows = await db
      .select({
        category: pathologies.abcdeCategory,
        count: count(),
      })
      .from(pathologies)
      .groupBy(pathologies.abcdeCategory);

    const byCategory: Record<string, number> = {};
    for (const row of categoryRows) {
      byCategory[row.category] = row.count;
    }

    res.json({
      pathologies: pathologyCount.count,
      symptoms: symptomCount.count,
      uniqueSymptomCodes: uniqueSymptomCount.count,
      nursingInterventions: nursingCount.count,
      medicalInterventions: medicalCount.count,
      byCategory,
    });
  } catch (error) {
    console.error('Clinical data stats error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export { router as clinicalDataRouter };
