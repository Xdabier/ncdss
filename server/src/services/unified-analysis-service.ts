/**
 * Unified Analysis Service
 * Manages persistence and generation of unified LLM clinical analysis results
 */

import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb } from '../database';
import { unifiedAnalysis, patients } from '../database/schema';
import { UnifiedAnalysisContext, UnifiedAnalysisResult } from './llm';
import { calculateAge } from '@ncdss/shared';

/**
 * Get saved unified analysis for a patient (most recent row)
 */
export async function getByPatientId(patientId: string) {
  const db = getDb();
  const [result] = await db.select()
    .from(unifiedAnalysis)
    .where(eq(unifiedAnalysis.patientId, patientId));

  return result || null;
}

/**
 * Create or update unified analysis record with 'generating' status
 */
export async function createOrUpdate(
  patientId: string,
  userId: string,
  triggerSource: string
): Promise<string> {
  const db = getDb();
  const now = new Date().toISOString();

  const [existing] = await db.select()
    .from(unifiedAnalysis)
    .where(eq(unifiedAnalysis.patientId, patientId));

  if (existing) {
    await db.update(unifiedAnalysis).set({
      status: 'generating',
      result: null,
      errorMessage: null,
      generatedBy: userId,
      triggerSource,
      updatedAt: now
    }).where(eq(unifiedAnalysis.id, existing.id));

    return existing.id;
  } else {
    const id = randomUUID();
    await db.insert(unifiedAnalysis).values({
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
 * Save completed unified analysis result
 */
export async function saveResult(
  patientId: string,
  result: UnifiedAnalysisResult
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  await db.update(unifiedAnalysis).set({
    status: 'completed',
    result: JSON.stringify(result.analysis),
    generatedAt: result.generatedAt,
    errorMessage: null,
    updatedAt: now
  }).where(eq(unifiedAnalysis.patientId, patientId));
}

/**
 * Update status (e.g., to 'failed')
 */
export async function updateStatus(
  patientId: string,
  status: string,
  errorMessage?: string
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  const [existing] = await db.select()
    .from(unifiedAnalysis)
    .where(eq(unifiedAnalysis.patientId, patientId));

  if (existing) {
    await db.update(unifiedAnalysis).set({
      status,
      errorMessage: errorMessage || null,
      updatedAt: now
    }).where(eq(unifiedAnalysis.id, existing.id));
  }
}

/**
 * Build UnifiedAnalysisContext from a patient DB row
 */
export function buildUnifiedContext(patient: typeof patients.$inferSelect): UnifiedAnalysisContext {
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
      oxygenSaturation: patient.oxygenSaturation ?? undefined,
      painLevel: patient.painLevel ?? undefined
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
