import type {
  SymptomsFormData,
  AirwayObservations,
  BreathingObservations,
  CirculationObservations,
  DisabilityObservations,
  ExposureObservations,
} from '@ncdss/shared';

const AIRWAY_STATUS_MAP: Record<string, AirwayObservations['airwayStatus']> = {
  libre: 'patent',
  a_risque: 'at_risk',
  obstrue: 'obstructed',
};

const AIRWAY_STATUS_REVERSE: Record<string, SymptomsFormData['airwayStatus']> = {
  patent: 'libre',
  at_risk: 'a_risque',
  obstructed: 'obstrue',
};

const COLOR_ITEMS = new Set(['pale', 'cyanotic', 'mottled', 'flushed', 'normal']);

const SIGNES_CUTANES_TO_SKIN: Record<string, string> = {
  paleur: 'pale',
  cyanose: 'cyanotic',
  marbrures: 'mottled',
};

interface SplitResult {
  A: Partial<AirwayObservations>;
  B: Partial<BreathingObservations>;
  C: Partial<CirculationObservations>;
  D: Partial<DisabilityObservations>;
  E: Partial<ExposureObservations>;
}

export function splitSymptomsToABCDE(data: Partial<SymptomsFormData>): SplitResult {
  // --- A: Airway ---
  const A: Partial<AirwayObservations> = {};
  if (data.airwayStatus) {
    A.airwayStatus = AIRWAY_STATUS_MAP[data.airwayStatus];
  }
  if (data.painLocations?.length) {
    A.painLocation = data.painLocations as AirwayObservations['painLocation'];
  }
  if (data.notes !== undefined) {
    A.notes = data.notes;
  }

  // --- B: Breathing ---
  const B: Partial<BreathingObservations> = {};
  if (data.breathSoundsDetail?.length) {
    B.breathSoundsMulti = data.breathSoundsDetail as BreathingObservations['breathSoundsMulti'];
  }
  if (data.auscultationNormal) {
    B.breathSounds = 'normal';
  }
  if (data.signesLutte?.length) {
    B.workOfBreathing = data.pauseRespiratoire ? 'severe' : 'increased';
    B.accessoryMuscles = data.signesLutte.includes('muscles accessoires');
    B.nasalFlaring = data.signesLutte.includes('battement des ailes du nez');
    B.signesLutte = data.signesLutte;
  }
  if (data.pauseRespiratoire !== undefined) {
    B.apnea = data.pauseRespiratoire;
    B.pauseRespiratoire = data.pauseRespiratoire;
    if (data.pauseRespiratoire) {
      B.workOfBreathing = 'severe';
    }
  }

  // --- C: Circulation ---
  const C: Partial<CirculationObservations> = {};
  if (data.signesCutanes?.length) {
    const colorItems = data.signesCutanes
      .map((s) => SIGNES_CUTANES_TO_SKIN[s])
      .filter(Boolean) as CirculationObservations['skinColorMulti'];
    if (colorItems && colorItems.length > 0) {
      C.skinColorMulti = colorItems;
    }
    C.coldExtremities = data.signesCutanes.includes('extremites froides');
    C.diaphoresis = data.signesCutanes.includes('sueurs profuses');
  }
  if (data.capillaryRefill !== undefined) {
    C.capillaryRefill = data.capillaryRefill;
  }
  if (data.bleedingInterne || data.bleedingExteriorisee) {
    C.bleeding = true;
  }
  if (data.bleedingTypes?.length) {
    C.bleedingType = data.bleedingTypes as CirculationObservations['bleedingType'];
  }

  // --- D: Disability ---
  const D: Partial<DisabilityObservations> = {};
  if (data.pupilSymmetry === 'asymetrique') {
    D.pupils = 'unequal';
  } else if (data.pupilSize === 'dilate') {
    D.pupils = 'dilated';
  } else if (data.pupilSize === 'constricte') {
    D.pupils = 'constricted';
  } else if (data.pupilSize || data.pupilSymmetry) {
    D.pupils = 'PEARL';
  }
  if (data.pupilReactivity !== undefined) {
    D.pupilReactivity = data.pupilReactivity;
  }

  // --- E: Exposure ---
  const E: Partial<ExposureObservations> = {};
  if (data.traumaTypes?.length) {
    E.traumaType = data.traumaTypes as ExposureObservations['traumaType'];
  }
  if (data.burns !== undefined) {
    E.burns = data.burns;
  }
  if (data.electrocution !== undefined) {
    E.electrocution = data.electrocution;
  }
  if (data.intoxication !== undefined) {
    E.intoxication = data.intoxication;
  }

  return { A, B, C, D, E };
}

