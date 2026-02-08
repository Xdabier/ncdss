// ============================================================================
// COMPLEMENTARY EXAM TYPES
// ============================================================================

export enum ExamType {
  IMAGING = 'IMAGING',           // Imagerie (radio, scanner, IRM, echo)
  BLOOD_WORK = 'BLOOD_WORK',    // Bilan sanguin
  SAMPLE = 'SAMPLE',            // Prélèvement (urine, culture, etc.)
  OTHER = 'OTHER',              // Autre (ECG, etc.)
}

export enum ExamStatus {
  REQUESTED = 'REQUESTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum ExamPriority {
  NORMAL = 'NORMAL',
  URGENT = 'URGENT',
}

export enum ExamSource {
  DOCTOR = 'DOCTOR',
  AI_RECOMMENDATION = 'AI_RECOMMENDATION',
}

export interface ComplementaryExam {
  id: string;
  patientId: string;
  examName: string;
  examType: ExamType;
  status: ExamStatus;
  priority: ExamPriority;
  source: ExamSource;
  notes?: string;
  results?: string;
  requestedBy: string;
  requestedByName?: string;
  requestedAt: string;
  startedAt?: string;
  startedBy?: string;
  completedAt?: string;
  completedBy?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExamRequest {
  patientId: string;
  examName: string;
  examType: ExamType;
  priority?: ExamPriority;
  source?: ExamSource;
  notes?: string;
}

export interface UpdateExamStatusRequest {
  status: ExamStatus;
  results?: string;
  cancelReason?: string;
}
