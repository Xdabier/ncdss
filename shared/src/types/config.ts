export interface ERConfiguration {
  id: string;
  inscriptionDesks: number;
  triageBoxes: number;
  medicalBoxes: number;
  surgicalBoxes: number;
  traumaBoxes: number;
  sauvBeds: number;
  updatedBy: string | null;
  updatedAt: string;
}

export enum BoxType {
  TRIAGE = 'TRIAGE',
  MEDICAL = 'MEDICAL',
  SURGICAL = 'SURGICAL',
  TRAUMA = 'TRAUMA',
  SAUV = 'SAUV',
}

export interface Box {
  id: string;
  name: string;
  boxType: BoxType;
  isActive: boolean;
}

export enum Shift {
  MORNING = 'MORNING', // 6h-14h (kept for nurse scheduling)
  AFTERNOON = 'AFTERNOON', // 14h-22h
  NIGHT = 'NIGHT', // 22h-6h
}

// Tunisian ER shift presets for doctor assignments
export enum AssignmentPreset {
  GARDE_24H = 'GARDE_24H',   // 08:00 → 08:00+1 (24h on-call)
  JOUR_12H = 'JOUR_12H',     // 08:00 → 20:00 (Day shift)
  NUIT_12H = 'NUIT_12H',     // 20:00 → 08:00+1 (Night shift)
  MATIN_ETE = 'MATIN_ETE',   // 08:00 → 14:00 (Summer morning - Séance Unique)
  CUSTOM = 'CUSTOM',         // Custom time range
}

export interface AssignmentPresetConfig {
  label: string;
  labelFr: string;
  startTime: string;  // HH:MM
  endTime: string;    // HH:MM
  spansDays: number;  // 0 = same day, 1 = next day
  durationHours: number;
}

export const ASSIGNMENT_PRESETS: Record<AssignmentPreset, AssignmentPresetConfig> = {
  [AssignmentPreset.GARDE_24H]: {
    label: 'Garde 24h',
    labelFr: 'Garde 24h (08h→08h)',
    startTime: '08:00',
    endTime: '08:00',
    spansDays: 1,
    durationHours: 24,
  },
  [AssignmentPreset.JOUR_12H]: {
    label: 'Day 12h',
    labelFr: 'Jour 12h (08h→20h)',
    startTime: '08:00',
    endTime: '20:00',
    spansDays: 0,
    durationHours: 12,
  },
  [AssignmentPreset.NUIT_12H]: {
    label: 'Night 12h',
    labelFr: 'Nuit 12h (20h→08h)',
    startTime: '20:00',
    endTime: '08:00',
    spansDays: 1,
    durationHours: 12,
  },
  [AssignmentPreset.MATIN_ETE]: {
    label: 'Summer Morning',
    labelFr: 'Matin Été (08h→14h)',
    startTime: '08:00',
    endTime: '14:00',
    spansDays: 0,
    durationHours: 6,
  },
  [AssignmentPreset.CUSTOM]: {
    label: 'Custom',
    labelFr: 'Personnalisé',
    startTime: '08:00',
    endTime: '20:00',
    spansDays: 0,
    durationHours: 12,
  },
};

// Tunisian ER shift presets for nurse assignments
export enum NurseShiftPreset {
  MATIN_8H = 'MATIN_8H',           // 06:00 → 14:00 (8h morning shift)
  APRES_MIDI_8H = 'APRES_MIDI_8H', // 14:00 → 22:00 (8h afternoon shift)
  NUIT_8H = 'NUIT_8H',             // 22:00 → 06:00 (8h night shift)
  GARDE_24H = 'GARDE_24H',         // 08:00 → 08:00+1 (24h on-call)
  JOUR_12H = 'JOUR_12H',           // 08:00 → 20:00 (12h day shift)
  NUIT_12H = 'NUIT_12H',           // 20:00 → 08:00+1 (12h night shift)
  MATIN_ETE = 'MATIN_ETE',         // 08:00 → 14:00 (6h summer morning)
  CUSTOM = 'CUSTOM',               // Custom time range
}

export interface NurseShiftPresetConfig {
  labelFr: string;
  startTime: string;  // HH:MM
  endTime: string;    // HH:MM
  durationHours: number;
}

export const NURSE_SHIFT_PRESETS: Record<NurseShiftPreset, NurseShiftPresetConfig> = {
  [NurseShiftPreset.MATIN_8H]: {
    labelFr: 'Matin (06h→14h)',
    startTime: '06:00',
    endTime: '14:00',
    durationHours: 8,
  },
  [NurseShiftPreset.APRES_MIDI_8H]: {
    labelFr: 'Après-midi (14h→22h)',
    startTime: '14:00',
    endTime: '22:00',
    durationHours: 8,
  },
  [NurseShiftPreset.NUIT_8H]: {
    labelFr: 'Nuit (22h→06h)',
    startTime: '22:00',
    endTime: '06:00',
    durationHours: 8,
  },
  [NurseShiftPreset.GARDE_24H]: {
    labelFr: 'Garde 24h (08h→08h)',
    startTime: '08:00',
    endTime: '08:00',
    durationHours: 24,
  },
  [NurseShiftPreset.JOUR_12H]: {
    labelFr: 'Jour 12h (08h→20h)',
    startTime: '08:00',
    endTime: '20:00',
    durationHours: 12,
  },
  [NurseShiftPreset.NUIT_12H]: {
    labelFr: 'Nuit 12h (20h→08h)',
    startTime: '20:00',
    endTime: '08:00',
    durationHours: 12,
  },
  [NurseShiftPreset.MATIN_ETE]: {
    labelFr: 'Matin Été (08h→14h)',
    startTime: '08:00',
    endTime: '14:00',
    durationHours: 6,
  },
  [NurseShiftPreset.CUSTOM]: {
    labelFr: 'Personnalisé',
    startTime: '08:00',
    endTime: '20:00',
    durationHours: 12,
  },
};

export interface BoxAssignment {
  id: string;
  boxId: string;
  doctorId: string;
  startDateTime: string;  // ISO datetime
  endDateTime: string;    // ISO datetime
  presetType: AssignmentPreset | null;
  isActive: boolean;
  createdAt?: string;
}
