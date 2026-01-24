import { Router } from 'express';
import { eq, and, gte, sql } from 'drizzle-orm';
import { getDb } from '../../database';
import { patients, users, boxes } from '../../database/schema';

const router = Router();

// GET /api/stats/dashboard - Get dashboard statistics
router.get('/dashboard', async (req, res) => {
  try {
    const db = getDb();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();

    // Patient counts by status for today
    const patientStats = await db
      .select({
        status: patients.status,
        count: sql<number>`count(*)`,
      })
      .from(patients)
      .where(gte(patients.createdAt, todayIso))
      .groupBy(patients.status);

    // Convert to object
    const statusCounts: Record<string, number> = {};
    patientStats.forEach((s) => {
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
          gte(patients.createdAt, todayIso),
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

    // Average triage time (for completed triages today)
    const avgTriageTime = await db
      .select({
        avgMinutes: sql<number>`AVG(
          (julianday(${patients.triageCompletedAt}) - julianday(${patients.triageStartedAt})) * 24 * 60
        )`,
      })
      .from(patients)
      .where(
        and(
          gte(patients.createdAt, todayIso),
          sql`${patients.triageCompletedAt} IS NOT NULL`,
          sql`${patients.triageStartedAt} IS NOT NULL`
        )
      );

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
      },
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Erreur serveur lors du chargement des statistiques' });
  }
});

// GET /api/stats/queues - Get queue lengths for each status
router.get('/queues', async (req, res) => {
  try {
    const db = getDb();

    const queues = await db
      .select({
        status: patients.status,
        count: sql<number>`count(*)`,
      })
      .from(patients)
      .where(sql`${patients.status} != 'DISCHARGED'`)
      .groupBy(patients.status);

    res.json(
      queues.map((q) => ({
        status: q.status,
        count: Number(q.count),
      }))
    );
  } catch (error) {
    console.error('Queue stats error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export { router as statsRouter };
