/**
 * Symptom Mapper Service
 * Converts ABCDE observation data into symptom codes for language-agnostic pathology matching.
 *
 * Two mechanisms:
 * 1. Static mapping: form checkboxes/dropdowns → known SYM_ codes
 * 2. Dynamic threshold evaluation: patient vitals → VS_ codes from pathology_symptoms rows
 */

import type {
  AirwayObservations,
  BreathingObservations,
  CirculationObservations,
  DisabilityObservations,
  ExposureObservations,
} from '@ncdss/shared';
import type { PathologySymptom, VitalSignOperator } from '@ncdss/shared';

// =============================================================================
// MECHANISM 1: Static observation-to-code mapping
// =============================================================================

interface CodeMapping {
  code: string;
  critical: boolean;
}

function addCodes(
  observedCodes: Set<string>,
  criticalCodes: Set<string>,
  mappings: CodeMapping[]
): void {
  for (const m of mappings) {
    observedCodes.add(m.code);
    if (m.critical) {
      criticalCodes.add(m.code);
    }
  }
}

function mapAirway(
  data: Partial<AirwayObservations>,
  observedCodes: Set<string>,
  criticalCodes: Set<string>
): void {
  if (data.patent === false) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_AIRWAY_COMPROMISED', critical: true }]);
  }
  if (data.obstructed) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_AIRWAY_OBSTRUCTION', critical: true }]);
  }
  if (data.secretions) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_SECRETIONS', critical: false }]);
  }
  if (data.stridor) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_STRIDOR', critical: true }]);
  }
  if (data.drooling) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_DROOLING', critical: false }]);
  }
  if (data.dysphagia) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_DYSPHAGIA', critical: false }]);
  }
}

function mapBreathing(
  data: Partial<BreathingObservations>,
  observedCodes: Set<string>,
  criticalCodes: Set<string>
): void {
  if (data.breathSounds === 'wheezing') {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_WHEEZING', critical: false }]);
  } else if (data.breathSounds === 'crackles') {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_CRACKLES', critical: false }]);
  } else if (data.breathSounds === 'decreased') {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_BREATH_SOUNDS_DECREASED', critical: false }]);
  } else if (data.breathSounds === 'absent') {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_BREATH_SOUNDS_ABSENT', critical: true }]);
  }

  if (data.workOfBreathing === 'increased') {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_INCREASED_WOB', critical: false }]);
  } else if (data.workOfBreathing === 'severe') {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_RESPIRATORY_DISTRESS', critical: true }]);
  }

  if (data.cyanosis) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_CYANOSIS', critical: true }]);
  }
  if (data.accessoryMuscles) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_ACCESSORY_MUSCLES', critical: false }]);
  }
  if (data.hemoptysis) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_HEMOPTYSIS', critical: false }]);
  }
}

function mapCirculation(
  data: Partial<CirculationObservations>,
  observedCodes: Set<string>,
  criticalCodes: Set<string>
): void {
  if (data.skinColor === 'pale') {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_PALLOR', critical: false }]);
  } else if (data.skinColor === 'cyanotic') {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_PERIPHERAL_CYANOSIS', critical: true }]);
  } else if (data.skinColor === 'mottled') {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_MOTTLING', critical: true }]);
  }

  if (data.peripheralPulses === 'weak') {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_WEAK_PULSES', critical: false }]);
  } else if (data.peripheralPulses === 'absent') {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_ABSENT_PULSES', critical: true }]);
  }

  if (data.bleeding) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_ACTIVE_BLEEDING', critical: true }]);
  }
  if (data.coldExtremities) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_COLD_EXTREMITIES', critical: false }]);
  }
  if (data.jvd) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_JVD', critical: false }]);
  }
  if (data.oliguria) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_OLIGURIA', critical: false }]);
  }
}

function mapDisability(
  data: Partial<DisabilityObservations>,
  observedCodes: Set<string>,
  criticalCodes: Set<string>
): void {
  if (data.pupils === 'unequal') {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_ANISOCORIA', critical: true }]);
  } else if (data.pupils === 'dilated') {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_MYDRIASIS', critical: false }]);
  } else if (data.pupils === 'fixed') {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_FIXED_PUPILS', critical: true }]);
  }

  if (data.motorResponse === 'weakness') {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_MOTOR_WEAKNESS', critical: false }]);
  } else if (data.motorResponse === 'lateralized') {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_NEURO_DEFICIT', critical: true }]);
  } else if (data.motorResponse === 'paralysis') {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_PARALYSIS', critical: true }]);
  }

  if (data.seizures) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_SEIZURE', critical: true }]);
  }
  if (data.confusion) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_CONFUSION', critical: false }]);
  }
  if (data.headache) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_HEADACHE', critical: false }]);
  }
}

