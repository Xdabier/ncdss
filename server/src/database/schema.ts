import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ============================================================================
// USERS & AUTHENTICATION
// ============================================================================

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name').notNull(),
  role: text('role').notNull(), // NURSE, NURSE_SUPERVISOR, DOCTOR, ADMIN, SUPER_ADMIN
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const refreshTokens = sqliteTable('refresh_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  revokedAt: text('revoked_at'),
});

// ============================================================================
// WEEKLY SCHEDULE (Nurse Role Assignments)
// ============================================================================

export const weeklySchedule = sqliteTable('weekly_schedule', {
  id: text('id').primaryKey(),
  nurseId: text('nurse_id')
    .notNull()
    .references(() => users.id),
  weekStart: text('week_start').notNull(), // Monday date (YYYY-MM-DD)
  dayOfWeek: integer('day_of_week').notNull(), // 0=Mon, 6=Sun
  assignedRole: text('assigned_role').notNull(), // INSCRIPTION, TRIAGE, TREATMENT, OFF
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// ============================================================================
// ER CONFIGURATION
// ============================================================================

export const erConfiguration = sqliteTable('er_configuration', {
  id: text('id').primaryKey(),
  inscriptionDesks: integer('inscription_desks').notNull().default(2),
  triageBoxes: integer('triage_boxes').notNull().default(2),
  medicalBoxes: integer('medical_boxes').notNull().default(4),
  surgicalBoxes: integer('surgical_boxes').notNull().default(2),
  traumaBoxes: integer('trauma_boxes').notNull().default(2),
  sauvBeds: integer('sauv_beds').notNull().default(4),
  updatedBy: text('updated_by').references(() => users.id),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const boxes = sqliteTable('boxes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  boxType: text('box_type').notNull(), // TRIAGE, MEDICAL, SURGICAL, TRAUMA, SAUV
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});

export const boxAssignments = sqliteTable('box_assignments', {
  id: text('id').primaryKey(),
  boxId: text('box_id')
    .notNull()
    .references(() => boxes.id),
  doctorId: text('doctor_id')
    .notNull()
    .references(() => users.id),
  shift: text('shift').notNull(), // MORNING, AFTERNOON, NIGHT
  effectiveDate: text('effective_date').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});

// ============================================================================
// PATIENTS (Basic structure - will expand in Week 2)
// ============================================================================

export const patients = sqliteTable('patients', {
  id: text('id').primaryKey(),
  
  // Demographics
  fullName: text('full_name').notNull(),
  age: integer('age').notNull(),
  sex: text('sex').notNull(), // MALE, FEMALE
  nationalId: text('national_id'),
  phone: text('phone'),
  address: text('address'),
  
  // Medical History
  allergies: text('allergies'),
  chronicConditions: text('chronic_conditions'), // JSON array
  currentMedications: text('current_medications'), // JSON array
  
  // Chief Complaint (from inscription - symptom-based, not diagnosis)
  chiefComplaint: text('chief_complaint'),                   // Free text or selected from presenting_complaints
  chiefComplaintId: integer('chief_complaint_id'),           // FK to presenting_complaints if selected
  chiefComplaintCategory: text('chief_complaint_category'),  // Category for quick reference
  symptomOnset: text('symptom_onset'),
  
  // Triage Tracking
  triageStartedAt: text('triage_started_at'),
  triageCompletedAt: text('triage_completed_at'),
  triageNurseId: text('triage_nurse_id').references(() => users.id),
  
  // Vitals
  temperature: real('temperature'),
  heartRate: integer('heart_rate'),
  respiratoryRate: integer('respiratory_rate'),
  systolicBP: integer('systolic_bp'),
  diastolicBP: integer('diastolic_bp'),
  oxygenSaturation: integer('oxygen_saturation'),
  painLevel: integer('pain_level'),
  glucoseLevel: real('glucose_level'),
  gcsEye: integer('gcs_eye'),
  gcsVerbal: integer('gcs_verbal'),
  gcsMotor: integer('gcs_motor'),
  
  // ABCDE Findings (JSON)
  abcdeAirway: text('abcde_airway'),
  abcdeBreathing: text('abcde_breathing'),
  abcdeCirculation: text('abcde_circulation'),
  abcdeDisability: text('abcde_disability'),
  abcdeExposure: text('abcde_exposure'),
  
  // Calculated Scores
  newsScore: integer('news_score'),
  gcsScore: integer('gcs_score'),
  qsofaScore: integer('qsofa_score'),
  esiLevel: integer('esi_level'),
  
  // Clinical Decision Support Results
  matchedPathologies: text('matched_pathologies'),           // JSON: array of matched pathology results
  suggestedNursingInterventions: text('suggested_nursing_interventions'), // JSON array
  suggestedMedicalInterventions: text('suggested_medical_interventions'), // JSON array
  analysisTimestamp: text('analysis_timestamp'),             // When analysis was performed

  // Orientation
  suggestedOrientation: text('suggested_orientation'),
  orientationSource: text('orientation_source'),
  orientationReason: text('orientation_reason'),             // Why this orientation was suggested
  finalOrientation: text('final_orientation'),
  orientationOverrideReason: text('orientation_override_reason'),
  
  // Assignment
  assignedBoxId: text('assigned_box_id').references(() => boxes.id),
  assignedDoctorId: text('assigned_doctor_id').references(() => users.id),

  // Treatment Tracking
  treatmentStartedAt: text('treatment_started_at'),
  treatmentNurseId: text('treatment_nurse_id').references(() => users.id),
  treatmentNotes: text('treatment_notes'),                 // JSON array of notes
  doctorAssignedAt: text('doctor_assigned_at'),

  // Discharge
  dischargedAt: text('discharged_at'),
  dischargedBy: text('discharged_by').references(() => users.id),
  dischargeNotes: text('discharge_notes'),
  dischargeType: text('discharge_type'),                   // home, admission, transfer, left_ama, deceased

  // Re-triage
  retriageRequested: integer('retriage_requested', { mode: 'boolean' }).default(false),
  retriageReason: text('retriage_reason'),

  // Status & Tracking
  status: text('status').notNull().default('REGISTERED'), // REGISTERED, IN_TRIAGE, TRIAGED, IN_TREATMENT, WITH_DOCTOR, DISCHARGED
  registeredBy: text('registered_by').notNull().references(() => users.id),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// ============================================================================
// SYNC TRACKING
// ============================================================================

export const syncLog = sqliteTable('sync_log', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull(),
  tableName: text('table_name').notNull(),
  recordId: text('record_id').notNull(),
  operation: text('operation').notNull(), // INSERT, UPDATE, DELETE
  syncedAt: text('synced_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// ============================================================================
// AUDIT LOG
// ============================================================================

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  action: text('action').notNull(),
  tableName: text('table_name'),
  recordId: text('record_id'),
  oldValues: text('old_values'), // JSON
  newValues: text('new_values'), // JSON
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// ============================================================================
// PRESENTING COMPLAINTS (Motifs de consultation - Reference Data)
// These are SYMPTOMS/PRESENTATIONS, not diagnoses
// Used at registration to categorize chief complaints
// ============================================================================

export const presentingComplaints = sqliteTable('presenting_complaints', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),                    // French name: "Douleur thoracique"
  nameNormalized: text('name_normalized').notNull(),        // Normalized: "douleur thoracique"
  category: text('category').notNull(),                     // Original: 'Médical / SAUV', 'Chirurgical', etc.
  primaryOrientation: text('primary_orientation').notNull(), // Mapped: SAUV, MEDICAL, SURGICAL, TRAUMA
  secondaryOrientation: text('secondary_orientation'),       // For multi-category: the second option
  isMultiCategory: integer('is_multi_category', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// Keep old table name as alias for backward compatibility during migration
export const pathologyClassification = presentingComplaints;

// ============================================================================
// CLINICAL PATHOLOGIES (ABCDE Interventions - Reference Data)
// These are actual clinical conditions/diagnoses with their interventions
// Used during triage to match observed signs to probable pathologies
// ============================================================================

export const clinicalPathologies = sqliteTable('clinical_pathologies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pathologyName: text('pathology_name').notNull(),           // French name: "Asthme sévère"
  pathologyNameNormalized: text('pathology_name_normalized').notNull(), // Normalized for matching
  abcdeCategory: text('abcde_category').notNull(),           // A, B, C, D, E, or GENERAL
  severitySigns: text('severity_signs'),                     // JSON array of severity signs
  nursingInterventions: text('nursing_interventions'),       // JSON array of nursing interventions
  medicalInterventions: text('medical_interventions'),       // JSON array of medical interventions
  dosageFormulas: text('dosage_formulas'),                   // Dosage calculation formulas
  orientation: text('orientation'),                          // Raw from Excel: "SAUV / Médical"
  primaryOrientation: text('primary_orientation'),           // Mapped: SAUV, MEDICAL, SURGICAL, TRAUMA
  secondaryOrientation: text('secondary_orientation'),       // For combined orientations
  isSAUV: integer('is_sauv', { mode: 'boolean' }).notNull().default(false), // Quick flag for critical
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// Keep old table name as alias for backward compatibility during migration
export const abcdeInterventions = clinicalPathologies;
