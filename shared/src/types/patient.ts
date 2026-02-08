export enum PatientStatus {
  REGISTERED = 'REGISTERED',       // Just registered, waiting for triage
  IN_TRIAGE = 'IN_TRIAGE',         // Currently being triaged
  TRIAGED = 'TRIAGED',             // Triage complete, waiting for treatment
  IN_TREATMENT = 'IN_TREATMENT',   // Receiving treatment
  WITH_DOCTOR = 'WITH_DOCTOR',     // With doctor for diagnosis
  DISCHARGED = 'DISCHARGED'        // Released from ER
}

export enum Sex {
  MALE = 'MALE',
  FEMALE = 'FEMALE'
}

export enum Orientation {
  SAUV = 'SAUV',
  MEDICAL = 'MEDICAL',
  SURGICAL = 'SURGICAL',
  TRAUMA = 'TRAUMA',
  PEDIATRIC = 'PEDIATRIC'
}

export enum OrientationSource {
  PATHOLOGY_LOOKUP = 'PATHOLOGY_LOOKUP',
  SCORE_BASED = 'SCORE_BASED',
  AI_SUGGESTION = 'AI_SUGGESTION',
  MANUAL = 'MANUAL'
}

export enum IdType {
  CIN = 'CIN',
  PASSPORT = 'PASSPORT'
}

