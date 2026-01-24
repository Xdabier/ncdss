/**
 * Sign Extractor Service
 * Converts ABCDE observation data into clinical sign strings for pathology matching
 */

import { normalizeText } from '../utils/textNormalization';
import type {
  AirwayObservations,
  BreathingObservations,
  CirculationObservations,
  DisabilityObservations,
  ExposureObservations,
  ExtractedSigns
} from '@ncdss/shared';

/**
 * Extract clinical signs from Airway observations
 */
export function extractAirwaySigns(data: Partial<AirwayObservations>): ExtractedSigns {
  const signs: string[] = [];
  const criticalSigns: string[] = [];

  if (data.obstructed) {
    signs.push('Obstruction voies aériennes');
    criticalSigns.push('Obstruction voies aériennes');
  }

  if (data.secretions) {
    signs.push('Sécrétions');
  }

  if (data.stridor) {
    signs.push('Stridor');
    criticalSigns.push('Stridor');
  }

  if (!data.patent) {
    signs.push('Voies aériennes à risque');
    criticalSigns.push('Voies aériennes à risque');
  }

  if (data.painLevel !== undefined) {
    if (data.painLevel >= 8) {
      signs.push('Douleur sévère');
      signs.push(`EVA ${data.painLevel}/10`);
    } else if (data.painLevel >= 5) {
      signs.push('Douleur modérée');
    }
  }

  return {
    category: 'A',
    signs,
    normalizedSigns: signs.map(normalizeText),
    criticalSigns
  };
}

/**
 * Extract clinical signs from Breathing observations
 */
export function extractBreathingSigns(data: Partial<BreathingObservations>): ExtractedSigns {
  const signs: string[] = [];
  const criticalSigns: string[] = [];

  // Respiratory rate
  if (data.respiratoryRate !== undefined) {
    const rr = data.respiratoryRate;
    if (rr > 30) {
      signs.push('FR > 30/min');
      signs.push('Polypnée');
      criticalSigns.push('FR > 30/min');
    } else if (rr < 8) {
      signs.push('FR < 8/min');
      signs.push('Bradypnée');
      criticalSigns.push('FR < 8/min');
    } else if (rr > 24) {
      signs.push('Tachypnée');
      signs.push('FR > 24/min');
    } else if (rr < 12) {
      signs.push('Bradypnée');
    }
  }

  // Oxygen saturation
  if (data.oxygenSaturation !== undefined) {
    const spo2 = data.oxygenSaturation;
    if (spo2 < 90) {
      signs.push('SpO₂ < 90%');
      signs.push('Désaturation sévère');
      criticalSigns.push('SpO₂ < 90%');
    } else if (spo2 < 94) {
      signs.push('SpO₂ < 94%');
      signs.push('Hypoxie');
    } else if (spo2 < 96) {
      signs.push('SpO₂ ↓');
    }
  }

  // Breath sounds
  if (data.breathSounds === 'wheezing') {
    signs.push('Sibilants');
  } else if (data.breathSounds === 'crackles') {
    signs.push('Râles crépitants');
  } else if (data.breathSounds === 'decreased') {
    signs.push('Murmure vésiculaire diminué');
  } else if (data.breathSounds === 'absent') {
    signs.push('Silence auscultatoire');
    criticalSigns.push('Silence auscultatoire');
  }

  // Work of breathing
  if (data.workOfBreathing === 'increased') {
    signs.push('Tirage');
    signs.push('Dyspnée');
  } else if (data.workOfBreathing === 'severe') {
    signs.push('Tirage sévère');
    signs.push('Détresse respiratoire');
    signs.push('Muscles accessoires');
    criticalSigns.push('Détresse respiratoire');
  }

  if (data.accessoryMuscles) {
    signs.push('Utilisation muscles accessoires');
  }

  if (data.cyanosis) {
    signs.push('Cyanose');
    criticalSigns.push('Cyanose');
  }

  return {
    category: 'B',
    signs,
    normalizedSigns: signs.map(normalizeText),
    criticalSigns
  };
}

/**
 * Extract clinical signs from Circulation observations
 */
