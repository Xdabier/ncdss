/**
 * Pathology Matcher Service
 * Matches extracted clinical signs to pathologies in the database
 * Provides clinical decision support for orientation and interventions
 */

import { eq, like } from 'drizzle-orm';
import { getDb } from '../database';
import { clinicalPathologies, presentingComplaints } from '../database/schema';
import { normalizeText, normalizedContains } from '../utils/textNormalization';
import { getAllSignsFlat, getAllCriticalSigns } from './signExtractor';
import type {
  ExtractedSigns,
  PathologyMatch,
  AnalysisResult,
  OrientationSourceType
} from '@ncdss/shared';

// Helper to parse JSON arrays from database
function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Calculate match score between observed signs and pathology severity signs
 */
function calculateMatchScore(
  observedNormalizedSigns: Set<string>,
  pathologySeveritySigns: string[]
): { score: number; matchedSigns: string[] } {
  if (pathologySeveritySigns.length === 0) {
    return { score: 0, matchedSigns: [] };
  }

  const matchedSigns: string[] = [];

  for (const severitySign of pathologySeveritySigns) {
    const normalizedSeveritySign = normalizeText(severitySign);

    // Check if any observed sign matches this severity sign
    for (const observedSign of observedNormalizedSigns) {
      // Use substring matching in both directions
      if (
        normalizedSeveritySign.includes(observedSign) ||
        observedSign.includes(normalizedSeveritySign)
      ) {
        matchedSigns.push(severitySign); // Store original (French) for display
        break;
      }

      // Also check for word-level matching
      const severityWords = normalizedSeveritySign.split(/\s+/);
      const observedWords = observedSign.split(/\s+/);
      const commonWords = severityWords.filter(w => observedWords.includes(w));

      if (commonWords.length >= 2 || (commonWords.length === 1 && commonWords[0].length > 4)) {
        matchedSigns.push(severitySign);
        break;
      }
    }
  }

  // Calculate score as percentage of matched signs
  const score = Math.round((matchedSigns.length / pathologySeveritySigns.length) * 100);

  return { score, matchedSigns };
}

/**
 * Main function: Match observed findings to pathologies
 */
