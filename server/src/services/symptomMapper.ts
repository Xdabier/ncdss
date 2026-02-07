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
  // New airwayStatus field takes priority over legacy patent/obstructed booleans
  if (data.airwayStatus != null) {
    if (data.airwayStatus === 'at_risk') {
      addCodes(observedCodes, criticalCodes, [{ code: 'SYM_AIRWAY_AT_RISK', critical: false }]);
    } else if (data.airwayStatus === 'obstructed') {
      addCodes(observedCodes, criticalCodes, [
        { code: 'SYM_AIRWAY_OBSTRUCTION', critical: true },
        { code: 'SYM_AIRWAY_COMPROMISED', critical: true },
      ]);
    }
    // 'patent' → no code (normal state)
  } else {
    // Legacy fallback
    if (data.patent === false) {
      addCodes(observedCodes, criticalCodes, [{ code: 'SYM_AIRWAY_COMPROMISED', critical: true }]);
    }
    if (data.obstructed) {
      addCodes(observedCodes, criticalCodes, [{ code: 'SYM_AIRWAY_OBSTRUCTION', critical: true }]);
    }
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

  // Pain location (P1.2)
  if (data.painLocation && data.painLocation.length > 0) {
    const painMap: Record<string, string> = {
      thoracic: 'SYM_CHEST_PAIN',
      abdominal: 'SYM_ABDOMINAL_PAIN',
      cephalic: 'SYM_HEADACHE',
      neurologic: 'SYM_NEUROLOGIC_PAIN',
      orthopedic: 'SYM_ORTHOPEDIC_PAIN',
      muscular: 'SYM_MUSCULAR_PAIN',
      limbs: 'SYM_LIMB_PAIN',
      facial: 'SYM_FACIAL_PAIN',
      oral: 'SYM_ORAL_PAIN',
    };
    for (const loc of data.painLocation) {
      const code = painMap[loc];
      if (code) {
        addCodes(observedCodes, criticalCodes, [{ code, critical: false }]);
      }
    }
  }
}

function mapBreathing(
  data: Partial<BreathingObservations>,
  observedCodes: Set<string>,
  criticalCodes: Set<string>
): void {
  // New multi-select breath sounds takes priority over legacy single-select
  if (data.breathSoundsMulti && data.breathSoundsMulti.length > 0) {
    const breathSoundsMap: Record<string, CodeMapping | null> = {
      stridor: { code: 'SYM_STRIDOR', critical: true },
      wheezing: { code: 'SYM_WHEEZING', critical: false },
      crackles: { code: 'SYM_CRACKLES', critical: false },
      snoring: { code: 'SYM_SNORING', critical: false },
      gurgling: { code: 'SYM_GURGLING', critical: true },
      decreased: { code: 'SYM_BREATH_SOUNDS_DECREASED', critical: false },
      absent: { code: 'SYM_BREATH_SOUNDS_ABSENT', critical: true },
      gasping: { code: 'SYM_GASPING', critical: true },
      normal: null,
    };
    for (const sound of data.breathSoundsMulti) {
      const mapping = breathSoundsMap[sound];
      if (mapping) {
        addCodes(observedCodes, criticalCodes, [mapping]);
      }
    }
  } else {
    // Legacy single-select fallback
    if (data.breathSounds === 'wheezing') {
      addCodes(observedCodes, criticalCodes, [{ code: 'SYM_WHEEZING', critical: false }]);
    } else if (data.breathSounds === 'crackles') {
      addCodes(observedCodes, criticalCodes, [{ code: 'SYM_CRACKLES', critical: false }]);
    } else if (data.breathSounds === 'decreased') {
      addCodes(observedCodes, criticalCodes, [{ code: 'SYM_BREATH_SOUNDS_DECREASED', critical: false }]);
    } else if (data.breathSounds === 'absent') {
      addCodes(observedCodes, criticalCodes, [{ code: 'SYM_BREATH_SOUNDS_ABSENT', critical: true }]);
    }
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

  // New breathing fields
  if (data.nasalFlaring) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_NASAL_FLARING', critical: false }]);
  }
  if (data.apnea) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_APNEA', critical: true }]);
  }

  // Raw signesLutte array (P6.1) — may contain items not captured by individual booleans
  if (data.signesLutte && data.signesLutte.length > 0) {
    const signesLutteMap: Record<string, CodeMapping> = {
      'tirage sous-costal': { code: 'SYM_INCREASED_WOB', critical: false },
      'muscles accessoires': { code: 'SYM_ACCESSORY_MUSCLES', critical: false },
      'balancement thoraco-abdominal': { code: 'SYM_RESPIRATORY_DISTRESS', critical: true },
      'battement des ailes du nez': { code: 'SYM_NASAL_FLARING', critical: false },
    };
    for (const item of data.signesLutte) {
      const mapping = signesLutteMap[item];
      if (mapping) {
        addCodes(observedCodes, criticalCodes, [mapping]);
      }
    }
  }

  // pauseRespiratoire alias (P6.1) — maps to the same code as apnea
  if (data.pauseRespiratoire) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_APNEA', critical: true }]);
  }
}

