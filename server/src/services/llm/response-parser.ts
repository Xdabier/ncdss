import type { PreDiagnosisSuggestion, UnifiedAnalysisResult } from './index';

/**
 * Shared response parsing functions for LLM providers.
 * Handles JSON extraction, repair, thinking block extraction, and normalization.
 */

// ─── Pre-Diagnosis Response Parsing ───────────────────────────────────────────

export function parsePreDiagnosisResponse(
  response: string,
  generatedAt: string,
  thinkingFromApi?: string
): PreDiagnosisSuggestion {
  let thinkingTrace: string | undefined = thinkingFromApi;
  let cleanResponse = response;
  let thinkingEnabled = !!thinkingFromApi;

  // Check for inline <think> blocks
  const thinkMatch = response.match(/<think>([\s\S]*?)<\/think>/);
  if (thinkMatch) {
    thinkingTrace = thinkingTrace
      ? `${thinkingTrace}\n\n${thinkMatch[1].trim()}`
      : thinkMatch[1].trim();
    thinkingEnabled = true;
    cleanResponse = response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }

  try {
    const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      let jsonStr = jsonMatch[0];

      // Attempt repair if direct parse fails
      try {
        JSON.parse(jsonStr);
      } catch {
        jsonStr = repairTruncatedJson(jsonStr);
      }

      const parsed = JSON.parse(jsonStr);

      const suggestions = Array.isArray(parsed.suggestions)
        ? parsed.suggestions.map((s: Record<string, unknown>) => ({
            diagnosis: String(s.diagnosis || ''),
            confidence: typeof s.confidence === 'number' ? s.confidence : 50,
            reasoning: String(s.reasoning || ''),
            urgency: normalizeUrgency(s.urgency),
            icd10Code: s.icd10Code ? String(s.icd10Code) : undefined
          }))
        : [];

      return {
        available: true,
        suggestions,
        recommendedTests: Array.isArray(parsed.recommendedTests)
          ? parsed.recommendedTests.map(String)
          : [],
        warnings: Array.isArray(parsed.warnings)
          ? parsed.warnings.map(String)
          : [],
        generatedAt,
        thinkingTrace,
        thinkingEnabled
      };
    }
  } catch (e) {
    console.error('[ResponseParser] Failed to parse pre-diagnosis response:', e);
  }

  return {
    available: true,
    suggestions: [],
    warnings: ['Impossible d\'analyser la réponse du modèle'],
    generatedAt,
    thinkingTrace,
    thinkingEnabled
  };
}

// ─── Unified Analysis Response Parsing ────────────────────────────────────────

export function parseUnifiedAnalysisResponse(
  response: string,
  generatedAt: string,
  thinkingFromApi?: string,
  maxPathologies: number = 5
): UnifiedAnalysisResult {
  let thinkingTrace: string | undefined = thinkingFromApi;
  let cleanResponse = response;
  let thinkingEnabled = !!thinkingFromApi;

  // Check for inline <think> blocks
  const thinkMatch = response.match(/<think>([\s\S]*?)<\/think>/);
  if (thinkMatch) {
    thinkingTrace = thinkingTrace
      ? `${thinkingTrace}\n\n${thinkMatch[1].trim()}`
      : thinkMatch[1].trim();
    thinkingEnabled = true;
    cleanResponse = response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }

  try {
    const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      let jsonStr = jsonMatch[0];

      // Attempt repair if direct parse fails
      try {
        JSON.parse(jsonStr);
      } catch {
        console.warn('[ResponseParser] Unified response JSON truncated, attempting repair');
        jsonStr = repairTruncatedJson(jsonStr);
      }

      const parsed = JSON.parse(jsonStr);

      // Validate orientation
      const validOrientations = ['SAUV', 'MEDICAL', 'SURGICAL', 'TRAUMA', 'PEDIATRIC'] as const;
      const orientation = validOrientations.includes(parsed.orientation)
        ? parsed.orientation as typeof validOrientations[number]
        : 'MEDICAL' as const;

      // Validate pathologies is a non-empty array
      if (!Array.isArray(parsed.pathologies) || parsed.pathologies.length === 0) {
        console.warn('[ResponseParser] Unified analysis: pathologies array is empty or missing');
        return {
          available: false,
          generatedAt,
          thinkingTrace,
          thinkingEnabled
        };
      }

      // Normalize pathologies
      const pathologies = parsed.pathologies
        .slice(0, maxPathologies)
        .map((p: Record<string, unknown>) => {
          if (!p.name || !p.reasoning) {
            return null;
          }
          const confidence = typeof p.confidence === 'number'
            ? Math.max(0, Math.min(100, p.confidence))
            : 50;
          return {
            name: String(p.name),
            confidence,
            signs: Array.isArray(p.signs) ? p.signs.map(String) : [],
            reasoning: String(p.reasoning),
            urgency: normalizeUrgency(p.urgency),
            ...(p.icd10Code ? { icd10Code: String(p.icd10Code) } : {})
          };
        }).filter((p: unknown) => p !== null);

      if (pathologies.length === 0) {
        console.warn('[ResponseParser] Unified analysis: all pathologies failed validation');
        return {
          available: false,
          generatedAt,
          thinkingTrace,
          thinkingEnabled
        };
      }

      return {
        available: true,
        analysis: {
          orientation,
          orientationReason: String(parsed.orientationReason || ''),
          criticalAlerts: Array.isArray(parsed.criticalAlerts) ? parsed.criticalAlerts.map(String) : [],
          pathologies,
          nursingInterventions: Array.isArray(parsed.nursingInterventions) ? parsed.nursingInterventions.map(String) : [],
          medicalInterventions: Array.isArray(parsed.medicalInterventions) ? parsed.medicalInterventions.map(String) : [],
          recommendedTests: Array.isArray(parsed.recommendedTests) ? parsed.recommendedTests.map(String) : [],
          warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
          analysisTimestamp: generatedAt,
          locale: 'fr'
        },
        generatedAt,
        thinkingTrace,
        thinkingEnabled
      };
    }
  } catch (e) {
    console.error('[ResponseParser] Failed to parse unified response:', e);
  }

  return {
    available: false,
    generatedAt,
    thinkingTrace,
    thinkingEnabled
  };
}

// ─── Utility Functions ────────────────────────────────────────────────────────

export function normalizeUrgency(value: unknown): 'routine' | 'urgent' | 'emergent' {
  const normalized = String(value).toLowerCase();
  if (normalized === 'emergent' || normalized === 'émergent') return 'emergent';
  if (normalized === 'urgent') return 'urgent';
  return 'routine';
}

/**
 * Attempt to repair truncated JSON from token-limited LLM output.
 * Closes unclosed strings, arrays, and objects in correct nesting order.
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