export function extractSymptomsFromABCDE(
  A?: Partial<AirwayObservations>,
  B?: Partial<BreathingObservations>,
  C?: Partial<CirculationObservations>,
  D?: Partial<DisabilityObservations>,
  E?: Partial<ExposureObservations>
): Partial<SymptomsFormData> {
  const result: Partial<SymptomsFormData> = {};

  // --- A ---
  if (A) {
    if (A.airwayStatus) {
      result.airwayStatus = AIRWAY_STATUS_REVERSE[A.airwayStatus];
    } else if (A.patent === true) {
      result.airwayStatus = 'libre';
    } else if (A.obstructed === true) {
      result.airwayStatus = 'obstrue';
    }
    if (A.painLocation?.length) {
      result.painLocations = [...A.painLocation];
    }
    if (A.notes) {
      result.notes = A.notes;
    }
  }

  // --- B ---
  if (B) {
    result.auscultationNormal = B.breathSounds === 'normal';
    if (B.breathSoundsMulti?.length) {
      result.breathSoundsDetail = [...B.breathSoundsMulti];
    } else if (B.breathSounds && B.breathSounds !== 'normal') {
      result.breathSoundsDetail = [B.breathSounds];
    }
    if (B.apnea !== undefined) {
      result.pauseRespiratoire = B.apnea;
    } else if (B.pauseRespiratoire !== undefined) {
      result.pauseRespiratoire = B.pauseRespiratoire;
    }
    // Prefer stored signesLutte array; fall back to reconstructing from individual flags
    if (B.signesLutte?.length) {
      result.signesLutte = [...B.signesLutte];
    } else {
      const signesLutte: string[] = [];
      if (B.accessoryMuscles) signesLutte.push('muscles accessoires');
      if (B.nasalFlaring) signesLutte.push('battement des ailes du nez');
      if (signesLutte.length > 0) {
        result.signesLutte = signesLutte;
      }
    }
  }

  // --- C ---
  if (C) {
    const signesCutanes: string[] = [];
    if (C.skinColorMulti?.length) {
      for (const color of C.skinColorMulti) {
        const entry = Object.entries(SIGNES_CUTANES_TO_SKIN).find(([, v]) => v === color);
        if (entry) signesCutanes.push(entry[0]);
      }
    } else if (C.skinColor && C.skinColor !== 'normal') {
      const entry = Object.entries(SIGNES_CUTANES_TO_SKIN).find(([, v]) => v === C.skinColor);
      if (entry) signesCutanes.push(entry[0]);
    }
    if (C.coldExtremities) signesCutanes.push('extremites froides');
    if (C.diaphoresis) signesCutanes.push('sueurs profuses');
    if (signesCutanes.length > 0) {
      result.signesCutanes = signesCutanes;
    }
    if (C.capillaryRefill !== undefined) {
      result.capillaryRefill = C.capillaryRefill;
    }
    if (C.bleeding) {
      if (C.bleedingType?.length) {
        const hasInternal = C.bleedingType.includes('internal');
        result.bleedingInterne = hasInternal;
        result.bleedingExteriorisee = C.bleedingType.some((t) => t !== 'internal');
        result.bleedingTypes = [...C.bleedingType];
      } else {
        result.bleedingInterne = true;
      }
    }
  }

  // --- D ---
  if (D) {
    if (D.pupils === 'unequal') {
      result.pupilSymmetry = 'asymetrique';
    } else if (D.pupils) {
      result.pupilSymmetry = 'symetrique';
      if (D.pupils === 'dilated') result.pupilSize = 'dilate';
      else if (D.pupils === 'constricted') result.pupilSize = 'constricte';
    }
    if (D.pupilReactivity !== undefined) {
      result.pupilReactivity = D.pupilReactivity;
    }
  }

  // --- E ---
  if (E) {
    if (E.traumaType?.length) {
      result.traumaTypes = [...E.traumaType];
    }
    if (E.burns !== undefined) result.burns = E.burns;
    if (E.electrocution !== undefined) result.electrocution = E.electrocution;
    if (E.intoxication !== undefined) result.intoxication = E.intoxication;
  }

  return result;
}
