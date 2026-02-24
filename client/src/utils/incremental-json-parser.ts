/**
 * Incremental JSON parser for streaming LLM clinical analysis.
 *
 * The LLM generates JSON fields sequentially. We detect completed fields
 * by scanning for known key patterns, then repair/parse the truncated JSON
 * to extract values progressively.
 */

/** The 8 renderable field names in UnifiedClinicalAnalysis */
export type AnalysisFieldKey =
  | 'criticalAlerts'
  | 'orientation'
  | 'orientationReason'
  | 'pathologies'
  | 'nursingInterventions'
  | 'medicalInterventions'
  | 'recommendedTests'
  | 'warnings';

export type FieldStatus = 'not_started' | 'active' | 'complete';

export interface IncrementalParseResult {
  /** Partially parsed analysis object (may have missing/incomplete fields) */
  partial: Record<string, unknown> | null;
  /** Status of each known field */
  fieldStatuses: Record<AnalysisFieldKey, FieldStatus>;
  /** Whether JSON generation has started (first '{' seen) */
  started: boolean;
  /** Length of accumulated raw JSON */
  rawLength: number;
}

const KNOWN_FIELDS: AnalysisFieldKey[] = [
  'criticalAlerts',
  'orientation',
  'orientationReason',
  'pathologies',
  'nursingInterventions',
  'medicalInterventions',
  'recommendedTests',
  'warnings',
];

/**
 * Repair truncated JSON by closing unclosed strings, arrays, and objects.
 * Ported from server/src/services/llm/providers/llamacpp.ts
 */
export function repairTruncatedJson(json: string): string {
  let repaired = json.trim();

  // Fast path: already valid
  try { JSON.parse(repaired); return repaired; } catch { /* needs repair */ }

  // Track nesting structure
  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (const char of repaired) {
    if (escape) { escape = false; continue; }
    if (char === '\\') { escape = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === '{') stack.push('}');
    else if (char === '[') stack.push(']');
    else if ((char === '}' || char === ']') && stack.length > 0) stack.pop();
  }

  // Close unclosed string literal
  if (inString) repaired += '"';

  // Remove trailing comma or incomplete key-value pair before closing
  repaired = repaired.replace(/,\s*$/, '');
  repaired = repaired.replace(/,?\s*"[^"]*"\s*:?\s*$/, '');
  repaired = repaired.replace(/,\s*$/, '');

  // Close all unclosed structures in reverse nesting order
  while (stack.length > 0) {
    repaired += stack.pop();
  }

  return repaired;
}

/**
 * Detect the status of each known field by scanning for `"fieldName":` patterns.
 * Fields whose key appears and is followed by another key are 'complete'.
 * The last detected key is 'active'. Missing keys are 'not_started'.
 */
export function detectFieldStatuses(rawJson: string): Record<AnalysisFieldKey, FieldStatus> {
  const statuses: Record<AnalysisFieldKey, FieldStatus> = {} as Record<AnalysisFieldKey, FieldStatus>;
  for (const f of KNOWN_FIELDS) {
    statuses[f] = 'not_started';
  }

  // Find positions of each field key in the raw JSON
  const found: { key: AnalysisFieldKey; pos: number }[] = [];
  for (const key of KNOWN_FIELDS) {
    const pattern = `"${key}"`;
    const pos = rawJson.indexOf(pattern);
    if (pos !== -1) {
      found.push({ key, pos });
    }
  }

  if (found.length === 0) return statuses;

  // Sort by position in the JSON string
  found.sort((a, b) => a.pos - b.pos);

  // All but last are complete; last is active
  for (let i = 0; i < found.length - 1; i++) {
    statuses[found[i].key] = 'complete';
  }
  statuses[found[found.length - 1].key] = 'active';

  // If the raw string ends with '}' (possibly with whitespace), the last field is also complete
  if (/\}\s*$/.test(rawJson)) {
    statuses[found[found.length - 1].key] = 'complete';
  }

  return statuses;
}

/**
 * Orchestrate incremental parsing: detect field statuses, repair JSON, attempt parse.
 */
export function parseIncremental(rawJson: string): IncrementalParseResult {
  const started = rawJson.includes('{');

  if (!started) {
    const statuses: Record<AnalysisFieldKey, FieldStatus> = {} as Record<AnalysisFieldKey, FieldStatus>;
    for (const f of KNOWN_FIELDS) statuses[f] = 'not_started';
    return { partial: null, fieldStatuses: statuses, started: false, rawLength: rawJson.length };
  }

  const fieldStatuses = detectFieldStatuses(rawJson);

  let partial: Record<string, unknown> | null = null;
  try {
    const repaired = repairTruncatedJson(rawJson);
    const parsed = JSON.parse(repaired);
    if (typeof parsed === 'object' && parsed !== null) {
      // Normalize array fields with ?? []
      partial = {
        ...parsed,
        criticalAlerts: parsed.criticalAlerts ?? [],
        pathologies: parsed.pathologies ?? [],
        nursingInterventions: parsed.nursingInterventions ?? [],
        medicalInterventions: parsed.medicalInterventions ?? [],
        recommendedTests: parsed.recommendedTests ?? [],
        warnings: parsed.warnings ?? [],
      };
    }
  } catch {
    // Parse failed — fieldStatuses are still useful from key detection
  }

  return { partial, fieldStatuses, started, rawLength: rawJson.length };
}
