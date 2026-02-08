/**
 * AI Pre-Diagnosis Service
 * Manages persistence and background generation of AI pre-diagnosis results
 */

import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb } from '../database';
import { aiPrediagnosis, patients } from '../database/schema';
import { getLLMProvider, PreDiagnosisContext, PreDiagnosisSuggestion } from './llm';
import { calculateAge } from '@ncdss/shared';

export type AIPreDiagnosisStatus = 'pending' | 'generating' | 'completed' | 'failed';
export type AITriggerSource = 'manual_nurse' | 'manual_doctor' | 'auto_triage_complete';

export interface SavedAIPreDiagnosis {
  id: string;
  patientId: string;
  status: AIPreDiagnosisStatus;
  suggestions: string | null;
  recommendedTests: string | null;
  warnings: string | null;
  thinkingTrace: string | null;
  thinkingEnabled: boolean | null;
  errorMessage: string | null;
  generatedBy: string | null;
  triggerSource: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Queue to track ongoing generation requests
const generationQueue: Map<string, AbortController> = new Map();

/**
 * Get saved pre-diagnosis for a patient
 */
export async function getByPatientId(patientId: string): Promise<SavedAIPreDiagnosis | null> {
  const db = getDb();
  const [result] = await db.select()
    .from(aiPrediagnosis)
    .where(eq(aiPrediagnosis.patientId, patientId));

  return result as SavedAIPreDiagnosis | null;
}

/**
 * Create or update pre-diagnosis record with 'generating' status
 */
export async function createOrUpdate(
  patientId: string,
  userId: string | null,
  triggerSource: AITriggerSource
): Promise<string> {
  const db = getDb();
  const now = new Date().toISOString();

  // Check if record exists
  const [existing] = await db.select()
    .from(aiPrediagnosis)
    .where(eq(aiPrediagnosis.patientId, patientId));

  if (existing) {
    // Update existing record
    await db.update(aiPrediagnosis).set({
      status: 'generating',
      generatedBy: userId,
      triggerSource,
      errorMessage: null,
      updatedAt: now
    }).where(eq(aiPrediagnosis.id, existing.id));

    return existing.id;
  } else {
    // Create new record
    const id = randomUUID();
    await db.insert(aiPrediagnosis).values({
      id,
      patientId,
      status: 'generating',
      generatedBy: userId,
      triggerSource,
      createdAt: now,
      updatedAt: now
    });

    return id;
  }
}

/**
 * Save completed pre-diagnosis result
 */
export async function saveResult(
  patientId: string,
  result: PreDiagnosisSuggestion
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  // Check if record exists
  const [existing] = await db.select()
    .from(aiPrediagnosis)
    .where(eq(aiPrediagnosis.patientId, patientId));

  const updateData = {
    status: 'completed' as const,
    suggestions: JSON.stringify(result.suggestions),
    recommendedTests: result.recommendedTests ? JSON.stringify(result.recommendedTests) : null,
    warnings: result.warnings ? JSON.stringify(result.warnings) : null,
    thinkingTrace: result.thinkingTrace || null,
    thinkingEnabled: result.thinkingEnabled,
    generatedAt: result.generatedAt,
    errorMessage: null,
    updatedAt: now
  };

  if (existing) {
    await db.update(aiPrediagnosis).set(updateData).where(eq(aiPrediagnosis.id, existing.id));
  } else {
    // Create record if it doesn't exist (shouldn't happen normally)
    const id = randomUUID();
    await db.insert(aiPrediagnosis).values({
      id,
      patientId,
      ...updateData,
      createdAt: now
    });
  }
}

/**
 * Update status for failed generation
 */
export async function updateStatus(
  patientId: string,
  status: AIPreDiagnosisStatus,
  errorMessage?: string
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  const [existing] = await db.select()
    .from(aiPrediagnosis)
    .where(eq(aiPrediagnosis.patientId, patientId));

  if (existing) {
    await db.update(aiPrediagnosis).set({
      status,
      errorMessage: errorMessage || null,
      updatedAt: now
    }).where(eq(aiPrediagnosis.id, existing.id));
  }
}

/**
 * Build PreDiagnosisContext from patient data
 */
function buildContext(patient: any): PreDiagnosisContext {
  const age = patient.dateOfBirth ? calculateAge(patient.dateOfBirth) : patient.age;
  return {
    chiefComplaint: patient.chiefComplaint || '',
    age,
    sex: patient.sex,
    vitals: {
      temperature: patient.temperature ?? undefined,
      heartRate: patient.heartRate ?? undefined,
      respiratoryRate: patient.respiratoryRate ?? undefined,
      bloodPressure: patient.systolicBP && patient.diastolicBP
        ? `${patient.systolicBP}/${patient.diastolicBP}`
        : undefined,
      oxygenSaturation: patient.oxygenSaturation ?? undefined
    },
    abcdeFindings: {
      airway: patient.abcdeAirway ? JSON.parse(patient.abcdeAirway) : undefined,
      breathing: patient.abcdeBreathing ? JSON.parse(patient.abcdeBreathing) : undefined,
      circulation: patient.abcdeCirculation ? JSON.parse(patient.abcdeCirculation) : undefined,
      disability: patient.abcdeDisability ? JSON.parse(patient.abcdeDisability) : undefined,
      exposure: patient.abcdeExposure ? JSON.parse(patient.abcdeExposure) : undefined
    },
    scores: {
      news: patient.newsScore ?? undefined,
      gcs: patient.gcsScore ?? undefined,
      qsofa: patient.qsofaScore ?? undefined
    },
    medicalHistory: patient.chronicConditions
      ? patient.chronicConditions.split(',').map((s: string) => s.trim())
      : undefined,
    allergies: patient.allergies ?? undefined
  };
}

/**
 * Run the actual generation (called internally)
 */
async function runGeneration(
  patientId: string,
  userId: string | null,
  triggerSource: AITriggerSource,
  signal: AbortSignal
): Promise<void> {
  try {
    const db = getDb();

    // Set status to 'generating'
    await createOrUpdate(patientId, userId, triggerSource);

    // Load patient data
    const [patient] = await db.select().from(patients).where(eq(patients.id, patientId));

    if (!patient) {
      await updateStatus(patientId, 'failed', 'Patient non trouve');
      return;
    }

    // Check abort
    if (signal.aborted) return;

    // Build context
    const context = buildContext(patient);

    // Get LLM provider
    const llm = getLLMProvider();

    // Check availability
    const available = await llm.isAvailable();
    if (!available) {
      await updateStatus(patientId, 'failed', 'Service LLM non disponible');
      return;
    }

    // Check abort
    if (signal.aborted) return;

    // Generate pre-diagnosis
    const result = await llm.generatePreDiagnosis(context);

    // Check abort before saving
    if (!signal.aborted) {
      await saveResult(patientId, result);
    }
  } catch (error: any) {
    if (!signal.aborted) {
      console.error('AI pre-diagnosis generation error:', error);
      await updateStatus(patientId, 'failed', error.message || 'Erreur lors de la generation');
    }
  }
}

/**
 * Trigger background generation (non-blocking)
 * If generation is already in progress for this patient, cancels the previous one
 */
export function triggerBackgroundGeneration(
  patientId: string,
  userId: string | null,
  triggerSource: AITriggerSource
): void {
  // Cancel existing generation for this patient
  const existingController = generationQueue.get(patientId);
  if (existingController) {
    existingController.abort();
  }

  // Create new abort controller
  const controller = new AbortController();
  generationQueue.set(patientId, controller);

  // Fire and forget - don't await
  runGeneration(patientId, userId, triggerSource, controller.signal)
    .finally(() => {
      // Only remove from queue if it's still our controller
      if (generationQueue.get(patientId) === controller) {
        generationQueue.delete(patientId);
      }
    });
}

/**
 * Check if generation is currently in progress for a patient
 */
export function isGenerating(patientId: string): boolean {
  return generationQueue.has(patientId);
}

/**
 * Cancel ongoing generation for a patient
 */
export function cancelGeneration(patientId: string): boolean {
  const controller = generationQueue.get(patientId);
  if (controller) {
    controller.abort();
    generationQueue.delete(patientId);
    return true;
  }
  return false;
}