function mapCirculation(
  data: Partial<CirculationObservations>,
  observedCodes: Set<string>,
  criticalCodes: Set<string>
): void {
  // New multi-select skin color takes priority over legacy single-select
  if (data.skinColorMulti && data.skinColorMulti.length > 0) {
    const skinMap: Record<string, CodeMapping | null> = {
      pale: { code: 'SYM_PALLOR', critical: false },
      cyanotic: { code: 'SYM_PERIPHERAL_CYANOSIS', critical: true },
      mottled: { code: 'SYM_MOTTLING', critical: true },
      normal: null,
      flushed: null,
    };
    for (const color of data.skinColorMulti) {
      const mapping = skinMap[color];
      if (mapping) {
        addCodes(observedCodes, criticalCodes, [mapping]);
      }
    }
  } else {
    // Legacy single-select fallback
    if (data.skinColor === 'pale') {
      addCodes(observedCodes, criticalCodes, [{ code: 'SYM_PALLOR', critical: false }]);
    } else if (data.skinColor === 'cyanotic') {
      addCodes(observedCodes, criticalCodes, [{ code: 'SYM_PERIPHERAL_CYANOSIS', critical: true }]);
    } else if (data.skinColor === 'mottled') {
      addCodes(observedCodes, criticalCodes, [{ code: 'SYM_MOTTLING', critical: true }]);
    }
  }

  if (data.peripheralPulses === 'weak') {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_WEAK_PULSES', critical: false }]);
  } else if (data.peripheralPulses === 'absent') {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_ABSENT_PULSES', critical: true }]);
  }

  // New multi-select bleeding type takes priority over legacy boolean
  if (data.bleedingType && data.bleedingType.length > 0) {
    // Any bleeding selection always emits the generic bleeding code
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_ACTIVE_BLEEDING', critical: true }]);
    const bleedingMap: Record<string, CodeMapping | null> = {
      internal: { code: 'SYM_INTERNAL_BLEEDING', critical: true },
      epistaxis: { code: 'SYM_EPISTAXIS', critical: false },
      hemoptysis: { code: 'SYM_HEMOPTYSIS', critical: false },
      hematemesis: { code: 'SYM_HEMATEMESIS', critical: true },
      gingival: { code: 'SYM_GINGIVAL_BLEEDING', critical: false },
      melena: { code: 'SYM_MELENA', critical: false },
      hematuria: { code: 'SYM_HEMATURIA', critical: false },
      otorrhagia: { code: 'SYM_OTORRHAGIA', critical: false },
      rhinorrhagia: { code: 'SYM_RHINORRHAGIA', critical: false },
      metrorrhagia: { code: 'SYM_METRORRHAGIA', critical: false },
      ocular: { code: 'SYM_OCULAR_HEMORRHAGE', critical: false },
      other: null,
    };
    for (const type of data.bleedingType) {
      const mapping = bleedingMap[type];
      if (mapping) {
        addCodes(observedCodes, criticalCodes, [mapping]);
      }
    }
  } else {
    // Legacy boolean fallback
    if (data.bleeding) {
      addCodes(observedCodes, criticalCodes, [{ code: 'SYM_ACTIVE_BLEEDING', critical: true }]);
    }
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

  // New circulation fields
  if (data.diaphoresis) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_DIAPHORESIS', critical: false }]);
  }
  if (data.cardiacAuscultation === 'murmur') {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_CARDIAC_MURMUR', critical: false }]);
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
  } else if (data.pupils === 'constricted') {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_MIOSIS', critical: false }]);
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

  // Pupil light reactivity (P2.2)
  if (data.pupilReactivity === false) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_PUPIL_NONREACTIVE', critical: true }]);
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

  // New multi-select trauma type takes priority over legacy boolean
  if (data.traumaType && data.traumaType.length > 0) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_TRAUMA_SIGNS', critical: false }]);
    const traumaMap: Record<string, CodeMapping> = {
      cranial: { code: 'SYM_TRAUMA_CRANIAL', critical: true },
      maxillofacial: { code: 'SYM_TRAUMA_MAXILLOFACIAL', critical: false },
      thoracic: { code: 'SYM_TRAUMA_THORACIC', critical: true },
      pelvic: { code: 'SYM_TRAUMA_PELVIC', critical: true },
      limbs: { code: 'SYM_TRAUMA_LIMBS', critical: false },
      spinal: { code: 'SYM_TRAUMA_SPINAL', critical: true },
    };
    for (const type of data.traumaType) {
      const mapping = traumaMap[type];
      if (mapping) {
        addCodes(observedCodes, criticalCodes, [mapping]);
      }
    }
  } else {
    // Legacy boolean fallback
    if (data.traumaSigns) {
      addCodes(observedCodes, criticalCodes, [{ code: 'SYM_TRAUMA_SIGNS', critical: false }]);
    }
  }

  if (data.wounds) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_WOUNDS', critical: false }]);
  }

  // New multi-select edema type takes priority over legacy boolean
  if (data.edemaType && data.edemaType.length > 0) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_EDEMA', critical: false }]);
    const edemaMap: Record<string, CodeMapping> = {
      angioedema: { code: 'SYM_ANGIOEDEMA', critical: true },
      lower_limbs: { code: 'SYM_PERIPHERAL_EDEMA', critical: false },
      upper_limbs: { code: 'SYM_PERIPHERAL_EDEMA', critical: false },
      ascites: { code: 'SYM_ASCITES', critical: false },
    };
    for (const type of data.edemaType) {
      const mapping = edemaMap[type];
      if (mapping) {
        addCodes(observedCodes, criticalCodes, [mapping]);
      }
    }
  } else {
    // Legacy boolean fallback
    if (data.edema) {
      addCodes(observedCodes, criticalCodes, [{ code: 'SYM_EDEMA', critical: false }]);
    }
  }

  if (data.rash) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_RASH', critical: false }]);
  }
  if (data.vomiting) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_VOMITING', critical: false }]);
  }
  if (data.diarrhea) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_DIARRHEA', critical: false }]);
  }

  // New exposure fields (P1.6)
  if (data.electrocution) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_ELECTROCUTION', critical: true }]);
  }
  if (data.intoxication) {
    addCodes(observedCodes, criticalCodes, [{ code: 'SYM_INTOXICATION', critical: true }]);
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
