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
  SAUV = 'SAUV'
}

export interface Box {
  id: string;
  name: string;
  boxType: BoxType;
  isActive: boolean;
}

export enum Shift {
  MORNING = 'MORNING',     // 6h-14h
  AFTERNOON = 'AFTERNOON', // 14h-22h
  NIGHT = 'NIGHT'          // 22h-6h
}

export interface BoxAssignment {
  id: string;
  boxId: string;
  doctorId: string;
  shift: Shift;
  effectiveDate: string;
  isActive: boolean;
}
