/**
 * Text normalization utilities for French medical text
 * Used for accent-insensitive matching of pathology names and clinical signs
 */

/**
 * Normalize French text for matching purposes
 * - Converts to lowercase
 * - Removes accents (é→e, è→e, ê→e, etc.)
 * - Handles French ligatures (œ→oe, æ→ae)
 * - Trims whitespace
 *
 * @example
 * normalizeText("Œdème post-intubation") → "oedeme post-intubation"
 * normalizeText("Épiglottite adulte") → "epiglottite adulte"
 * normalizeText("Brûlure chimique") → "brulure chimique"
 */
export function normalizeText(text: string): string {
  if (!text) return '';

  return text
    .toLowerCase()
    // Handle French ligatures BEFORE NFD decomposition
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/Æ/g, 'ae')
    // NFD decomposition separates base characters from combining diacritical marks
    .normalize('NFD')
    // Remove combining diacritical marks (accents)
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Check if two French texts match (accent-insensitive)
 */
export function textsMatch(text1: string, text2: string): boolean {
  return normalizeText(text1) === normalizeText(text2);
}

/**
 * Check if normalized text1 contains normalized text2
 */
export function normalizedContains(text1: string, text2: string): boolean {
  return normalizeText(text1).includes(normalizeText(text2));
}

/**
 * Calculate similarity score between two texts (0-100)
 * Uses normalized comparison with partial matching
 */
export function calculateTextSimilarity(text1: string, text2: string): number {
  const norm1 = normalizeText(text1);
  const norm2 = normalizeText(text2);

  if (norm1 === norm2) return 100;
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    const shorter = norm1.length < norm2.length ? norm1 : norm2;
    const longer = norm1.length >= norm2.length ? norm1 : norm2;
    return Math.round((shorter.length / longer.length) * 80);
  }

  // Word-based matching
  const words1 = norm1.split(/\s+/);
  const words2 = norm2.split(/\s+/);
  const commonWords = words1.filter(w => words2.includes(w));

  if (commonWords.length === 0) return 0;

  const maxWords = Math.max(words1.length, words2.length);
  return Math.round((commonWords.length / maxWords) * 60);
}

/**
 * Parse orientation string to extract primary and secondary orientations
 * Handles formats like "SAUV / Chirurgie", "Médical", "Traumatologie / Médical"
 */
export function parseOrientation(orientationStr: string): {
  primary: string;
  secondary: string | null;
  isSAUV: boolean;
} {
  if (!orientationStr) {
    return { primary: 'MEDICAL', secondary: null, isSAUV: false };
  }

  const normalized = orientationStr.trim();
  const parts = normalized.split('/').map(p => p.trim());

  // Map French terms to enum values
  const mapToEnum = (term: string): string => {
    const lower = term.toLowerCase();
    if (lower.includes('sauv')) return 'SAUV';
    if (lower.includes('chirurg')) return 'SURGICAL';
    if (lower.includes('traumat')) return 'TRAUMA';
    if (lower.includes('médic') || lower.includes('medic')) return 'MEDICAL';
    return 'MEDICAL'; // Default
  };

  const primary = mapToEnum(parts[0]);
  const secondary = parts.length > 1 ? mapToEnum(parts[1]) : null;
  const isSAUV = primary === 'SAUV' || normalized.toUpperCase().includes('SAUV');

  return { primary, secondary, isSAUV };
}

/**
 * Map category string from Excel to standardized orientation
 */
export function mapCategoryToOrientation(category: string): string {
  if (!category) return 'MEDICAL';

  const lower = category.toLowerCase();

  if (lower.includes('sauv')) return 'SAUV';
  if (lower.includes('chirurg') || lower.includes('gynéco')) return 'SURGICAL';
  if (lower.includes('traumat')) return 'TRAUMA';
  if (lower.includes('administratif')) return 'ADMINISTRATIVE';

  return 'MEDICAL';
}
