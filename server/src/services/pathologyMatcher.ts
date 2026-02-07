/**
 * Pathology Matcher Service
 * Matches ABCDE observations and vital signs to pathologies using
 * code-based matching (language-agnostic).
 *
 * Algorithm:
 * 1. Map form observations → symptom codes (static mapping via symptomMapper)
 * 2. Filter pathologies by active ABCDE categories
 * 3. Score each pathology: |staticMatched ∪ vitalMatched| / totalSymptoms
 * 4. Load interventions for top matches
 * 5. Determine orientation via 4-priority cascade
 */

import type { InferSelectModel } from 'drizzle-orm';
import { inArray } from 'drizzle-orm';
import { getDb } from '../database';
import {
  pathologies,
  pathologySymptoms,
  nursingInterventions as nursingInterventionsTable,
  medicalInterventions as medicalInterventionsTable,
} from '../database/schema';
import {
  mapObservationsToSymptomCodes,
  evaluateVitalSignThresholds,
} from './symptomMapper';
import type {
  AirwayObservations,
  BreathingObservations,
  CirculationObservations,
  DisabilityObservations,
  ExposureObservations,
  PathologySymptom,
  PathologyMatchResult,
  ClinicalAnalysisResult,
  OrientationSourceType,
  TriagePriority,
  NursingIntervention,
  MedicalIntervention,
} from '@ncdss/shared';

// ============================================================================
// Helpers
// ============================================================================

type PathologyRow = InferSelectModel<typeof pathologies>;
type PathologySymptomRow = InferSelectModel<typeof pathologySymptoms>;

/** Check if an observation object contains any clinical data (excludes 'notes'). */
function hasObservationData(obj: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'notes') continue;
    if (value != null) return true;
  }
  return false;
}

/** Determine which ABCDE categories have observation data. */
function getActiveCategories(
  airway: Partial<AirwayObservations>,
  breathing: Partial<BreathingObservations>,
  circulation: Partial<CirculationObservations>,
  disability: Partial<DisabilityObservations>,
  exposure: Partial<ExposureObservations>,
): string[] {
  const cats: string[] = [];
  if (hasObservationData(airway as Record<string, unknown>)) cats.push('A');
  if (hasObservationData(breathing as Record<string, unknown>)) cats.push('B');
  if (hasObservationData(circulation as Record<string, unknown>)) cats.push('C');
  if (hasObservationData(disability as Record<string, unknown>)) cats.push('D');
  if (hasObservationData(exposure as Record<string, unknown>)) cats.push('E');
  return cats;
}

/** Convert a SYM_/VS_ code to a human-readable fallback string. */
function formatSymptomCode(code: string): string {
  return code
    .replace(/^(SYM_|VS_)/, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^./, c => c.toUpperCase());
}

/** Resolve French descriptions for symptom codes, falling back to formatted code. */
function resolveCodeDescriptions(
  codes: Iterable<string>,
  symptomRows: { symptomCode: string; descriptionFr: string }[],
): string[] {
  const lookup = new Map<string, string>();
  for (const row of symptomRows) {
    if (!lookup.has(row.symptomCode)) {
      lookup.set(row.symptomCode, row.descriptionFr);
    }
  }
  return Array.from(codes, code => lookup.get(code) ?? formatSymptomCode(code));
}

/** Convert a DB symptom row to a PathologySymptom for evaluateVitalSignThresholds. */
function toPathologySymptom(row: PathologySymptomRow): PathologySymptom {
  return {
    id: row.id,
    pathologyId: row.pathologyId,
    symptomCode: row.symptomCode,
    descriptionFr: row.descriptionFr,
    descriptionEn: row.descriptionEn ?? undefined,
    isVitalSign: row.isVitalSign,
    vitalOperator: (row.vitalOperator ?? undefined) as PathologySymptom['vitalOperator'],
    vitalValue: row.vitalValue ?? undefined,
    vitalUnit: (row.vitalUnit ?? undefined) as PathologySymptom['vitalUnit'],
  };
}

// ============================================================================
// Main exported function
// ============================================================================

