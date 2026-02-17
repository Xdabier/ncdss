// ============================================================================
// UNIFIED LLM CLINICAL ANALYSIS TYPES
// ============================================================================

export interface UnifiedPathology {
  name: string;
  confidence: number; // 0-100
  signs: string[];
  reasoning: string;
  urgency: 'routine' | 'urgent' | 'emergent';
  icd10Code?: string;
}

export interface UnifiedClinicalAnalysis {
  orientation: 'SAUV' | 'MEDICAL' | 'SURGICAL' | 'TRAUMA' | 'PEDIATRIC';
  orientationReason: string;
  criticalAlerts: string[];
  pathologies: UnifiedPathology[];
  nursingInterventions: string[];
  medicalInterventions: string[];
  recommendedTests: string[];
  warnings: string[];
  analysisTimestamp: string;
  modelVersion?: string;
  locale: 'fr' | 'en';
}

export type UnifiedAnalysisStatus = 'pending' | 'generating' | 'completed' | 'failed';

export interface GetUnifiedAnalysisResponse {
  exists: boolean;
  status: UnifiedAnalysisStatus | null;
  result: UnifiedClinicalAnalysis | null;
  errorMessage: string | null;
  generatedAt: string | null;
  triggerSource: string | null;
}