function mapExposure(
  data: Partial<ExposureObservations>,
  observedCodes: Set<string>,
  criticalCodes: Set<string>
): void {
  if (data.burns) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_BURNS', critical: true }]);
  }
  if (data.traumaSigns) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_TRAUMA_SIGNS', critical: false }]);
  }
  if (data.wounds) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_WOUNDS', critical: false }]);
  }
  if (data.edema) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_EDEMA', critical: false }]);
  }
  if (data.rash) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_RASH', critical: false }]);
  }
  if (data.vomiting) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_VOMITING', critical: false }]);
  }
}

/**
 * Map ABCDE observation form values to symptom codes (Mechanism 1: static mapping).
 *
 * Returns the full set of observed codes and the critical subset.
 */
export function mapObservationsToSymptomCodes(
  airway: Partial<AirwayObservations>,
  breathing: Partial<BreathingObservations>,
  circulation: Partial<CirculationObservations>,
  disability: Partial<DisabilityObservations>,
  exposure: Partial<ExposureObservations>
): { observedCodes: Set<string>; criticalCodes: Set<string> } {
  const observedCodes = new Set<string>();
  const criticalCodes = new Set<string>();

  mapAirway(airway, observedCodes, criticalCodes);
  mapBreathing(breathing, observedCodes, criticalCodes);
  mapCirculation(circulation, observedCodes, criticalCodes);
  mapDisability(disability, observedCodes, criticalCodes);
  mapExposure(exposure, observedCodes, criticalCodes);

  return { observedCodes, criticalCodes };
}

// =============================================================================
// MECHANISM 2: Dynamic vital sign threshold evaluation
// =============================================================================

interface PatientVitals {
  heartRate?: number;
  systolicBP?: number;
  diastolicBP?: number;
  respiratoryRate?: number;
  oxygenSaturation?: number;
  temperature?: number;
  gcsScore?: number;
  painLevel?: number;
  glucoseLevel?: number;
}

/**
 * Resolve which vital value to compare against for a given pathology symptom.
 *
 * Uses the symptom code as the primary hint (most reliable), falling back to
 * vitalUnit when the code doesn't contain a recognizable keyword.
 */
function resolveVitalValue(vitals: PatientVitals, symptom: PathologySymptom): number | undefined {
  const code = symptom.symptomCode.toUpperCase();

  // Code-based resolution (preferred — unambiguous)
  if (code.includes('HR') || code.includes('HEART')) return vitals.heartRate;
  if (code.includes('SBP') || code.includes('BP')) return vitals.systolicBP;
  if (code.includes('RR') || code.includes('RESP')) return vitals.respiratoryRate;
  if (code.includes('SPO2') || code.includes('SAT')) return vitals.oxygenSaturation;
  if (code.includes('TEMP')) return vitals.temperature;
  if (code.includes('GCS')) return vitals.gcsScore;
  if (code.includes('PAIN') || code.includes('EVA')) return vitals.painLevel;
  if (code.includes('GLUCOSE') || code.includes('GLYC')) return vitals.glucoseLevel;
  if (code.includes('CRT') || code.includes('REFILL')) return undefined; // capillary refill not in vitals

  // Unit-based fallback
  const unit = symptom.vitalUnit;
  if (!unit) return undefined;

  switch (unit) {
    case 'bpm':
      return vitals.heartRate;
    case 'mmHg':
      return vitals.systolicBP;
    case '°C':
      return vitals.temperature;
    case '%':
      // Ambiguous between SpO2 and respiratory rate — prefer SpO2 (more common VS_ use)
      return vitals.oxygenSaturation;
    case 'score':
      // Ambiguous between GCS and pain — prefer GCS (more common VS_ use)
      return vitals.gcsScore;
    case 'mg/dL':
      return vitals.glucoseLevel;
    case 's':
      // Capillary refill time — not available from standard vitals
      return undefined;
    default:
      return undefined;
  }
}

function evaluateThreshold(measured: number, operator: VitalSignOperator, threshold: number): boolean {
  switch (operator) {
    case '>': return measured > threshold;
    case '<': return measured < threshold;
    case '>=': return measured >= threshold;
    case '<=': return measured <= threshold;
    default: return false;
  }
}

/**
 * Evaluate a patient's vital signs against a pathology's VS_ symptom thresholds
 * (Mechanism 2: dynamic threshold evaluation).
 *
 * For each symptom where isVitalSign is true and operator/value/unit are present,
 * the corresponding patient vital is compared against the threshold. Returns an
 * array of matched symptom codes.
 */
export function evaluateVitalSignThresholds(
  vitals: PatientVitals,
  pathologySymptoms: PathologySymptom[]
): string[] {
  const matched: string[] = [];

  for (const sym of pathologySymptoms) {
    if (!sym.isVitalSign) continue;
    if (!sym.vitalOperator || sym.vitalValue == null || !sym.vitalUnit) continue;

    const measured = resolveVitalValue(vitals, sym);
    if (measured == null) continue;

    if (evaluateThreshold(measured, sym.vitalOperator, sym.vitalValue)) {
      matched.push(sym.symptomCode);
    }
  }

  return matched;
}
