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
