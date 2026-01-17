import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
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
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const refreshTokens = sqliteTable('refresh_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  revokedAt: text('revoked_at')
});

// ============================================================================
// WEEKLY SCHEDULE (Nurse Role Assignments)
// ============================================================================

export const weeklySchedule = sqliteTable('weekly_schedule', {
  id: text('id').primaryKey(),
  nurseId: text('nurse_id').notNull().references(() => users.id),
  weekStart: text('week_start').notNull(), // Monday date (YYYY-MM-DD)
  dayOfWeek: integer('day_of_week').notNull(), // 0=Mon, 6=Sun
  assignedRole: text('assigned_role').notNull(), // INSCRIPTION, TRIAGE, TREATMENT, OFF
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`)
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
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const boxes = sqliteTable('boxes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  boxType: text('box_type').notNull(), // TRIAGE, MEDICAL, SURGICAL, TRAUMA, SAUV
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true)
});

export const boxAssignments = sqliteTable('box_assignments', {
  id: text('id').primaryKey(),
  boxId: text('box_id').notNull().references(() => boxes.id),
  doctorId: text('doctor_id').notNull().references(() => users.id),
  shift: text('shift').notNull(), // MORNING, AFTERNOON, NIGHT
  effectiveDate: text('effective_date').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true)
});

// ============================================================================
// PATIENTS (Basic structure - will expand in Week 2)
// ============================================================================

export const patients = sqliteTable('patients', {
  id: text('id').primaryKey(),
  fullName: text('full_name').notNull(),
  age: integer('age').notNull(),
  sex: text('sex').notNull(), // MALE, FEMALE
  chiefComplaint: text('chief_complaint'),
  status: text('status').notNull().default('REGISTERED'), // REGISTERED, IN_TRIAGE, TRIAGED, IN_TREATMENT, WITH_DOCTOR, DISCHARGED
  registeredBy: text('registered_by').references(() => users.id),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
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
  syncedAt: text('synced_at').notNull().default(sql`CURRENT_TIMESTAMP`)
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
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`)
});

// ============================================================================
// PATHOLOGY CLASSIFICATION (Reference Data)
// ============================================================================

export const pathologyClassification = sqliteTable('pathology_classification', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pathologyName: text('pathology_name').notNull().unique(),
  category: text('category').notNull(), // 'SAUV', 'Médical', 'Chirurgical', etc.
  primaryOrientation: text('primary_orientation').notNull(), // SAUV, MEDICAL, SURGICAL, TRAUMA
  isMultiCategory: integer('is_multi_category', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
});

// ============================================================================
// ABCDE INTERVENTIONS (Reference Data)
// ============================================================================

export const abcdeInterventions = sqliteTable('abcde_interventions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pathologyName: text('pathology_name').notNull(),
  abcdeCategory: text('abcde_category').notNull(), // A, B, C, D, E
  severitySigns: text('severity_signs'),
  nursingInterventions: text('nursing_interventions'),
  medicalInterventions: text('medical_interventions'),
  dosageFormulas: text('dosage_formulas'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
});
