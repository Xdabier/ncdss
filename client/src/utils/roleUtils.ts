import { NurseAssignment, BoxType, AssignmentPreset } from '@ncdss/shared';

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
  [BoxType.DECHOCAGE]: 'Déchocage',
};

export const boxTypeColors: Record<BoxType, string> = {
  [BoxType.TRIAGE]: 'bg-yellow-100 text-yellow-800',
  [BoxType.MEDICAL]: 'bg-blue-100 text-blue-800',
  [BoxType.SURGICAL]: 'bg-purple-100 text-purple-800',
  [BoxType.TRAUMA]: 'bg-orange-100 text-orange-800',
  [BoxType.SAUV]: 'bg-red-100 text-red-800',
  [BoxType.DECHOCAGE]: 'bg-rose-100 text-rose-800',
};

export const presetLabels: Record<AssignmentPreset, string> = {
  [AssignmentPreset.GARDE_24H]: 'Garde 24h',
  [AssignmentPreset.JOUR_12H]: 'Jour 12h',
  [AssignmentPreset.NUIT_12H]: 'Nuit 12h',
  [AssignmentPreset.MATIN_ETE]: 'Matin Été (6h)',
  [AssignmentPreset.CUSTOM]: 'Personnalisé',
};
