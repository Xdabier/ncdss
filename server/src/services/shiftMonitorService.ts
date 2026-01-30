import { and, eq, ne, gte, lte, isNotNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getDb } from '../database';
import { boxAssignments, boxes, patients, users, notifications } from '../database/schema';
import {
  notifyShiftEnding,
  notifyOrphanedPatients,
  createNotification,
} from './notificationService';
import { NotificationType, NotificationPriority } from '@ncdss/shared';

let monitorInterval: NodeJS.Timeout | null = null;

export function startShiftMonitor(): void {
  if (monitorInterval) return;

  // Check every 5 minutes
  monitorInterval = setInterval(() => {
    checkShifts().catch((err) => console.error('Shift monitor error:', err));
  }, 5 * 60 * 1000);

  // Run immediately on startup
  checkShifts().catch((err) => console.error('Shift monitor initial check error:', err));

  console.log('✓ Shift monitor started (5-minute interval)');
}

export function stopShiftMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log('✓ Shift monitor stopped');
  }
}

async function checkShifts(): Promise<void> {
  try {
    await checkEndingShifts();
    await checkOrphanedPatients();
  } catch (error) {
    console.error('Shift monitor check error:', error);
  }
}

// ============================================================================
// ENDING SHIFTS
// ============================================================================

async function checkEndingShifts(): Promise<void> {
  const db = getDb();
  const now = new Date();
  const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);
  const nowISO = now.toISOString();
  const futureISO = thirtyMinutesFromNow.toISOString();

  // Find shifts that are currently active AND ending within 30 minutes
  const endingShifts = await db
    .select({
      assignmentId: boxAssignments.id,
      doctorId: boxAssignments.doctorId,
      doctorName: users.fullName,
      boxId: boxAssignments.boxId,
      boxName: boxes.name,
      endDateTime: boxAssignments.endDateTime,
    })
    .from(boxAssignments)
    .innerJoin(users, eq(boxAssignments.doctorId, users.id))
    .innerJoin(boxes, eq(boxAssignments.boxId, boxes.id))
    .where(
      and(
        eq(boxAssignments.isActive, true),
        lte(boxAssignments.startDateTime, nowISO),
        gte(boxAssignments.endDateTime, nowISO),
        lte(boxAssignments.endDateTime, futureISO)
      )
    );

  for (const shift of endingShifts) {
    // Skip if we already notified for this shift recently
    const alreadyNotified = await wasShiftEndingNotified(shift.doctorId);
    if (alreadyNotified) continue;

    // Count non-discharged patients assigned to this doctor
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(patients)
      .where(
        and(
          eq(patients.assignedDoctorId, shift.doctorId),
          ne(patients.status, 'DISCHARGED')
        )
      );

    const patientCount = countResult[0]?.count ?? 0;
    if (patientCount === 0) continue;

    // Notify the doctor their shift is ending with patients
    await notifyShiftEnding(
      shift.doctorId,
      shift.boxName,
      shift.endDateTime,
      patientCount,
      shift.boxId
    );

    // Notify supervisors about the ending shift
    const supervisors = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, 'NURSE_SUPERVISOR'), eq(users.isActive, true)));

    for (const supervisor of supervisors) {
      await createNotification({
        userId: supervisor.id,
        type: NotificationType.SHIFT_ENDING,
        title: `Fin de garde: Dr. ${shift.doctorName}`,
        message: `${patientCount} patient(s) encore assigné(s) (${shift.boxName})`,
        priority: NotificationPriority.HIGH,
        relatedBoxId: shift.boxId,
        metadata: { doctorId: shift.doctorId, assignmentId: shift.assignmentId },
        expiresAt: shift.endDateTime,
      });
    }
  }
}

// ============================================================================
// ORPHANED PATIENTS
// ============================================================================

async function checkOrphanedPatients(): Promise<void> {
  const orphaned = await findOrphanedPatients();
  if (orphaned.length === 0) return;

  // Avoid duplicate notifications within 30 minutes
  const alreadyNotified = await wasOrphanedNotifiedRecently();
  if (alreadyNotified) return;

  await notifyOrphanedPatients(orphaned);
}

async function findOrphanedPatients(): Promise<
  Array<{ patientId: string; patientName: string; doctorName: string }>
> {
  const db = getDb();
  const now = new Date().toISOString();

  // Patients with an assigned doctor whose shift has ended (no active assignment)
  const result = await db
    .select({
      patientId: patients.id,
      patientName: patients.fullName,
      doctorName: users.fullName,
    })
    .from(patients)
    .innerJoin(users, eq(patients.assignedDoctorId, users.id))
    .where(
      and(
        isNotNull(patients.assignedDoctorId),
        ne(patients.status, 'DISCHARGED'),
        sql`NOT EXISTS (
          SELECT 1 FROM box_assignments
          WHERE box_assignments.doctor_id = patients.assigned_doctor_id
          AND box_assignments.is_active = 1
          AND box_assignments.start_date_time <= ${now}
          AND box_assignments.end_date_time > ${now}
        )`
      )
    );

  return result;
}

// ============================================================================
// DEDUPLICATION HELPERS
// ============================================================================

/**
 * Check if a SHIFT_ENDING notification was already sent for this doctor
 * within the last 30 minutes (to avoid repeated alerts every 5-min cycle).
 */
async function wasShiftEndingNotified(doctorId: string): Promise<boolean> {
  const db = getDb();
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const existing = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, doctorId),
        eq(notifications.type, 'SHIFT_ENDING'),
        gte(notifications.createdAt, thirtyMinAgo)
      )
    );

  return existing.length > 0;
}

/**
 * Check if an ORPHANED_PATIENTS notification was sent in the last 30 minutes.
 */
async function wasOrphanedNotifiedRecently(): Promise<boolean> {
  const db = getDb();
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const existing = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.type, 'ORPHANED_PATIENTS'),
        gte(notifications.createdAt, thirtyMinAgo)
      )
    );

  return existing.length > 0;
}
