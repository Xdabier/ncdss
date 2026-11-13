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
  airwayStatus?: 'patent' | 'at_risk' | 'obstructed';  // Replaces patent+obstructed booleans for new patients
  painLocation?: ('thoracic' | 'abdominal' | 'cephalic' | 'neurologic' | 'orthopedic' | 'muscular' | 'limbs' | 'facial' | 'oral')[];
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
  breathSoundsMulti?: ('normal' | 'stridor' | 'wheezing' | 'crackles' | 'snoring' | 'gurgling' | 'decreased' | 'absent' | 'gasping')[];
  nasalFlaring?: boolean;      // Battement des ailes du nez
  apnea?: boolean;             // Pause respiratoire
  signesLutte?: string[];      // Raw "signes de lutte" array (tirage sous-costal, muscles accessoires, etc.)
  pauseRespiratoire?: boolean; // Pause respiratoire (alias for apnea, kept for direct storage)
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
  bleedingType?: ('internal' | 'epistaxis' | 'hemoptysis' | 'hematemesis' | 'gingival' | 'melena' | 'hematuria' | 'otorrhagia' | 'rhinorrhagia' | 'metrorrhagia' | 'ocular' | 'other')[];
  diaphoresis?: boolean;       // Sueurs profuses
  cardiacAuscultation?: 'normal' | 'murmur' | 'irregular';
  skinColorMulti?: ('normal' | 'pale' | 'cyanotic' | 'mottled' | 'flushed')[];
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
  pupilReactivity?: boolean;   // Reactive to light (true = reactive, false = non-reactive)
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
  diarrhea?: boolean;          // Diarrhée
  lastMeal?: string;           // Dernier repas (heure/contenu)
  findings: string[];          // Free text list of findings
  traumaType?: ('cranial' | 'maxillofacial' | 'thoracic' | 'pelvic' | 'limbs' | 'spinal')[];
  edemaType?: ('angioedema' | 'lower_limbs' | 'upper_limbs' | 'ascites')[];
  electrocution?: boolean;
  intoxication?: boolean;
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

// =============================================================================
// SYMPTOMS FORM DATA (Unified symptom collection for triage workflow)
// =============================================================================

export interface SymptomsFormData {
  airwayStatus?: 'libre' | 'a_risque' | 'obstrue';
  auscultationNormal?: boolean;
  breathSoundsDetail?: string[];
  signesLutte?: string[];
  pauseRespiratoire?: boolean;
  signesCutanes?: string[];
  capillaryRefill?: number;
  bleedingInterne?: boolean;
  bleedingExteriorisee?: boolean;
  bleedingTypes?: string[];
  painLocations?: string[];
  pupilSize?: 'dilate' | 'constricte';
  pupilSymmetry?: 'symetrique' | 'asymetrique';
  pupilReactivity?: boolean;
  traumaTypes?: string[];
  burns?: boolean;
  electrocution?: boolean;
  intoxication?: boolean;
  notes?: string;
}