export async function matchFindingsToPathologies(
  extractedSigns: ExtractedSigns[],
  chiefComplaint?: string,
  chiefComplaintId?: number,
  scores?: { news?: number; gcs?: number; qsofa?: number; esi?: number }
): Promise<AnalysisResult> {
  const db = getDb();

  // 1. Get all observed signs as a flat set for matching
  const { signs, normalizedSigns } = getAllSignsFlat(extractedSigns);
  const observedSignsSet = new Set(normalizedSigns);
  const criticalSigns = getAllCriticalSigns(extractedSigns);

  // 2. Load all clinical pathologies from database
  const allPathologies = await db.select().from(clinicalPathologies);

  // 3. Score each pathology against observed signs
  const matches: PathologyMatch[] = [];

  for (const pathology of allPathologies) {
    const severitySigns = parseJsonArray(pathology.severitySigns);

    // Calculate match score
    const { score, matchedSigns } = calculateMatchScore(observedSignsSet, severitySigns);

    // Only include if there's at least one matching sign
    if (score > 0 || matchedSigns.length > 0) {
      // Boost score if chief complaint matches pathology name
      let finalScore = score;
      if (chiefComplaint) {
        const normalizedChiefComplaint = normalizeText(chiefComplaint);
        if (normalizedContains(pathology.pathologyNameNormalized || '', normalizedChiefComplaint)) {
          finalScore = Math.min(100, finalScore + 25);
        }
      }

      matches.push({
        pathologyId: pathology.id,
        pathologyName: pathology.pathologyName,
        abcdeCategory: pathology.abcdeCategory,
        matchScore: finalScore,
        matchedSigns,
        totalSigns: severitySigns.length,
        nursingInterventions: parseJsonArray(pathology.nursingInterventions),
        medicalInterventions: parseJsonArray(pathology.medicalInterventions),
        dosageFormulas: pathology.dosageFormulas || undefined,
        orientation: pathology.orientation || undefined,
        primaryOrientation: pathology.primaryOrientation || 'MEDICAL',
        isSAUV: pathology.isSAUV || false
      });
    }
  }

  // 4. Sort by match score (descending)
  matches.sort((a, b) => b.matchScore - a.matchScore);

  // 5. Take top matches (limit to 10)
  const topMatches = matches.slice(0, 10);

  // 6. Aggregate suggested interventions from top matches
  const nursingInterventionsSet = new Set<string>();
  const medicalInterventionsSet = new Set<string>();

  for (const match of topMatches.slice(0, 5)) { // Use top 5 for interventions
    match.nursingInterventions.forEach(i => nursingInterventionsSet.add(i));
    match.medicalInterventions.forEach(i => medicalInterventionsSet.add(i));
  }

  // 7. Determine orientation
  let suggestedOrientation = 'MEDICAL';
  let orientationSource: OrientationSourceType = 'MANUAL';
  let orientationReason = '';

  // Priority 1: Critical score thresholds → SAUV
  if (scores?.news !== undefined && scores.news >= 7) {
    suggestedOrientation = 'SAUV';
    orientationSource = 'SCORE_BASED';
    orientationReason = `Score NEWS ≥ 7 (${scores.news}) - Risque élevé de détérioration`;
  } else if (scores?.gcs !== undefined && scores.gcs < 9) {
    suggestedOrientation = 'SAUV';
    orientationSource = 'SCORE_BASED';
    orientationReason = `Score GCS < 9 (${scores.gcs}) - Altération sévère de la conscience`;
  } else if (scores?.qsofa !== undefined && scores.qsofa >= 2) {
    suggestedOrientation = 'SAUV';
    orientationSource = 'SCORE_BASED';
    orientationReason = `Score qSOFA ≥ 2 (${scores.qsofa}) - Risque de sepsis`;
  } else if (scores?.esi !== undefined && scores.esi <= 2) {
    suggestedOrientation = 'SAUV';
    orientationSource = 'SCORE_BASED';
    orientationReason = `ESI niveau ${scores.esi} - Urgence vitale`;
  }

  // Priority 2: Critical signs detected → SAUV
  if (orientationSource === 'MANUAL' && criticalSigns.length > 0) {
    suggestedOrientation = 'SAUV';
    orientationSource = 'SCORE_BASED';
    orientationReason = `Signes critiques détectés: ${criticalSigns.slice(0, 3).join(', ')}`;
  }

  // Priority 3: Top pathology match with SAUV flag
  if (orientationSource === 'MANUAL' && topMatches.length > 0) {
    const topMatch = topMatches[0];
    if (topMatch.isSAUV) {
      suggestedOrientation = 'SAUV';
      orientationSource = 'PATHOLOGY_MATCH';
      orientationReason = `Pathologie probable: ${topMatch.pathologyName} (${topMatch.matchScore}% match)`;
    } else if (topMatch.primaryOrientation) {
      suggestedOrientation = topMatch.primaryOrientation;
      orientationSource = 'PATHOLOGY_MATCH';
      orientationReason = `Pathologie probable: ${topMatch.pathologyName} (${topMatch.matchScore}% match)`;
    }
  }

  // Priority 4: Chief complaint category
  if (orientationSource === 'MANUAL' && chiefComplaintId) {
    const [complaint] = await db
      .select()
      .from(presentingComplaints)
      .where(eq(presentingComplaints.id, chiefComplaintId));

    if (complaint) {
      suggestedOrientation = complaint.primaryOrientation;
      orientationSource = 'CHIEF_COMPLAINT';
      orientationReason = `Motif de consultation: ${complaint.name} (${complaint.category})`;
    }
  }

  // Priority 5: Chief complaint text lookup
  if (orientationSource === 'MANUAL' && chiefComplaint) {
    const normalizedComplaint = normalizeText(chiefComplaint);
    const [matchingComplaint] = await db
      .select()
      .from(presentingComplaints)
      .where(like(presentingComplaints.nameNormalized, `%${normalizedComplaint}%`))
      .limit(1);

    if (matchingComplaint) {
      suggestedOrientation = matchingComplaint.primaryOrientation;
      orientationSource = 'CHIEF_COMPLAINT';
      orientationReason = `Motif de consultation: ${matchingComplaint.name} (${matchingComplaint.category})`;
    }
  }

  // 8. Build critical alerts
  const criticalAlerts: string[] = [...criticalSigns];

  // Add score-based alerts
  if (scores?.news !== undefined && scores.news >= 5) {
    criticalAlerts.push(`NEWS élevé: ${scores.news}`);
  }
  if (scores?.gcs !== undefined && scores.gcs < 12) {
    criticalAlerts.push(`GCS altéré: ${scores.gcs}`);
  }
  if (scores?.qsofa !== undefined && scores.qsofa >= 2) {
    criticalAlerts.push(`qSOFA positif: ${scores.qsofa}`);
  }

  // Add SAUV pathology alerts
  const sauvMatches = topMatches.filter(m => m.isSAUV && m.matchScore >= 50);
  for (const match of sauvMatches.slice(0, 2)) {
    criticalAlerts.push(`Pathologie SAUV probable: ${match.pathologyName}`);
  }

  // 9. Return analysis result
  return {
    topMatches,
    suggestedNursingInterventions: Array.from(nursingInterventionsSet),
    suggestedMedicalInterventions: Array.from(medicalInterventionsSet),
    suggestedOrientation,
    orientationSource,
    orientationReason,
    criticalAlerts: [...new Set(criticalAlerts)], // Remove duplicates
    scores: scores || {},
    analysisTimestamp: new Date().toISOString(),
    extractedSignsCount: signs.length,
    matchedPathologiesCount: topMatches.length
  };
}

/**
 * Quick check if any critical thresholds are met
 * Can be called without full analysis for immediate alerting
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

  return {
    isCritical: reasons.length > 0,
    reasons
  };
}
