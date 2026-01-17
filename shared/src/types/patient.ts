export interface Patient {
  id: string;
  fullName: string;
  age: number;
  sex: 'MALE' | 'FEMALE';
  chiefComplaint?: string;
  status: PatientStatus;
  registeredBy: string;
  createdAt: string;
  updatedAt: string;
}

export enum PatientStatus {
  REGISTERED = 'REGISTERED',
  IN_TRIAGE = 'IN_TRIAGE',
  TRIAGED = 'TRIAGED',
  IN_TREATMENT = 'IN_TREATMENT',
  WITH_DOCTOR = 'WITH_DOCTOR',
  DISCHARGED = 'DISCHARGED'
}
