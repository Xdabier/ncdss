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
  drooling?: boolean;          // Hypersalivation
  dysphagia?: boolean;         // Difficulté à avaler
  painLevel?: number;          // EVA 0-10
  airwayStatus?: 'patent' | 'at_risk' | 'obstructed';  // P2.1 — replaces patent+obstructed booleans for new patients
  painLocation?: ('thoracic' | 'abdominal' | 'cephalic' | 'neurologic' | 'orthopedic' | 'muscular' | 'limbs' | 'facial' | 'oral')[];  // P1.2
  notes?: string;
}

export interface BreathingObservations {
  respiratoryRate?: number;    // FR breaths/min
  oxygenSaturation?: number;   // SpO2 %
  breathSounds: 'normal' | 'decreased' | 'wheezing' | 'crackles' | 'absent';
  workOfBreathing: 'normal' | 'increased' | 'severe';
  cyanosis: boolean;
  accessoryMuscles: boolean;   // Utilisation muscles accessoires
  hemoptysis?: boolean;        // Hémoptysie (crachats de sang)
  breathSoundsMulti?: ('normal' | 'stridor' | 'wheezing' | 'crackles' | 'snoring' | 'gurgling' | 'decreased' | 'absent' | 'gasping')[];  // P1.4 + P3.1
  nasalFlaring?: boolean;      // P2.4 — Battement des ailes du nez
  apnea?: boolean;             // P3.3 — Pause respiratoire
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
  jvd?: boolean;               // Distension jugulaire
  oliguria?: boolean;          // Oligurie (faible débit urinaire)
  bleedingType?: ('internal' | 'epistaxis' | 'hemoptysis' | 'hematemesis' | 'gingival' | 'melena' | 'hematuria' | 'otorrhagia' | 'rhinorrhagia' | 'metrorrhagia' | 'ocular' | 'other')[];  // P1.1
  diaphoresis?: boolean;       // P1.5 — Sueurs profuses
  cardiacAuscultation?: 'normal' | 'murmur' | 'irregular';  // P3.2
  skinColorMulti?: ('normal' | 'pale' | 'cyanotic' | 'mottled' | 'flushed')[];  // P3.5
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
  headache?: boolean;          // Céphalée sévère soudaine
  pupilReactivity?: boolean;   // P2.2 — Reactive to light (true = reactive, false = non-reactive)
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
  vomiting?: boolean;          // Vomissements
  findings: string[];          // Free text list of findings
  traumaType?: ('cranial' | 'maxillofacial' | 'thoracic' | 'pelvic' | 'limbs' | 'spinal')[];  // P1.3
  edemaType?: ('angioedema' | 'lower_limbs' | 'upper_limbs' | 'ascites')[];  // P2.3
  electrocution?: boolean;     // P1.6
  intoxication?: boolean;      // P1.6
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
// API REQUEST/RESPONSE TYPES
// =============================================================================

import type { ClinicalAnalysisResult } from './clinical';

export interface AnalyzeFindingsRequest {
  patientId: string;
  // Optional: force re-analysis even if already analyzed
  forceReanalyze?: boolean;
}

export interface AnalyzeFindingsResponse extends ClinicalAnalysisResult {
  patientId: string;
  patientName: string;
  chiefComplaint?: string;
}

export interface SaveSelectedInterventionsRequest {
  patientId: string;
  nursingInterventions: string[];
  medicalInterventions: string[];
  selectedPathologyIds: string[];
}
