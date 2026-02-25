import { Router } from 'express';
import { eq, and, ne, sql, inArray } from 'drizzle-orm';
import { getDb } from '../../database';
import { patients, patientIdentities, users, boxes } from '../../database/schema';
import { calculateAge } from '@ncdss/shared';

const router = Router();

// GET /api/tracking/board - Get all active patients for tracking display
router.get('/board', async (req, res) => {
  try {
    const db = getDb();

    // Show all non-discharged patients regardless of creation date.
    // Patients still in the ER overnight must remain visible.
    const trackingData = await db
      .select({
        id: patients.id,
        fullName: sql<string>`COALESCE(${patientIdentities.fullName}, ${patients.fullName})`.as('full_name'),
        dateOfBirth: sql<string | null>`COALESCE(${patientIdentities.dateOfBirth}, ${patients.dateOfBirth})`.as('date_of_birth'),
        age: patients.age,
        sex: sql<string>`COALESCE(${patientIdentities.sex}, ${patients.sex})`.as('sex'),
        nationalId: sql<string | null>`COALESCE(${patientIdentities.idNumber}, ${patients.nationalId})`.as('national_id'),
        nationality: sql<string | null>`COALESCE(${patientIdentities.nationality}, ${patients.nationality})`.as('nationality'),
        patientIdentityId: patients.patientIdentityId,
        chiefComplaint: patients.chiefComplaint,
        status: patients.status,
        esiLevel: patients.esiLevel,
        newsScore: patients.newsScore,
        gcsScore: patients.gcsScore,
        finalOrientation: patients.finalOrientation,
        createdAt: patients.createdAt,
        triageStartedAt: patients.triageStartedAt,
        triageCompletedAt: patients.triageCompletedAt,
        treatmentStartedAt: patients.treatmentStartedAt,
        assignedBoxId: patients.assignedBoxId,
        assignedDoctorId: patients.assignedDoctorId,
        retriageRequested: patients.retriageRequested,
        boxName: boxes.name,
        boxType: boxes.boxType,
        doctorName: users.fullName,
      })
      .from(patients)
      .leftJoin(patientIdentities, eq(patients.patientIdentityId, patientIdentities.id))
      .leftJoin(boxes, eq(patients.assignedBoxId, boxes.id))
      .leftJoin(users, eq(patients.assignedDoctorId, users.id))
      .where(ne(patients.status, 'DISCHARGED'))
      .orderBy(
        sql`CASE
          WHEN ${patients.esiLevel} = 1 THEN 1
          WHEN ${patients.esiLevel} = 2 THEN 2
          WHEN ${patients.esiLevel} = 3 THEN 3
          WHEN ${patients.esiLevel} = 4 THEN 4
          WHEN ${patients.esiLevel} = 5 THEN 5
          ELSE 6 END`,
        patients.createdAt
      );

    // Calculate time in department and compute age from dateOfBirth
    const now = new Date();
    type TrackingPatient = typeof trackingData[number];
    const enrichedData = trackingData.map((p: TrackingPatient) => {
      const arrivalTime = new Date(p.createdAt);
      const timeInDeptMinutes = Math.floor(
        (now.getTime() - arrivalTime.getTime()) / 60000
      );

      const computedAge = p.dateOfBirth ? calculateAge(p.dateOfBirth) : p.age;

      return {
        ...p,
        age: computedAge,
        timeInDeptMinutes,
        timeInDeptFormatted: formatDuration(timeInDeptMinutes),
        isOverdue: timeInDeptMinutes > 240,
        isWarning: timeInDeptMinutes > 120 && timeInDeptMinutes <= 240,
        isCritical: p.esiLevel != null && p.esiLevel <= 2,
      };
    });

    res.json(enrichedData);
  } catch (error) {
    console.error('Tracking board error:', error);
    res.status(500).json({ error: 'Erreur serveur lors du chargement du tableau de suivi' });
  }
});

// GET /api/tracking/stats - Aggregate statistics for tracking display
router.get('/stats', async (req, res) => {
  try {
    const db = getDb();

    // Stats reflect all active (non-discharged) patients, matching the board view.
    // Count by status (include DISCHARGED for completeness but exclude from totals below)
    const statusCounts = await db
      .select({
        status: patients.status,
        count: sql<number>`count(*)`,
      })
      .from(patients)
      .where(ne(patients.status, 'DISCHARGED'))
      .groupBy(patients.status);

    // Count critical (ESI 1-2) among non-discharged
    const criticalResult = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(patients)
      .where(
        and(
          ne(patients.status, 'DISCHARGED'),
          inArray(patients.esiLevel, [1, 2])
        )
      );

    // Count by ESI among non-discharged
    const esiCounts = await db
      .select({
        esiLevel: patients.esiLevel,
        count: sql<number>`count(*)`,
      })
      .from(patients)
      .where(ne(patients.status, 'DISCHARGED'))
      .groupBy(patients.esiLevel);

    const byStatus: Record<string, number> = {};
    statusCounts.forEach((s: { status: string; count: number }) => {
      byStatus[s.status] = Number(s.count);
    });

    const byEsi: Record<string, number> = {};
    esiCounts.forEach((e: { esiLevel: number | null; count: number }) => {
      byEsi[e.esiLevel != null ? String(e.esiLevel) : 'unknown'] = Number(e.count);
    });

    const total = statusCounts.reduce(
      (sum: number, s: { status: string; count: number }) =>
        sum + Number(s.count),
      0
    );

    res.json({
      byStatus,
      byEsi,
      critical: Number(criticalResult[0]?.count) || 0,
      total,
    });
  } catch (error) {
    console.error('Tracking stats error:', error);
    res.status(500).json({ error: 'Erreur serveur lors du chargement des statistiques de suivi' });
  }
});

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h${mins.toString().padStart(2, '0')}`;
}

export { router as trackingRouter };