export function extractCirculationSigns(data: Partial<CirculationObservations>): ExtractedSigns {
  const signs: string[] = [];
  const criticalSigns: string[] = [];

  // Heart rate
  if (data.heartRate !== undefined) {
    const hr = data.heartRate;
    if (hr > 120) {
      signs.push('FC > 120 bpm');
      signs.push('Tachycardie sévère');
      criticalSigns.push('FC > 120 bpm');
    } else if (hr > 100) {
      signs.push('Tachycardie');
      signs.push('FC ↑');
    } else if (hr < 50) {
      signs.push('Bradycardie');
      signs.push('FC < 50 bpm');
      criticalSigns.push('Bradycardie sévère');
    } else if (hr < 60) {
      signs.push('Bradycardie');
    }
  }

  // Blood pressure
  const systolic = data.systolicBP;
  const diastolic = data.diastolicBP;

  if (systolic !== undefined) {
    if (systolic < 90) {
      signs.push('TA ↓');
      signs.push('PAS < 90');
      signs.push('Hypotension');
      criticalSigns.push('Hypotension sévère');
    } else if (systolic < 100) {
      signs.push('Hypotension');
    } else if (systolic > 180) {
      signs.push('TA > 180');
      signs.push('HTA sévère');
      criticalSigns.push('HTA > 180');
    } else if (systolic > 140) {
      signs.push('HTA');
    }
  }

  // Capillary refill
  if (data.capillaryRefill !== undefined && data.capillaryRefill > 3) {
    signs.push('TRC > 3s');
    signs.push('Temps de recoloration cutanée allongé');
  }

  // Skin color
  if (data.skinColor === 'pale') {
    signs.push('Pâleur');
  } else if (data.skinColor === 'cyanotic') {
    signs.push('Cyanose');
    criticalSigns.push('Cyanose');
  } else if (data.skinColor === 'mottled') {
    signs.push('Marbrures');
    criticalSigns.push('Marbrures');
  }

  // Peripheral pulses
  if (data.peripheralPulses === 'weak') {
    signs.push('Pouls périphériques faibles');
  } else if (data.peripheralPulses === 'absent') {
    signs.push('Pouls périphériques absents');
    criticalSigns.push('Pouls absents');
  }

  if (data.bleeding) {
    signs.push('Hémorragie');
    signs.push('Saignement actif');
    criticalSigns.push('Hémorragie');
  }

  if (data.coldExtremities) {
    signs.push('Extrémités froides');
  }

  return {
    category: 'C',
    signs,
    normalizedSigns: signs.map(normalizeText),
    criticalSigns
  };
}

/**
 * Extract clinical signs from Disability observations
 */
export function extractDisabilitySigns(data: Partial<DisabilityObservations>): ExtractedSigns {
  const signs: string[] = [];
  const criticalSigns: string[] = [];

  // GCS
  const gcs = data.gcsTotal || (
    (data.gcsEye || 4) + (data.gcsVerbal || 5) + (data.gcsMotor || 6)
  );

  if (gcs <= 8) {
    signs.push('GCS ≤ 8');
    signs.push('Coma');
    criticalSigns.push('GCS ≤ 8');
  } else if (gcs < 12) {
    signs.push('GCS < 12');
    signs.push('Altération conscience');
    criticalSigns.push('GCS < 12');
  } else if (gcs < 15) {
    signs.push('GCS ↓');
    signs.push('GCS < 15');
  }

  // Pupils
  if (data.pupils === 'unequal') {
    signs.push('Anisocorie');
    criticalSigns.push('Anisocorie');
  } else if (data.pupils === 'dilated') {
    signs.push('Mydriase');
  } else if (data.pupils === 'constricted') {
    signs.push('Myosis');
  } else if (data.pupils === 'fixed') {
    signs.push('Pupilles aréactives');
    criticalSigns.push('Pupilles aréactives');
  }

  // Motor response
  if (data.motorResponse === 'weakness') {
    signs.push('Déficit moteur');
  } else if (data.motorResponse === 'paralysis') {
    signs.push('Paralysie');
    criticalSigns.push('Paralysie');
  } else if (data.motorResponse === 'lateralized') {
    signs.push('Déficit focal');
    signs.push('Latéralisation');
    criticalSigns.push('Déficit focal');
  }

  // Glucose
  if (data.glucoseLevel !== undefined) {
    const glucose = data.glucoseLevel;
    if (glucose < 60) {
      signs.push('Hypoglycémie');
      criticalSigns.push('Hypoglycémie sévère');
    } else if (glucose < 70) {
      signs.push('Hypoglycémie');
    } else if (glucose > 300) {
      signs.push('Hyperglycémie sévère');
      criticalSigns.push('Hyperglycémie sévère');
    } else if (glucose > 180) {
      signs.push('Hyperglycémie');
    }
  }

  if (data.seizures) {
    signs.push('Convulsions');
    signs.push('Crise comitiale');
    criticalSigns.push('Convulsions');
  }

  if (data.confusion) {
    signs.push('Confusion');
    signs.push('Désorientation');
  }

  return {
    category: 'D',
    signs,
    normalizedSigns: signs.map(normalizeText),
    criticalSigns
  };
}

