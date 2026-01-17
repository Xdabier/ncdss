import { UserRole, NurseAssignment } from '@ncdss/shared';

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