export async function matchFindingsToPathologies(
  airway: Partial<AirwayObservations>,
  breathing: Partial<BreathingObservations>,
  circulation: Partial<CirculationObservations>,
  disability: Partial<DisabilityObservations>,
  exposure: Partial<ExposureObservations>,
  vitals: {
    heartRate?: number;
    systolicBP?: number;
    diastolicBP?: number;
    respiratoryRate?: number;
    oxygenSaturation?: number;
    temperature?: number;
    gcsScore?: number;
    painLevel?: number;
    glucoseLevel?: number;
  },
  scores?: { news?: number; gcs?: number; qsofa?: number; esi?: number },
): Promise<ClinicalAnalysisResult> {
  const db = getDb();
  const effectiveScores = scores ?? {};

  // ── Step 1: Static symptom code mapping ─────────────────────────────
  const { observedCodes, criticalCodes } = mapObservationsToSymptomCodes(
    airway, breathing, circulation, disability, exposure,
  );

  // ── Step 2: Determine active ABCDE categories ──────────────────────
  const activeCategories = getActiveCategories(
    airway, breathing, circulation, disability, exposure,
  );
  // Always include cross-category pathologies
  const filterCategories = [...activeCategories, 'GENERAL'];

  // ── Step 3: Load pathologies filtered by active categories ─────────
  const filteredPathologies: PathologyRow[] = await db
    .select()
    .from(pathologies)
    .where(inArray(pathologies.abcdeCategory, filterCategories));

  // ── Step 4: Batch-load all symptoms for those pathologies ──────────
  const pathologyIds = filteredPathologies.map(p => p.pathologyId);
  const allSymptomRows: PathologySymptomRow[] = pathologyIds.length > 0
    ? await db
        .select()
        .from(pathologySymptoms)
        .where(inArray(pathologySymptoms.pathologyId, pathologyIds))
    : [];

  // Group symptoms by pathologyId in memory
  const symptomsByPathology = new Map<string, PathologySymptomRow[]>();
  for (const row of allSymptomRows) {
    let group = symptomsByPathology.get(row.pathologyId);
    if (!group) {
      group = [];
      symptomsByPathology.set(row.pathologyId, group);
    }
    group.push(row);
  }

  // ── Step 5: Calculate confidence for each pathology ────────────────
  const matches: PathologyMatchResult[] = [];

  for (const pathology of filteredPathologies) {
    const symRows = symptomsByPathology.get(pathology.pathologyId);
    if (!symRows || symRows.length === 0) continue;

    // Partition into static SYM_ codes and VS_ (vital sign) symptoms
    const symCodes: string[] = [];
    const vsSymptoms: PathologySymptom[] = [];
    for (const row of symRows) {
      if (row.isVitalSign) {
        vsSymptoms.push(toPathologySymptom(row));
      } else {
        symCodes.push(row.symptomCode);
      }
    }

    // a. Static match: observedCodes ∩ pathology's SYM_ codes
    const staticMatched = symCodes.filter(code => observedCodes.has(code));

    // b. Dynamic vital sign threshold evaluation
    const vitalMatched = evaluateVitalSignThresholds(vitals, vsSymptoms);

    // c. Union of all matched codes
    const allMatched = new Set([...staticMatched, ...vitalMatched]);
    if (allMatched.size === 0) continue;

    // d. Confidence = matchedCount / totalSymptoms (0–100%)
    const confidence = Math.round((allMatched.size / symRows.length) * 100);

    matches.push({
      pathologyId: pathology.pathologyId,
      pathologyName: pathology.nameFr,
      abcdeCategory: pathology.abcdeCategory as PathologyMatchResult['abcdeCategory'],
      confidence,
      matchedSymptomCodes: staticMatched,
      matchedVitalSigns: vitalMatched,
      totalSymptoms: symRows.length,
      triagePriority: pathology.triagePriority as TriagePriority,
      isSurgical: false, // updated after loading interventions
      nursingInterventions: [],
      medicalInterventions: [],
    });
  }

  // ── Step 6: Sort by confidence descending, take top 10 ────────────
  matches.sort((a, b) => b.confidence - a.confidence);
  const topMatches = matches.slice(0, 10);

  // ── Step 7: Load interventions for top 5 matches ──────────────────
  const top5Ids = topMatches.slice(0, 5).map(m => m.pathologyId);
  let suggestedNursing: NursingIntervention[] = [];
  let suggestedMedical: MedicalIntervention[] = [];

  if (top5Ids.length > 0) {
    const [nursingRows, medicalRows] = await Promise.all([
      db.select().from(nursingInterventionsTable)
        .where(inArray(nursingInterventionsTable.pathologyId, top5Ids)),
      db.select().from(medicalInterventionsTable)
        .where(inArray(medicalInterventionsTable.pathologyId, top5Ids)),
    ]);

    // Group nursing interventions by pathologyId
    const nursingByPath = new Map<string, NursingIntervention[]>();
    for (const row of nursingRows) {
      const ni: NursingIntervention = {
        id: row.id,
        pathologyId: row.pathologyId,
        interventionCode: row.interventionCode,
        descriptionFr: row.descriptionFr,
        descriptionEn: row.descriptionEn ?? undefined,
        priorityOrder: row.priorityOrder,
      };
      let group = nursingByPath.get(row.pathologyId);
      if (!group) { group = []; nursingByPath.set(row.pathologyId, group); }
      group.push(ni);
    }
    for (const group of nursingByPath.values()) {
      group.sort((a, b) => a.priorityOrder - b.priorityOrder);
    }

    // Group medical interventions by pathologyId
    const medicalByPath = new Map<string, MedicalIntervention[]>();
    for (const row of medicalRows) {
      const mi: MedicalIntervention = {
        id: row.id,
        pathologyId: row.pathologyId,
        interventionCode: row.interventionCode,
        descriptionFr: row.descriptionFr,
        descriptionEn: row.descriptionEn ?? undefined,
        isSurgical: row.isSurgical,
        priorityOrder: row.priorityOrder,
      };
      let group = medicalByPath.get(row.pathologyId);
      if (!group) { group = []; medicalByPath.set(row.pathologyId, group); }
      group.push(mi);
    }
    for (const group of medicalByPath.values()) {
      group.sort((a, b) => a.priorityOrder - b.priorityOrder);
    }

    // Attach to each top-5 match and aggregate for global suggestions
    const allNursing: NursingIntervention[] = [];
    const allMedical: MedicalIntervention[] = [];

    for (const match of topMatches.slice(0, 5)) {
      match.nursingInterventions = nursingByPath.get(match.pathologyId) ?? [];
      match.medicalInterventions = medicalByPath.get(match.pathologyId) ?? [];
      match.isSurgical = match.medicalInterventions.some(mi => mi.isSurgical);

      allNursing.push(...match.nursingInterventions);
      allMedical.push(...match.medicalInterventions);
    }

    // Deduplicate by interventionCode, preserving lowest priorityOrder
    allNursing.sort((a, b) => a.priorityOrder - b.priorityOrder);
    const seenNursing = new Set<string>();
    for (const ni of allNursing) {
      if (!seenNursing.has(ni.interventionCode)) {
        seenNursing.add(ni.interventionCode);
        suggestedNursing.push(ni);
      }
    }

    allMedical.sort((a, b) => a.priorityOrder - b.priorityOrder);
    const seenMedical = new Set<string>();
    for (const mi of allMedical) {
      if (!seenMedical.has(mi.interventionCode)) {
        seenMedical.add(mi.interventionCode);
        suggestedMedical.push(mi);
      }
    }
  }

  // ── Step 8: Orientation cascade ───────────────────────────────────
  let suggestedOrientation: TriagePriority = 'MEDICAL';
  let orientationSource: OrientationSourceType = 'MANUAL';
  let orientationReason = '';

  // P1: Score thresholds → SAUV
  if (effectiveScores.news !== undefined && effectiveScores.news >= 7) {
    suggestedOrientation = 'SAUV';
    orientationSource = 'SCORE_BASED';
    orientationReason = `Score NEWS ≥ 7 (${effectiveScores.news}) — Risque élevé de détérioration`;
  } else if (effectiveScores.gcs !== undefined && effectiveScores.gcs < 9) {
    suggestedOrientation = 'SAUV';
    orientationSource = 'SCORE_BASED';
    orientationReason = `Score GCS < 9 (${effectiveScores.gcs}) — Altération sévère de la conscience`;
  } else if (effectiveScores.qsofa !== undefined && effectiveScores.qsofa >= 2) {
    suggestedOrientation = 'SAUV';
    orientationSource = 'SCORE_BASED';
    orientationReason = `Score qSOFA ≥ 2 (${effectiveScores.qsofa}) — Risque de sepsis`;
  } else if (effectiveScores.esi !== undefined && effectiveScores.esi <= 2) {
    suggestedOrientation = 'SAUV';
    orientationSource = 'SCORE_BASED';
    orientationReason = `ESI niveau ${effectiveScores.esi} — Urgence vitale`;
  }

  // P2: Critical symptom codes → SAUV
  if (orientationSource === 'MANUAL' && criticalCodes.size > 0) {
    suggestedOrientation = 'SAUV';
    orientationSource = 'CRITICAL_SIGNS';
    const descs = resolveCodeDescriptions(criticalCodes, allSymptomRows);
    orientationReason = `Signes critiques détectés: ${descs.slice(0, 3).join(', ')}`;
  }

  // P3: Top match's triagePriority
  if (orientationSource === 'MANUAL' && topMatches.length > 0) {
    const top = topMatches[0];
    suggestedOrientation = top.triagePriority;
    orientationSource = 'PATHOLOGY_MATCH';
    orientationReason = `Pathologie probable: ${top.pathologyName} (${top.confidence}% match)`;
  }

  // P4: Default → MEDICAL / MANUAL (already set)

  // ── Step 9: Critical alerts ───────────────────────────────────────
  const criticalAlerts: string[] = [];
  if (criticalCodes.size > 0) {
    criticalAlerts.push(...resolveCodeDescriptions(criticalCodes, allSymptomRows));
  }
  if (effectiveScores.news !== undefined && effectiveScores.news >= 5) {
    criticalAlerts.push(`NEWS élevé: ${effectiveScores.news}`);
  }
  if (effectiveScores.gcs !== undefined && effectiveScores.gcs < 12) {
    criticalAlerts.push(`GCS altéré: ${effectiveScores.gcs}`);
  }
  if (effectiveScores.qsofa !== undefined && effectiveScores.qsofa >= 2) {
    criticalAlerts.push(`qSOFA positif: ${effectiveScores.qsofa}`);
  }

  // ── Step 10: Return ───────────────────────────────────────────────
  return {
    topMatches,
    suggestedNursingInterventions: suggestedNursing,
    suggestedMedicalInterventions: suggestedMedical,
    suggestedOrientation,
    orientationSource,
    orientationReason,
    criticalAlerts: [...new Set(criticalAlerts)],
    scores: effectiveScores,
    analysisTimestamp: new Date().toISOString(),
    observedSymptomCodes: Array.from(observedCodes),
    matchedPathologiesCount: topMatches.length,
  };
}

// ============================================================================
// Quick critical threshold check
// ============================================================================

/**
 * Quick check if any critical score thresholds are met.
 * Can be called without full analysis for immediate alerting.
 */
export function checkCriticalThresholds(
  scores: { news?: number; gcs?: number; qsofa?: number; esi?: number }
): { isCritical: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (scores.news !== undefined && scores.news >= 7) {
    reasons.push(`NEWS ≥ 7 (${scores.news})`);
  }
  if (scores.gcs !== undefined && scores.gcs < 9) {
    reasons.push(`GCS < 9 (${scores.gcs})`);
  }
  if (scores.qsofa !== undefined && scores.qsofa >= 2) {
    reasons.push(`qSOFA ≥ 2 (${scores.qsofa})`);
  }
  if (scores.esi !== undefined && scores.esi <= 2) {
    reasons.push(`ESI ≤ 2 (${scores.esi})`);
  }

  return { isCritical: reasons.length > 0, reasons };
}
