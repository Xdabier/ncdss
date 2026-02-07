/**
 * Clinical Data Types — Language-Agnostic Pathology Matching
 *
 * These types support the code-based pathology matching system that replaces
 * the legacy free-text French sign matching approach.
 */

// =============================================================================
// FOUNDATION TYPES
// =============================================================================

export type ABCDECategory = 'A' | 'B' | 'C' | 'D' | 'E';

export type TriagePriority = 'SAUV' | 'SURGICAL' | 'TRAUMA' | 'MEDICAL' | 'PEDIATRIC';

export type VitalSignOperator = '>' | '<' | '>=' | '<=';

export type VitalSignUnit =
  | 'mmHg'
  | 'bpm'
  | '°C'
  | '%'
  | 'score'
  | 's'
  | 'mmol/L'
  | 'mg/dL'
  | 'mOsm/kg'
  | 'ms'
  | 'pH'
  | 'ratio'
  | 'L/min/m2';

export type OrientationSourceType =
  | 'SCORE_BASED'
  | 'CRITICAL_SIGNS'
  | 'PATHOLOGY_MATCH'
  | 'MANUAL';

// =============================================================================
// TRIAGE PRIORITY METADATA
// =============================================================================

export interface TriagePriorityMeta {
  nameFr: string;
  nameEn: string;
  color: 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'BLUE';
  maxWaitMinutes: number;
}

export const TRIAGE_PRIORITY_META: Record<TriagePriority, TriagePriorityMeta> = {
  SAUV: {
    nameFr: "Salle d'Accueil des Urgences Vitales",
    nameEn: 'Resuscitation Room',
    color: 'RED',
    maxWaitMinutes: 0,
  },
  SURGICAL: {
    nameFr: 'Urgence chirurgicale',
    nameEn: 'Surgical Emergency',
    color: 'ORANGE',
    maxWaitMinutes: 15,
  },
  TRAUMA: {
    nameFr: 'Salle de dechoquage trauma',
    nameEn: 'Trauma Resuscitation Room',
    color: 'ORANGE',
    maxWaitMinutes: 0,
  },
  MEDICAL: {
    nameFr: 'Urgence medicale',
    nameEn: 'Medical Emergency',
    color: 'YELLOW',
    maxWaitMinutes: 30,
  },
  PEDIATRIC: {
    nameFr: 'Urgence pediatrique',
    nameEn: 'Pediatric Emergency',
    color: 'BLUE',
    maxWaitMinutes: 15,
  },
};

// =============================================================================
// REFERENCE DATA INTERFACES (from database)
// =============================================================================

export interface Pathology {
  pathologyId: string;
  icd10Code: string;
  abcdeCategory: ABCDECategory;
  nameFr: string;
  nameEn: string;
  triagePriority: TriagePriority;
  departmentCodes: string[];
}

export interface PathologySymptom {
  id?: number;
  pathologyId: string;
  symptomCode: string;
  descriptionFr: string;
  descriptionEn?: string;
  isVitalSign: boolean;
  vitalOperator?: VitalSignOperator;
  vitalValue?: number;
  vitalUnit?: VitalSignUnit;
}

export interface NursingIntervention {
  id?: number;
  pathologyId: string;
  interventionCode: string;
  descriptionFr: string;
  descriptionEn?: string;
  priorityOrder: number;
}

export interface MedicalIntervention {
  id?: number;
  pathologyId: string;
  interventionCode: string;
  descriptionFr: string;
  descriptionEn?: string;
  isSurgical: boolean;
  priorityOrder: number;
}

// =============================================================================
// MATCHING RESULT INTERFACES
// =============================================================================

export interface PathologyMatchResult {
  pathologyId: string;
  pathologyName: string;
  abcdeCategory: ABCDECategory;
  confidence: number;
  matchedSymptomCodes: string[];
  matchedVitalSigns: string[];
  totalSymptoms: number;
  triagePriority: TriagePriority;
  isSurgical: boolean;
  nursingInterventions: NursingIntervention[];
  medicalInterventions: MedicalIntervention[];
}

export interface ClinicalAnalysisResult {
  topMatches: PathologyMatchResult[];
  suggestedNursingInterventions: NursingIntervention[];
  suggestedMedicalInterventions: MedicalIntervention[];
  suggestedOrientation: TriagePriority;
  orientationSource: OrientationSourceType;
  orientationReason: string;
  criticalAlerts: string[];
  scores: {
    news?: number;
    gcs?: number;
    qsofa?: number;
    esi?: number;
  };
  analysisTimestamp: string;
  observedSymptomCodes: string[];
  matchedPathologiesCount: number;
}
