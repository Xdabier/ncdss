import { UserRole, NurseAssignment, BoxType, AssignmentPreset, NurseShiftPreset, NURSE_SHIFT_PRESETS } from '@ncdss/shared';

export const roleLabels: Record<UserRole, string> = {
  [UserRole.NURSE]: 'Infirmier(ère)',
  [UserRole.NURSE_SUPERVISOR]: 'Surveillant(e)',
  [UserRole.DOCTOR]: 'Médecin',
  [UserRole.ADMIN]: 'Administrateur',
  [UserRole.SUPER_ADMIN]: 'Super Admin',
};

export const roleColors: Record<UserRole, string> = {
  [UserRole.NURSE]: 'primary',
  [UserRole.NURSE_SUPERVISOR]: 'secondary',
  [UserRole.DOCTOR]: 'success',
  [UserRole.ADMIN]: 'warning',
  [UserRole.SUPER_ADMIN]: 'danger',
};

export const assignmentLabels: Record<NurseAssignment, string> = {
  [NurseAssignment.INSCRIPTION]: 'Inscription',
  [NurseAssignment.TRIAGE]: 'Triage',
  [NurseAssignment.TREATMENT]: 'Soins',
  [NurseAssignment.OFF]: 'Repos',
};

export const assignmentColors: Record<NurseAssignment, string> = {
  [NurseAssignment.OFF]: 'bg-gray-100',
  [NurseAssignment.INSCRIPTION]: 'bg-green-100',
  [NurseAssignment.TRIAGE]: 'bg-yellow-100',
  [NurseAssignment.TREATMENT]: 'bg-blue-100',
};

export const boxTypeLabels: Record<BoxType, string> = {
  [BoxType.TRIAGE]: 'Triage',
  [BoxType.MEDICAL]: 'Médical',
  [BoxType.SURGICAL]: 'Chirurgical',
  [BoxType.TRAUMA]: 'Trauma',
  [BoxType.SAUV]: 'SAUV',
};

export const boxTypeColors: Record<BoxType, string> = {
  [BoxType.TRIAGE]: 'bg-yellow-100 text-yellow-800',
  [BoxType.MEDICAL]: 'bg-blue-100 text-blue-800',
  [BoxType.SURGICAL]: 'bg-purple-100 text-purple-800',
  [BoxType.TRAUMA]: 'bg-orange-100 text-orange-800',
  [BoxType.SAUV]: 'bg-red-100 text-red-800',
};

export const presetLabels: Record<AssignmentPreset, string> = {
  [AssignmentPreset.GARDE_24H]: 'Garde 24h',
  [AssignmentPreset.JOUR_12H]: 'Jour 12h',
  [AssignmentPreset.NUIT_12H]: 'Nuit 12h',
  [AssignmentPreset.MATIN_ETE]: 'Matin Été (6h)',
  [AssignmentPreset.CUSTOM]: 'Personnalisé',
};

export const presetDurations: Record<AssignmentPreset, number> = {
  [AssignmentPreset.GARDE_24H]: 24,
  [AssignmentPreset.JOUR_12H]: 12,
  [AssignmentPreset.NUIT_12H]: 12,
  [AssignmentPreset.MATIN_ETE]: 6,
  [AssignmentPreset.CUSTOM]: 0,
};

export const nurseShiftPresetLabels: Record<NurseShiftPreset, string> = {
  [NurseShiftPreset.MATIN_8H]: NURSE_SHIFT_PRESETS[NurseShiftPreset.MATIN_8H].labelFr,
  [NurseShiftPreset.APRES_MIDI_8H]: NURSE_SHIFT_PRESETS[NurseShiftPreset.APRES_MIDI_8H].labelFr,
  [NurseShiftPreset.NUIT_8H]: NURSE_SHIFT_PRESETS[NurseShiftPreset.NUIT_8H].labelFr,
  [NurseShiftPreset.GARDE_24H]: NURSE_SHIFT_PRESETS[NurseShiftPreset.GARDE_24H].labelFr,
  [NurseShiftPreset.JOUR_12H]: NURSE_SHIFT_PRESETS[NurseShiftPreset.JOUR_12H].labelFr,
  [NurseShiftPreset.NUIT_12H]: NURSE_SHIFT_PRESETS[NurseShiftPreset.NUIT_12H].labelFr,
  [NurseShiftPreset.MATIN_ETE]: NURSE_SHIFT_PRESETS[NurseShiftPreset.MATIN_ETE].labelFr,
  [NurseShiftPreset.CUSTOM]: NURSE_SHIFT_PRESETS[NurseShiftPreset.CUSTOM].labelFr,
};
