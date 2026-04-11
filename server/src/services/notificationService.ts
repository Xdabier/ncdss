import { randomUUID } from 'crypto';
import { and, eq, lte, isNotNull } from 'drizzle-orm';
import { getDb } from '../database';
import { notifications, users } from '../database/schema';
import { NotificationType, NotificationPriority } from '@ncdss/shared';

// ============================================================================
// CORE
// ============================================================================

export async function createNotification(data: {
  userId: string;
  type: NotificationType | string;
  title: string;
  message: string;
  priority: NotificationPriority | string;
  relatedPatientId?: string | null;
  relatedBoxId?: string | null;
  metadata?: Record<string, unknown> | null;
  expiresAt?: string | null;
}): Promise<string> {
  const db = getDb();
  const id = randomUUID();

  await db.insert(notifications).values({
    id,
    userId: data.userId,
    type: data.type,
    title: data.title,
    message: data.message,
    priority: data.priority,
    relatedPatientId: data.relatedPatientId ?? null,
    relatedBoxId: data.relatedBoxId ?? null,
    metadata: data.metadata ? JSON.stringify(data.metadata) : null,
    expiresAt: data.expiresAt ?? null,
    isRead: false,
    createdAt: new Date().toISOString(),
  });

  return id;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Notify a doctor that a patient has been assigned to them.
 */
export async function notifyDoctorPatientAssigned(
  doctorId: string,
  patientId: string,
  patientName: string,
  boxName: string,
  esiLevel: number | null
): Promise<void> {
  const priority = esiLevel && esiLevel <= 2
    ? NotificationPriority.CRITICAL
    : esiLevel === 3
      ? NotificationPriority.HIGH
      : NotificationPriority.MEDIUM;

  await createNotification({
    userId: doctorId,
    type: NotificationType.PATIENT_ASSIGNED,
    title: `Nouveau patient: ${patientName}`,
    message: esiLevel
      ? `ESI ${esiLevel} - Assign\u00e9 \u00e0 ${boxName}`
      : `Assign\u00e9 \u00e0 ${boxName}`,
    priority,
    relatedPatientId: patientId,
  });
}

/**
 * Notify relevant staff about a critical patient (ESI 1-2).
 */
export async function notifyCriticalPatient(
  userIds: string[],
  patientId: string,
  patientName: string,
  reason: string
): Promise<void> {
  for (const userId of userIds) {
    await createNotification({
      userId,
      type: NotificationType.CRITICAL_PATIENT,
      title: `CRITIQUE: ${patientName}`,
      message: reason,
      priority: NotificationPriority.CRITICAL,
      relatedPatientId: patientId,
    });
  }
}

/**
 * Notify a doctor that their shift is ending with patients still assigned.
 */
export async function notifyShiftEnding(
  doctorId: string,
  boxName: string,
  endTime: string,
  patientCount: number,
  relatedBoxId?: string | null
): Promise<void> {
  const formattedTime = formatTime(endTime);

  await createNotification({
    userId: doctorId,
    type: NotificationType.SHIFT_ENDING,
    title: 'Votre garde se termine bient\u00f4t',
    message: `Vous avez encore ${patientCount} patient(s) assign\u00e9(s) (${boxName}). Fin de garde: ${formattedTime}`,
    priority: patientCount > 0 ? NotificationPriority.HIGH : NotificationPriority.MEDIUM,
    relatedBoxId: relatedBoxId ?? null,
    expiresAt: endTime,
  });
}

/**
 * Notify treatment nurses that triage is complete and patient is ready.
 */
export async function notifyTriageComplete(
  treatmentNurseIds: string[],
  patientId: string,
  patientName: string,
  esiLevel: number | null,
  orientation: string | null
): Promise<void> {
  const priority = esiLevel && esiLevel <= 2
    ? NotificationPriority.HIGH
    : NotificationPriority.MEDIUM;

  const orientationLabel = orientation || 'Non d\u00e9finie';
  const esiLabel = esiLevel ? `ESI ${esiLevel}` : 'ESI non d\u00e9fini';

  for (const nurseId of treatmentNurseIds) {
    await createNotification({
      userId: nurseId,
      type: NotificationType.TRIAGE_COMPLETE,
      title: `Triage termin\u00e9: ${patientName}`,
      message: `${esiLabel} - Orientation: ${orientationLabel}`,
      priority,
      relatedPatientId: patientId,
    });
  }
}

/**
 * Notify supervisors about orphaned patients (doctor shift ended).
 */
export async function notifyOrphanedPatients(
  orphaned: Array<{ patientId: string; patientName: string; doctorName: string }>
): Promise<void> {
  const db = getDb();

  const supervisors = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.role, 'NURSE_SUPERVISOR'),
        eq(users.isActive, true)
      )
    );

  for (const supervisor of supervisors) {
    await createNotification({
      userId: supervisor.id,
      type: NotificationType.ORPHANED_PATIENTS,
      title: `${orphaned.length} patient(s) sans m\u00e9decin`,
      message: orphaned
        .map((p) => `${p.patientName} (ex-Dr. ${p.doctorName})`)
        .join(', '),
      priority: NotificationPriority.CRITICAL,
    });
  }
}

/**
 * Notify treatment nurses that a patient has been redirected for treatment.
 */
export async function notifyTreatmentRedirect(
  nurseIds: string[],
  patientId: string,
  patientName: string,
  esiLevel: number | null,
  requiresRoleSwitch: boolean
): Promise<void> {
  const priority = esiLevel && esiLevel <= 2
    ? NotificationPriority.HIGH
    : NotificationPriority.MEDIUM;

  for (const nurseId of nurseIds) {
    await createNotification({
      userId: nurseId,
      type: NotificationType.TREATMENT_REDIRECT,
      title: `Patient redirig\u00e9: ${patientName}`,
      message: `${esiLevel ? 'ESI ' + esiLevel + ' \u2014 ' : ''}Prescriptions/examens \u00e0 r\u00e9aliser`,
      priority,
      relatedPatientId: patientId,
      metadata: requiresRoleSwitch ? { requiresRoleSwitch: true } : null,
    });
  }
}

/**
 * Notify a doctor that treatment is complete and the patient is ready to resume consultation.
 */
export async function notifyDoctorTreatmentComplete(
  doctorId: string,
  patientId: string,
  patientName: string
): Promise<void> {
  await createNotification({
    userId: doctorId,
    type: NotificationType.TREATMENT_COMPLETE,
    title: `Soins terminés: ${patientName}`,
    message: `Le patient ${patientName} est prêt à reprendre la consultation.`,
    priority: NotificationPriority.HIGH,
    relatedPatientId: patientId,
  });
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Delete expired notifications. Returns the number of deleted rows.
 */
export async function cleanupExpiredNotifications(): Promise<number> {
  const db = getDb();
  const now = new Date().toISOString();

  const result = await db
    .delete(notifications)
    .where(
      and(
        isNotNull(notifications.expiresAt),
        lte(notifications.expiresAt, now)
      )
    );

  return (result as any).changes ?? 0;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return isoString;
  }
}
