/**
 * ABCDE Assessment Types
 * Used for clinical observations, pathology matching, and decision support
 */

// =============================================================================
// OBSERVATION INTERFACES (Input from nurse during triage)
// =============================================================================

export interface AirwayObservations {
  patent: boolean;             // Voies aériennes libres
  obstructed: boolean;         // Obstruction
  secretions: boolean;         // Sécrétions
  stridor: boolean;            // Stridor
  painLevel?: number;          // EVA 0-10
  notes?: string;
}

export interface BreathingObservations {
  respiratoryRate?: number;    // FR breaths/min
  oxygenSaturation?: number;   // SpO2 %
  breathSounds: 'normal' | 'decreased' | 'wheezing' | 'crackles' | 'absent';
  workOfBreathing: 'normal' | 'increased' | 'severe';
  cyanosis: boolean;
  accessoryMuscles: boolean;   // Utilisation muscles accessoires
  notes?: string;
}

export interface CirculationObservations {
  heartRate?: number;          // FC bpm
  bloodPressure?: string;      // "120/80" format
  systolicBP?: number;         // Parsed from bloodPressure
  diastolicBP?: number;        // Parsed from bloodPressure
  capillaryRefill?: number;    // TRC seconds
  skinColor: 'normal' | 'pale' | 'cyanotic' | 'mottled' | 'flushed';
  peripheralPulses: 'strong' | 'weak' | 'absent';
  bleeding: boolean;
  coldExtremities: boolean;    // Extrémités froides
  notes?: string;
}

export interface DisabilityObservations {
  gcsEye?: number;             // 1-4
  gcsVerbal?: number;          // 1-5
  gcsMotor?: number;           // 1-6
  gcsTotal?: number;           // Calculated 3-15
  pupils: 'PEARL' | 'unequal' | 'dilated' | 'constricted' | 'fixed';
  motorResponse: 'normal' | 'weakness' | 'paralysis' | 'lateralized';
  glucoseLevel?: number;       // mg/dL
  seizures: boolean;
  confusion: boolean;
  notes?: string;
}

export interface ExposureObservations {
  temperature?: number;        // °C
  rash: boolean;
  wounds: boolean;
  edema: boolean;
  burns: boolean;
  traumaSigns: boolean;
  hypothermia: boolean;        // Temp < 35°C
  hyperthermia: boolean;       // Temp > 39°C
  findings: string[];          // Free text list of findings
  notes?: string;
}

// Complete ABCDE assessment data
export interface ABCDEObservations {
  airway: AirwayObservations;
  breathing: BreathingObservations;
  circulation: CirculationObservations;
  disability: DisabilityObservations;
  exposure: ExposureObservations;
}

// =============================================================================
// EXTRACTED SIGNS (Processed from observations for matching)
// =============================================================================

export interface ExtractedSigns {
  category: 'A' | 'B' | 'C' | 'D' | 'E';
  signs: string[];             // French text for display
  normalizedSigns: string[];   // Normalized for matching
  criticalSigns: string[];     // Life-threatening findings
}

// =============================================================================
// CLINICAL PATHOLOGY (Reference data from database)
// =============================================================================

export interface ClinicalPathology {
  id: number;
  pathologyName: string;
  pathologyNameNormalized: string;
  abcdeCategory: string;       // A, B, C, D, E, or GENERAL
  severitySigns: string[];
  nursingInterventions: string[];
  medicalInterventions: string[];
  dosageFormulas?: string;
  orientation?: string;        // Raw: "SAUV / Médical"
  primaryOrientation: string;  // Mapped: SAUV, MEDICAL, SURGICAL, TRAUMA
  secondaryOrientation?: string;
  isSAUV: boolean;
}

// =============================================================================
// PATHOLOGY MATCH RESULT (Output from matching algorithm)
// =============================================================================

export interface PathologyMatch {
  pathologyId: number;
  pathologyName: string;
  abcdeCategory: string;
  matchScore: number;          // 0-100
  matchedSigns: string[];      // Signs that matched this pathology
  totalSigns: number;          // Total severity signs for this pathology
  nursingInterventions: string[];
  medicalInterventions: string[];
  dosageFormulas?: string;
  orientation?: string;
  primaryOrientation: string;
  isSAUV: boolean;
}

// =============================================================================
// ANALYSIS RESULT (Complete output from clinical decision support)
// =============================================================================

export type OrientationSourceType =
  | 'SCORE_BASED'           // NEWS/GCS/qSOFA critical thresholds
  | 'PATHOLOGY_MATCH'       // Top matched pathology
  | 'CHIEF_COMPLAINT'       // From presenting complaint category
  | 'MANUAL';               // Nurse override

export interface AnalysisResult {
  // Matched pathologies ranked by score
  topMatches: PathologyMatch[];

  // Aggregated suggested interventions
  suggestedNursingInterventions: string[];
  suggestedMedicalInterventions: string[];

  // Orientation suggestion
  suggestedOrientation: string;
  orientationSource: OrientationSourceType;
  orientationReason: string;

  // Critical alerts requiring immediate attention
  criticalAlerts: string[];

  // Clinical scores at time of analysis
  scores: {
    news?: number;
    gcs?: number;
    qsofa?: number;
    esi?: number;
  };

  // Metadata
  analysisTimestamp: string;
  extractedSignsCount: number;
  matchedPathologiesCount: number;
}

// =============================================================================
// PRESENTING COMPLAINT (Chief complaint / Motif de consultation)
// =============================================================================

export interface PresentingComplaint {
  id: number;
  name: string;
  nameNormalized: string;
  category: string;            // Original: "Médical / SAUV"
  primaryOrientation: string;  // Mapped: SAUV, MEDICAL, etc.
  secondaryOrientation?: string;
  isMultiCategory: boolean;
}

// =============================================================================
// API REQUEST/RESPONSE TYPES
// =============================================================================

export interface AnalyzeFindingsRequest {
  patientId: string;
  // Optional: force re-analysis even if already analyzed
  forceReanalyze?: boolean;
}

export interface AnalyzeFindingsResponse extends AnalysisResult {
  patientId: string;
  patientName: string;
  chiefComplaint?: string;
}

export interface SaveSelectedInterventionsRequest {
  patientId: string;
  nursingInterventions: string[];
  medicalInterventions: string[];
  selectedPathologyIds: number[];
}