/**
 * Extract clinical signs from Exposure observations
 */
export function extractExposureSigns(data: Partial<ExposureObservations>): ExtractedSigns {
  const signs: string[] = [];
  const criticalSigns: string[] = [];

  // Temperature
  if (data.temperature !== undefined) {
    const temp = data.temperature;
    if (temp < 35) {
      signs.push('Hypothermie');
      signs.push('Température < 35°C');
      criticalSigns.push('Hypothermie sévère');
    } else if (temp < 36) {
      signs.push('Hypothermie légère');
    } else if (temp > 39) {
      signs.push('Hyperthermie');
      signs.push('Fièvre > 39°C');
      criticalSigns.push('Hyperthermie sévère');
    } else if (temp > 38) {
      signs.push('Fièvre');
    }
  }

  if (data.hypothermia) {
    signs.push('Hypothermie');
  }

  if (data.hyperthermia) {
    signs.push('Hyperthermie');
  }

  if (data.rash) {
    signs.push('Éruption cutanée');
    signs.push('Rash');
  }

  if (data.wounds) {
    signs.push('Plaies');
  }

  if (data.edema) {
    signs.push('Œdème');
  }

  if (data.burns) {
    signs.push('Brûlures');
    criticalSigns.push('Brûlures');
  }

  if (data.traumaSigns) {
    signs.push('Signes traumatiques');
    signs.push('Traumatisme');
  }

  // Add any free-text findings
  if (data.findings && data.findings.length > 0) {
    signs.push(...data.findings);
  }

  return {
    category: 'E',
    signs,
    normalizedSigns: signs.map(normalizeText),
    criticalSigns
  };
}

/**
 * Extract all signs from complete ABCDE observations
 */
export function extractAllSigns(
  airway: Partial<AirwayObservations>,
  breathing: Partial<BreathingObservations>,
  circulation: Partial<CirculationObservations>,
  disability: Partial<DisabilityObservations>,
  exposure: Partial<ExposureObservations>
): ExtractedSigns[] {
  return [
    extractAirwaySigns(airway),
    extractBreathingSigns(breathing),
    extractCirculationSigns(circulation),
    extractDisabilitySigns(disability),
    extractExposureSigns(exposure)
  ];
}

/**
 * Get all critical signs from extracted signs
 */
export function getAllCriticalSigns(extractedSigns: ExtractedSigns[]): string[] {
  const allCritical: string[] = [];
  for (const es of extractedSigns) {
    allCritical.push(...es.criticalSigns);
  }
  return [...new Set(allCritical)]; // Remove duplicates
}

/**
 * Get all signs as a flat array (for matching)
 */
export function getAllSignsFlat(extractedSigns: ExtractedSigns[]): {
  signs: string[];
  normalizedSigns: string[];
} {
  const signs: string[] = [];
  const normalizedSigns: string[] = [];

  for (const es of extractedSigns) {
    signs.push(...es.signs);
    normalizedSigns.push(...es.normalizedSigns);
  }

  return {
    signs: [...new Set(signs)],
    normalizedSigns: [...new Set(normalizedSigns)]
  };
}