export interface PatientIdentity {
  id: string;
  fullName: string;
  dateOfBirth: string;       // ISO date YYYY-MM-DD
  sex: Sex;
  idNumber?: string;         // CIN or passport number
  idType?: IdType;
  nationality?: string;      // ISO 3166-1 alpha-2 code
  phone?: string;
  address?: string;
  allergies?: string;
  chronicConditions?: string;
  currentMedications?: string;
  medicalHistory?: string;
  surgicalHistory?: string;
  obstetricHistory?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Patient {
  id: string;
  patientIdentityId: string;

  // Demographics
  fullName: string;
  age: number;
  dateOfBirth?: string;
  sex: Sex;
  nationalId?: string;           // CIN or passport
  idType?: IdType;
  nationality?: string;
  phone?: string;
  address?: string;
  
  // Medical History (from inscription)
  allergies?: string;
  chronicConditions?: string;    // JSON array
  currentMedications?: string;   // JSON array
  medicalHistoryNotes?: string | null;
  medicalHistory?: string;
  surgicalHistory?: string;
  obstetricHistory?: string;
  
  // Chief Complaint (from inscription)
  chiefComplaint?: string;
  symptomOnset?: string;         // When symptoms started
  
  // Triage Data
  triageStartedAt?: string;
  triageCompletedAt?: string;
  triageNurseId?: string;
  
  // Vitals (from triage)
  temperature?: number;          // °C
  heartRate?: number;            // bpm
  respiratoryRate?: number;      // breaths/min
  systolicBP?: number;           // mmHg
  diastolicBP?: number;          // mmHg
  oxygenSaturation?: number;     // %
  painLevel?: number;            // 0-10
  glucoseLevel?: number;         // mg/dL
  gcsEye?: number;               // 1-4
  gcsVerbal?: number;            // 1-5
  gcsMotor?: number;             // 1-6
  
  // ABCDE Findings (JSON)
  abcdeAirway?: string;          // JSON: { patent: boolean, interventions: string[] }
  abcdeBreathing?: string;       // JSON: { findings: string[], interventions: string[] }
  abcdeCirculation?: string;     // JSON: { findings: string[], interventions: string[] }
  abcdeDisability?: string;      // JSON: { findings: string[], interventions: string[] }
  abcdeExposure?: string;        // JSON: { findings: string[], interventions: string[] }
  
  // Calculated Scores
  newsScore?: number;            // 0-20
  gcsScore?: number;             // 3-15
  qsofaScore?: number;           // 0-3
  esiLevel?: number;             // 1-5
  
  // Orientation
  suggestedOrientation?: Orientation;
  orientationSource?: OrientationSource;
  finalOrientation?: Orientation;
  orientationOverrideReason?: string;
  
  // Assignment
  assignedBoxId?: string;
  assignedDoctorId?: string;

  // Treatment Tracking
  treatmentStartedAt?: string;
  treatmentNurseId?: string;
  treatmentNotes?: string;         // JSON array of notes
  doctorAssignedAt?: string;

  // Discharge
  dischargedAt?: string;
  dischargedBy?: string;
  dischargeNotes?: string;
  dischargeType?: string;          // home, admission, transfer, left_ama, deceased

  // Re-triage
  retriageRequested?: boolean;
  retriageReason?: string;
  absentCallHistory?: string; // JSON: Array<{ timestamp: string, calledBy: string, type?: 'call' | 'recall' }>

  // Status & Tracking
  status: PatientStatus;
  registeredBy: string;
  createdAt: string;
  updatedAt: string;
}

// Request/Response types
export interface CreatePatientRequest {
  fullName: string;
  dateOfBirth: string;
  sex: Sex;
  nationalId?: string;
  idType?: IdType;
  nationality?: string;
  patientIdentityId?: string;
  phone?: string;
  address?: string;
  allergies?: string;
  chronicConditions?: string[];
  currentMedications?: string[];
  chiefComplaint?: string;
  symptomOnset?: string;
}

export interface LookupPatientResponse {
  found: boolean;
  identity?: PatientIdentity;
}

export interface UpdateMedicalHistoryRequest {
  chiefComplaint?: string;
  symptomOnset?: string;
  allergies?: string;
  chronicConditions?: string[];
  currentMedications?: string[];
  medicalHistoryNotes?: string;
  medicalHistory?: string;
  surgicalHistory?: string;
  obstetricHistory?: string;
}

export interface UpdateVitalsRequest {
  temperature?: number;
  heartRate?: number;
  respiratoryRate?: number;
  systolicBP?: number;
  diastolicBP?: number;
  oxygenSaturation?: number;
  painLevel?: number;
  glucoseLevel?: number;
  gcsEye?: number;
  gcsVerbal?: number;
  gcsMotor?: number;
}

export interface ABCDEAssessment {
  airway: {
    patent: boolean;
    obstructed: boolean;
    secretions: boolean;
    stridor: boolean;
    interventions: string[];
    notes?: string;
  };
  breathing: {
    respiratoryRate: number;
    oxygenSaturation: number;
    breathSounds: string;       // 'normal' | 'decreased' | 'wheezing' | 'crackles'
    workOfBreathing: string;    // 'normal' | 'increased' | 'severe'
    cyanosis: boolean;
    interventions: string[];
    notes?: string;
  };
  circulation: {
    heartRate: number;
    bloodPressure: string;      // "120/80"
    capillaryRefill: number;    // seconds
    skinColor: string;          // 'normal' | 'pale' | 'cyanotic' | 'mottled'
    peripheralPulses: string;   // 'strong' | 'weak' | 'absent'
    bleeding: boolean;
    interventions: string[];
    notes?: string;
  };
  disability: {
    gcsEye: number;
    gcsVerbal: number;
    gcsMotor: number;
    pupils: string;             // 'PEARL' | 'unequal' | 'dilated' | 'constricted'
    motorResponse: string;      // 'normal' | 'weakness' | 'paralysis'
    glucoseLevel?: number;
    interventions: string[];
    notes?: string;
  };
  exposure: {
    temperature: number;
    rash: boolean;
    wounds: boolean;
    edema: boolean;
    findings: string[];
    interventions: string[];
    notes?: string;
  };
}

export interface UpdateABCDERequest {
  category: 'A' | 'B' | 'C' | 'D' | 'E';
  data: Partial<ABCDEAssessment[keyof ABCDEAssessment]>;
}

export interface CompleteTriageRequest {
  esiLevel: number;
  suggestedOrientation?: Orientation;
  orientationSource?: OrientationSource;
  finalOrientation: Orientation;
  overrideReason?: string;
}
