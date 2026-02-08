// ============================================================================
// PRESCRIPTION TYPES
// ============================================================================

export enum PrescriptionStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  ON_HOLD = 'ON_HOLD',
}

export enum MedicationRoute {
  PO = 'PO',       // Per os (oral)
  IV = 'IV',       // Intraveineux
  IM = 'IM',       // Intramusculaire
  SC = 'SC',       // Sous-cutané
  SL = 'SL',       // Sublingual
  INH = 'INH',     // Inhalation
  TOP = 'TOP',     // Topique
  PR = 'PR',       // Per rectum
  OPH = 'OPH',     // Ophtalmique
}

export enum AdministrationStatus {
  GIVEN = 'GIVEN',
  REFUSED = 'REFUSED',
  HELD = 'HELD',
  NOT_AVAILABLE = 'NOT_AVAILABLE',
}

export interface Administration {
  id: string;
  time: string;           // ISO timestamp
  nurseId: string;
  nurseName?: string;     // For display
  status: AdministrationStatus;
  notes?: string;
}

export interface Prescription {
  id: string;
  patientId: string;
  medicationName: string;
  dosage: string;         // e.g., "500mg", "10ml"
  route: MedicationRoute;
  frequency: string;      // e.g., "3x/jour", "toutes les 8h"
  duration?: string;      // e.g., "5 jours"
  instructions?: string;  // Special instructions
  startTime?: string;     // When to start
  endTime?: string;       // When to end
  status: PrescriptionStatus;
  administrations: Administration[];
  prescribedBy: string;
  prescribedByName?: string;  // For display
  prescribedAt: string;
  cancelledBy?: string;
  cancelledAt?: string;
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePrescriptionRequest {
  patientId: string;
  medicationName: string;
  dosage: string;
  route: MedicationRoute;
  frequency?: string;
  duration?: string;
  instructions?: string;
  startTime?: string;
  endTime?: string;
}

export interface AdministerPrescriptionRequest {
  status: AdministrationStatus;
  notes?: string;
}

export interface CancelPrescriptionRequest {
  reason: string;
}

// ============================================================================
// DIAGNOSIS TYPES
// ============================================================================

export enum DiagnosisType {
  PRIMARY = 'PRIMARY',
  SECONDARY = 'SECONDARY',
  DIFFERENTIAL = 'DIFFERENTIAL',
}

export enum DiagnosisSeverity {
  MILD = 'MILD',
  MODERATE = 'MODERATE',
  SEVERE = 'SEVERE',
  CRITICAL = 'CRITICAL',
}

export enum DiagnosisStatus {
  ACTIVE = 'ACTIVE',
  RESOLVED = 'RESOLVED',
  RULED_OUT = 'RULED_OUT',
}

export interface Diagnosis {
  id: string;
  patientId: string;
  diagnosisCode?: string;    // ICD-10 code (optional)
  diagnosisName: string;
  diagnosisType: DiagnosisType;
  severity?: DiagnosisSeverity;
  notes?: string;
  status: DiagnosisStatus;
  confirmedAt?: string;
  resolvedAt?: string;
  diagnosedBy: string;
  diagnosedByName?: string;  // For display
  diagnosedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDiagnosisRequest {
  patientId: string;
  diagnosisCode?: string;
  diagnosisName: string;
  diagnosisType: DiagnosisType;
  severity?: DiagnosisSeverity;
  notes?: string;
}

export interface UpdateDiagnosisRequest {
  diagnosisCode?: string;
  diagnosisName?: string;
  diagnosisType?: DiagnosisType;
  severity?: DiagnosisSeverity;
  notes?: string;
}
