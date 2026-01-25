import { Router } from 'express';
import { eq, and, gte, lte, sql, desc, asc } from 'drizzle-orm';
import { getDb } from '../../database';
import { patients, users, boxes } from '../../database/schema';

const router = Router();

// GET /api/stats/dashboard - Get dashboard statistics
router.get('/dashboard', async (req, res) => {
  try {
    const db = getDb();
    const { startDate, endDate, shift } = req.query;

    // Default to today
    let dateStart = new Date();
    dateStart.setHours(0, 0, 0, 0);
    let dateEnd = new Date();
    dateEnd.setHours(23, 59, 59, 999);

    // Parse date range if provided
    if (startDate) {
      dateStart = new Date(startDate as string);
      dateStart.setHours(0, 0, 0, 0);
    }
    if (endDate) {
      dateEnd = new Date(endDate as string);
      dateEnd.setHours(23, 59, 59, 999);
    }

    // Apply shift filter
    if (shift) {
      const shiftHours: Record<string, [number, number]> = {
        'MORNING': [7, 14],
        'AFTERNOON': [14, 21],
        'NIGHT': [21, 7]
      };
      const [startHour, endHour] = shiftHours[shift as string] || [0, 24];
      dateStart.setHours(startHour, 0, 0, 0);
      if (endHour > startHour) {
        dateEnd.setHours(endHour, 0, 0, 0);
      } else {
        // Night shift spans midnight
        dateEnd.setDate(dateEnd.getDate() + 1);
        dateEnd.setHours(endHour, 0, 0, 0);
      }
    }

    const startIso = dateStart.toISOString();
    const endIso = dateEnd.toISOString();

    // Patient counts by status for date range
    const patientStats = await db
      .select({
        status: patients.status,
        count: sql<number>`count(*)`,
      })
      .from(patients)
      .where(and(gte(patients.createdAt, startIso), lte(patients.createdAt, endIso)))
      .groupBy(patients.status);

    // Convert to object
    const statusCounts: Record<string, number> = {};
    patientStats.forEach((s: { status: string; count: number }) => {
      statusCounts[s.status] = Number(s.count);
    });

    // Calculate stats
    const totalToday = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    const waitingTriage = statusCounts['REGISTERED'] || 0;
    const inTriage = statusCounts['IN_TRIAGE'] || 0;
    const waitingTreatment = statusCounts['TRIAGED'] || 0;
    const inTreatment =
      (statusCounts['IN_TREATMENT'] || 0) + (statusCounts['WITH_DOCTOR'] || 0);
    const discharged = statusCounts['DISCHARGED'] || 0;

    // Critical patients (ESI 1-2 OR NEWS >= 7) - excluding discharged
    const criticalPatients = await db
      .select({ count: sql<number>`count(*)` })
      .from(patients)
      .where(
        and(
          gte(patients.createdAt, startIso),
          lte(patients.createdAt, endIso),
          sql`${patients.status} != 'DISCHARGED'`,
          sql`(${patients.esiLevel} <= 2 OR ${patients.newsScore} >= 7)`
        )
      );

    // Active staff count
    const activeStaff = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.isActive, true));

    // Active boxes count
    const activeBoxes = await db
      .select({ count: sql<number>`count(*)` })
      .from(boxes)
      .where(eq(boxes.isActive, true));

    // Average triage time (for completed triages)
    const avgTriageTime = await db
      .select({
        avgMinutes: sql<number>`AVG(
          (julianday(${patients.triageCompletedAt}) - julianday(${patients.triageStartedAt})) * 24 * 60
        )`,
      })
      .from(patients)
      .where(
        and(
          gte(patients.createdAt, startIso),
          lte(patients.createdAt, endIso),
          sql`${patients.triageCompletedAt} IS NOT NULL`,
          sql`${patients.triageStartedAt} IS NOT NULL`
        )
      );

    // Average wait time (from registration to triage start)
    const avgWaitTime = await db
      .select({
        avgMinutes: sql<number>`AVG(
          (julianday(${patients.triageStartedAt}) - julianday(${patients.createdAt})) * 24 * 60
        )`,
      })
      .from(patients)
      .where(
        and(
          gte(patients.createdAt, startIso),
          lte(patients.createdAt, endIso),
          sql`${patients.triageStartedAt} IS NOT NULL`
        )
      );

    // ESI distribution
    const esiDistribution = await db
      .select({
        esiLevel: patients.esiLevel,
        count: sql<number>`count(*)`,
      })
      .from(patients)
      .where(
        and(
          gte(patients.createdAt, startIso),
          lte(patients.createdAt, endIso),
          sql`${patients.esiLevel} IS NOT NULL`
        )
      )
      .groupBy(patients.esiLevel);

    // Orientation distribution
    const orientationDistribution = await db
      .select({
        orientation: patients.finalOrientation,
        count: sql<number>`count(*)`,
      })
      .from(patients)
      .where(
        and(
          gte(patients.createdAt, startIso),
          lte(patients.createdAt, endIso),
          sql`${patients.finalOrientation} IS NOT NULL`
        )
      )
      .groupBy(patients.finalOrientation);

    // Patients by hour
    const patientsByHour = await db
      .select({
        hour: sql<number>`CAST(strftime('%H', ${patients.createdAt}) AS INTEGER)`,
        count: sql<number>`count(*)`,
      })
      .from(patients)
      .where(and(gte(patients.createdAt, startIso), lte(patients.createdAt, endIso)))
      .groupBy(sql`strftime('%H', ${patients.createdAt})`);

    // Average passage time by orientation (from registration to discharge)
    const avgTimeByOrientation = await db
      .select({
        orientation: patients.finalOrientation,
        avgMinutes: sql<number>`AVG(
          (julianday(${patients.dischargedAt}) - julianday(${patients.createdAt})) * 24 * 60
        )`,
      })
      .from(patients)
      .where(
        and(
          gte(patients.createdAt, startIso),
          lte(patients.createdAt, endIso),
          sql`${patients.dischargedAt} IS NOT NULL`,
          sql`${patients.finalOrientation} IS NOT NULL`
        )
      )
      .groupBy(patients.finalOrientation);

    res.json({
      today: {
        total: totalToday,
        waitingTriage,
        inTriage,
        waitingTreatment,
        inTreatment,
        discharged,
        critical: Number(criticalPatients[0]?.count) || 0,
      },
      resources: {
        activeStaff: Number(activeStaff[0]?.count) || 0,
        activeBoxes: Number(activeBoxes[0]?.count) || 0,
      },
      performance: {
        avgTriageMinutes: Math.round(avgTriageTime[0]?.avgMinutes || 0),
        avgWaitMinutes: Math.round(avgWaitTime[0]?.avgMinutes || 0),
      },
      charts: {
        esiDistribution: esiDistribution.map((e: { esiLevel: number | null; count: number }) => ({
          esi: e.esiLevel,
          count: Number(e.count),
          name: `ESI ${e.esiLevel}`
        })),
        orientationDistribution: orientationDistribution.map((o: { orientation: string | null; count: number }) => ({
          orientation: o.orientation,
          count: Number(o.count)
        })),
        patientsByHour: patientsByHour.map((p: { hour: number; count: number }) => ({
          hour: p.hour,
          count: Number(p.count),
          label: `${p.hour}h`
        })).sort((a: { hour: number }, b: { hour: number }) => a.hour - b.hour),
        avgTimeByOrientation: avgTimeByOrientation.map((t: { orientation: string | null; avgMinutes: number }) => ({
          orientation: t.orientation,
          avgMinutes: Math.round(t.avgMinutes || 0)
        }))
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Erreur serveur lors du chargement des statistiques' });
  }
});

// GET /api/stats/queues - Get detailed queue information with patients
router.get('/queues', async (req, res) => {
  try {
    const db = getDb();

    // Get all non-discharged patients with details
    const allPatients = await db
      .select({
        id: patients.id,
        fullName: patients.fullName,
        age: patients.age,
        sex: patients.sex,
        status: patients.status,
        esiLevel: patients.esiLevel,
        newsScore: patients.newsScore,
        finalOrientation: patients.finalOrientation,
        chiefComplaint: patients.chiefComplaint,
        createdAt: patients.createdAt,
        triageStartedAt: patients.triageStartedAt,
        triageCompletedAt: patients.triageCompletedAt,
        treatmentStartedAt: patients.treatmentStartedAt,
        assignedBoxId: patients.assignedBoxId,
        assignedDoctorId: patients.assignedDoctorId,
        retriageRequested: patients.retriageRequested
      })
      .from(patients)
      .where(sql`${patients.status} != 'DISCHARGED'`)
      .orderBy(asc(patients.createdAt));

    // Define patient type for queue processing
    type QueuePatient = typeof allPatients[number] & {
      waitMinutes: number;
      isCritical: boolean;
      retriageRequested: boolean;
    };

    // Calculate wait time for each patient
    const now = new Date();
    type BasePatient = typeof allPatients[number];
    const patientsWithWaitTime: QueuePatient[] = allPatients.map((p: BasePatient) => {
      let waitStartTime: Date;

      switch (p.status) {
        case 'REGISTERED':
          waitStartTime = new Date(p.createdAt);
          break;
        case 'IN_TRIAGE':
          waitStartTime = new Date(p.triageStartedAt || p.createdAt);
          break;
        case 'TRIAGED':
          waitStartTime = new Date(p.triageCompletedAt || p.createdAt);
          break;
        case 'IN_TREATMENT':
          waitStartTime = new Date(p.treatmentStartedAt || p.triageCompletedAt || p.createdAt);
          break;
        case 'WITH_DOCTOR':
          waitStartTime = new Date(p.treatmentStartedAt || p.triageCompletedAt || p.createdAt);
          break;
        default:
          waitStartTime = new Date(p.createdAt);
      }

      const waitMinutes = Math.round((now.getTime() - waitStartTime.getTime()) / 60000);
      const isCritical = (p.esiLevel && p.esiLevel <= 2) || (p.newsScore && p.newsScore >= 7);

      return {
        ...p,
        waitMinutes,
        isCritical: !!isCritical,
        retriageRequested: p.retriageRequested || false
      };
    });

    // Group patients by status
    const queues = {
      inscription: patientsWithWaitTime.filter((p: QueuePatient) => p.status === 'REGISTERED'),
      triage: patientsWithWaitTime.filter((p: QueuePatient) => p.status === 'IN_TRIAGE'),
      waitingTreatment: patientsWithWaitTime.filter((p: QueuePatient) => p.status === 'TRIAGED'),
      inTreatment: patientsWithWaitTime.filter((p: QueuePatient) => p.status === 'IN_TREATMENT'),
      withDoctor: patientsWithWaitTime.filter((p: QueuePatient) => p.status === 'WITH_DOCTOR')
    };

    // Find longest waiting patient in each queue
    const getLongestWaiting = (queue: QueuePatient[]): QueuePatient | null => {
      if (queue.length === 0) return null;
      return queue.reduce((max: QueuePatient, p: QueuePatient) => p.waitMinutes > max.waitMinutes ? p : max);
    };

    res.json({
      queues: {
        inscription: {
          count: queues.inscription.length,
          patients: queues.inscription,
          longestWaitingId: getLongestWaiting(queues.inscription)?.id || null
        },
        triage: {
          count: queues.triage.length,
          patients: queues.triage,
          longestWaitingId: getLongestWaiting(queues.triage)?.id || null
        },
        waitingTreatment: {
          count: queues.waitingTreatment.length,
          patients: queues.waitingTreatment,
          longestWaitingId: getLongestWaiting(queues.waitingTreatment)?.id || null
        },
        inTreatment: {
          count: queues.inTreatment.length,
          patients: queues.inTreatment,
          longestWaitingId: getLongestWaiting(queues.inTreatment)?.id || null
        },
        withDoctor: {
          count: queues.withDoctor.length,
          patients: queues.withDoctor,
          longestWaitingId: getLongestWaiting(queues.withDoctor)?.id || null
        }
      },
      summary: {
        total: patientsWithWaitTime.length,
        critical: patientsWithWaitTime.filter((p: QueuePatient) => p.isCritical).length,
        retriageRequested: patientsWithWaitTime.filter((p: QueuePatient) => p.retriageRequested).length
      }
    });
  } catch (error) {
    console.error('Queue stats error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/stats/export - Export stats as CSV data
router.get('/export', async (req, res) => {
  try {
    const db = getDb();
    const { startDate, endDate } = req.query;

    let dateStart = new Date();
    dateStart.setHours(0, 0, 0, 0);
    let dateEnd = new Date();
    dateEnd.setHours(23, 59, 59, 999);

    if (startDate) {
      dateStart = new Date(startDate as string);
      dateStart.setHours(0, 0, 0, 0);
    }
    if (endDate) {
      dateEnd = new Date(endDate as string);
      dateEnd.setHours(23, 59, 59, 999);
    }

    const startIso = dateStart.toISOString();
    const endIso = dateEnd.toISOString();

    const allPatients = await db
      .select({
        id: patients.id,
        fullName: patients.fullName,
        age: patients.age,
        sex: patients.sex,
        status: patients.status,
        esiLevel: patients.esiLevel,
        newsScore: patients.newsScore,
        gcsScore: patients.gcsScore,
        qsofaScore: patients.qsofaScore,
        finalOrientation: patients.finalOrientation,
        chiefComplaint: patients.chiefComplaint,
        createdAt: patients.createdAt,
        triageStartedAt: patients.triageStartedAt,
        triageCompletedAt: patients.triageCompletedAt,
        treatmentStartedAt: patients.treatmentStartedAt,
        dischargedAt: patients.dischargedAt,
        dischargeType: patients.dischargeType
      })
      .from(patients)
      .where(and(gte(patients.createdAt, startIso), lte(patients.createdAt, endIso)))
      .orderBy(desc(patients.createdAt));

    // Calculate passage times
    type ExportPatient = typeof allPatients[number];
    const exportData = allPatients.map((p: ExportPatient) => {
      const triageWait = p.triageStartedAt
        ? Math.round((new Date(p.triageStartedAt).getTime() - new Date(p.createdAt).getTime()) / 60000)
        : null;
      const triageDuration = p.triageStartedAt && p.triageCompletedAt
        ? Math.round((new Date(p.triageCompletedAt).getTime() - new Date(p.triageStartedAt).getTime()) / 60000)
        : null;
      const totalPassage = p.dischargedAt
        ? Math.round((new Date(p.dischargedAt).getTime() - new Date(p.createdAt).getTime()) / 60000)
        : null;

      return {
        ...p,
        triageWaitMinutes: triageWait,
        triageDurationMinutes: triageDuration,
        totalPassageMinutes: totalPassage
      };
    });

    res.json(exportData);
  } catch (error) {
    console.error('Export stats error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export { router as statsRouter };
