// Client-side score utilities for ESI suggestion

export interface ScoreData {
  newsScore?: number;
  gcsScore?: number;
  qsofaScore?: number;
  painLevel?: number;
}

// ESI (Emergency Severity Index) suggested level based on scores
export function suggestESI(scores: ScoreData): number {
  const { newsScore, gcsScore, qsofaScore, painLevel } = scores;

  // ESI 1: Immediate life-saving intervention required
  if (gcsScore !== undefined && gcsScore <= 8) return 1;
  if (newsScore !== undefined && newsScore >= 9) return 1;

  // ESI 2: High risk / confused / lethargy / severe pain
  if (gcsScore !== undefined && gcsScore <= 12) return 2;
  if (newsScore !== undefined && newsScore >= 7) return 2;
  if (painLevel !== undefined && painLevel >= 8) return 2;
  if (qsofaScore !== undefined && qsofaScore >= 2) return 2;

  // ESI 3: Likely needs multiple resources
  if (newsScore !== undefined && newsScore >= 5) return 3;
  if (painLevel !== undefined && painLevel >= 5) return 3;

  // ESI 4: Needs 1 resource (default)
  if (newsScore !== undefined && newsScore >= 2) return 4;

  // ESI 5: No resources needed
  return 5;
}

// Get score color class based on value and thresholds
export function getScoreColor(score: number, type: 'news' | 'gcs' | 'qsofa' | 'pain'): string {
  switch (type) {
    case 'news':
      if (score >= 7) return 'bg-red-100 border-red-500 text-red-900';
      if (score >= 5) return 'bg-yellow-100 border-yellow-500 text-yellow-900';
      return 'bg-green-100 border-green-500 text-green-900';

    case 'gcs':
      if (score < 9) return 'bg-red-100 border-red-500 text-red-900';
      if (score < 13) return 'bg-yellow-100 border-yellow-500 text-yellow-900';
      return 'bg-green-100 border-green-500 text-green-900';

    case 'qsofa':
      if (score >= 2) return 'bg-red-100 border-red-500 text-red-900';
      if (score >= 1) return 'bg-yellow-100 border-yellow-500 text-yellow-900';
      return 'bg-green-100 border-green-500 text-green-900';

    case 'pain':
      if (score >= 7) return 'bg-red-100 border-red-500 text-red-900';
      if (score >= 4) return 'bg-yellow-100 border-yellow-500 text-yellow-900';
      return 'bg-green-100 border-green-500 text-green-900';

    default:
      return 'bg-gray-100 border-gray-500 text-gray-900';
  }
}

// Get score label based on value and thresholds
export function getScoreLabel(score: number, type: 'news' | 'gcs' | 'qsofa' | 'pain'): string {
  switch (type) {
    case 'news':
      if (score >= 7) return 'Risque élevé';
      if (score >= 5) return 'Risque moyen';
      return 'Risque faible';

    case 'gcs':
      if (score < 9) return 'Sévère';
      if (score < 13) return 'Modéré';
      return 'Normal';

    case 'qsofa':
      if (score >= 2) return 'Risque sepsis';
      if (score >= 1) return 'Risque faible sepsis';
      return 'Faible risque sepsis';

    case 'pain':
      if (score >= 7) return 'Douleur sévère';
      if (score >= 4) return 'Douleur modérée';
      return 'Douleur faible';

    default:
      return '';
  }
}
