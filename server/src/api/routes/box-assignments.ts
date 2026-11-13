import { Router } from 'express';
import { eq, and, lte, gt, ne } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb } from '../../database';
import { boxAssignments, boxes, users, patients } from '../../database/schema';
import { AuthRequest } from '../middleware/auth';

// Helper function to get all doctors currently assigned to a box
export async function getCurrentDoctorsForBox(boxId: string): Promise<Array<{ doctorId: string; doctorName: string }>> {
  const db = getDb();
  const now = new Date().toISOString();

  const result = await db
    .select({
      doctorId: boxAssignments.doctorId,
      doctorName: users.fullName,
    })
    .from(boxAssignments)
    .innerJoin(users, eq(boxAssignments.doctorId, users.id))
    .where(
      and(
        eq(boxAssignments.boxId, boxId),
        eq(boxAssignments.isActive, true),
        lte(boxAssignments.startDateTime, now),
        gt(boxAssignments.endDateTime, now)
      )
    );

  return result.map((r: { doctorId: string; doctorName: string }) => ({ doctorId: r.doctorId, doctorName: r.doctorName }));
}

// Pick the doctor with the fewest active patients from a list of doctors
export async function getLeastLoadedDoctor(
  doctors: Array<{ doctorId: string; doctorName: string }>
): Promise<{ doctorId: string; doctorName: string } | null> {
  if (doctors.length === 0) return null;
  if (doctors.length === 1) return doctors[0];

  const db = getDb();
  let bestDoctor = doctors[0];
  let minCount = Infinity;

  for (const doctor of doctors) {
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(patients)
      .where(
        and(
          eq(patients.assignedDoctorId, doctor.doctorId),
          ne(patients.status, 'DISCHARGED')
        )
      );

    const count = countResult[0]?.count ?? 0;
    if (count < minCount) {
      minCount = count;
      bestDoctor = doctor;
    }
  }

  return bestDoctor;
}

const router = Router();

// Type for assignment query results
interface AssignmentRow {
  id: string;
  boxId: string;
  boxName: string;
  boxType: string;
  doctorId: string;
  doctorName: string;
  startDateTime: string;
  endDateTime: string;
  presetType: string | null;
  isActive: boolean;
  createdAt: string;
}

interface CurrentDoctorRow {
  id: string;
  doctorId: string;
  doctorName: string;
  startDateTime: string;
  endDateTime: string;
}

interface OverlapCheckRow {
  id: string;
  doctorId: string;
  doctorName: string;
  startDateTime: string;
  endDateTime: string;
}

interface DoctorAssignmentRow {
  id: string;
  boxId: string;
  boxName: string;
  boxType: string;
  startDateTime: string;
  endDateTime: string;
  presetType: string | null;
}

interface ActiveAssignmentRow {
  id: string;
  boxId: string;
  doctorId: string;
  startDateTime: string;
  endDateTime: string;
}

// List assignments with doctor and box details
// Query params:
//   - current=true: only assignments active right now
//   - date=YYYY-MM-DD: only assignments covering this date
//   - boxId=xxx: filter by box
//   - doctorId=xxx: filter by doctor
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const { current, date, boxId, doctorId } = req.query;

    const query = db
      .select({
        id: boxAssignments.id,
        boxId: boxAssignments.boxId,
        boxName: boxes.name,
        boxType: boxes.boxType,
        doctorId: boxAssignments.doctorId,
        doctorName: users.fullName,
        startDateTime: boxAssignments.startDateTime,
        endDateTime: boxAssignments.endDateTime,
        presetType: boxAssignments.presetType,
        isActive: boxAssignments.isActive,
        createdAt: boxAssignments.createdAt,
      })
      .from(boxAssignments)
      .innerJoin(boxes, eq(boxAssignments.boxId, boxes.id))
      .innerJoin(users, eq(boxAssignments.doctorId, users.id))
      .where(eq(boxAssignments.isActive, true));

    const result = await query as AssignmentRow[];

    // Apply time-based filters in JavaScript (SQLite datetime comparison quirks)
    let filtered = result;

    if (current === 'true') {
      const now = new Date().toISOString();
      filtered = filtered.filter(
        (a: AssignmentRow) => a.startDateTime <= now && a.endDateTime > now
      );
    } else if (date) {
      // Filter assignments that overlap with the given date
      const dayStart = `${date}T00:00:00`;
      const dayEnd = `${date}T23:59:59`;
      filtered = filtered.filter(
        (a: AssignmentRow) => a.startDateTime <= dayEnd && a.endDateTime >= dayStart
      );
    }

    if (boxId) {
      filtered = filtered.filter((a: AssignmentRow) => a.boxId === boxId);
    }

    if (doctorId) {
      filtered = filtered.filter((a: AssignmentRow) => a.doctorId === doctorId);
    }

    // Sort by start time descending (most recent first)
    filtered.sort((a: AssignmentRow, b: AssignmentRow) => b.startDateTime.localeCompare(a.startDateTime));

    res.json(filtered);
  } catch (error) {
    console.error('List box assignments error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get doctors currently assigned to a box (for patient workflow)
// Returns array of all current doctors for this box
router.get('/current-doctor/:boxId', async (req, res) => {
  try {
    const db = getDb();
    const now = new Date().toISOString();

    const result = await db
      .select({
        id: boxAssignments.id,
        doctorId: boxAssignments.doctorId,
        doctorName: users.fullName,
        startDateTime: boxAssignments.startDateTime,
        endDateTime: boxAssignments.endDateTime,
      })
      .from(boxAssignments)
      .innerJoin(users, eq(boxAssignments.doctorId, users.id))
      .where(
        and(
          eq(boxAssignments.boxId, req.params.boxId),
          eq(boxAssignments.isActive, true)
        )
      ) as CurrentDoctorRow[];

    // Filter for current time - return all matching doctors
    const currentDoctors = result.filter(
      (a: CurrentDoctorRow) => a.startDateTime <= now && a.endDateTime > now
    );

    res.json(currentDoctors);
  } catch (error) {
    console.error('Get current doctors error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /ending-soon - Shifts ending in the next 30 minutes with patient counts
router.get('/ending-soon', async (req, res) => {
  try {
    const db = getDb();
    const now = new Date();
    const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);
    const nowISO = now.toISOString();
    const futureISO = thirtyMinutesFromNow.toISOString();

    // Find active shifts that are currently running and ending within 30 minutes
    const endingShifts = await db
      .select({
        assignmentId: boxAssignments.id,
        doctorId: boxAssignments.doctorId,
        doctorName: users.fullName,
        boxId: boxAssignments.boxId,
        boxName: boxes.name,
        boxType: boxes.boxType,
        startDateTime: boxAssignments.startDateTime,
        endDateTime: boxAssignments.endDateTime,
      })
      .from(boxAssignments)
      .innerJoin(users, eq(boxAssignments.doctorId, users.id))
      .innerJoin(boxes, eq(boxAssignments.boxId, boxes.id))
      .where(
        and(
          eq(boxAssignments.isActive, true),
          lte(boxAssignments.startDateTime, nowISO),
          gt(boxAssignments.endDateTime, nowISO)
        )
      );

    // Filter for ending within 30 minutes and count patients for each
    const results = [];

    for (const shift of endingShifts) {
      if (shift.endDateTime > futureISO) continue;

      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(patients)
        .where(
          and(
            eq(patients.assignedDoctorId, shift.doctorId),
            ne(patients.status, 'DISCHARGED')
          )
        );

      results.push({
        ...shift,
        patientCount: countResult[0]?.count ?? 0,
      });
    }

    res.json(results);
  } catch (error) {
    console.error('Get ending-soon shifts error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Create assignment
router.post('/', async (req, res) => {
  try {
    const { role } = (req as AuthRequest).user!;
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { boxId, doctorId, startDateTime, endDateTime, presetType } = req.body;

    // Validation
    if (!boxId || !doctorId || !startDateTime || !endDateTime) {
      return res.status(400).json({
        error: 'Champs requis: boxId, doctorId, startDateTime, endDateTime'
      });
    }

    const start = new Date(startDateTime);
    const end = new Date(endDateTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Format de date invalide' });
    }

    if (end <= start) {
      return res.status(400).json({
        error: 'La date de fin doit être après la date de début'
      });
    }

    const db = getDb();

    // Check for duplicate: same doctor assigned to same box at overlapping times
    const startISO = start.toISOString();
    const endISO = end.toISOString();

    const existingForDoctor = await db
      .select({
        id: boxAssignments.id,
        doctorId: boxAssignments.doctorId,
        doctorName: users.fullName,
        startDateTime: boxAssignments.startDateTime,
        endDateTime: boxAssignments.endDateTime,
      })
      .from(boxAssignments)
      .innerJoin(users, eq(boxAssignments.doctorId, users.id))
      .where(
        and(
          eq(boxAssignments.boxId, boxId),
          eq(boxAssignments.doctorId, doctorId),
          eq(boxAssignments.isActive, true)
        )
      ) as OverlapCheckRow[];

    const duplicate = existingForDoctor.find((a: OverlapCheckRow) => {
      return a.startDateTime < endISO && startISO < a.endDateTime;
    });

    if (duplicate) {
      return res.status(409).json({
        error: `Ce médecin est déjà assigné à ce box pendant cette période`,
        conflicts: [duplicate]
      });
    }

    // Create new assignment
    const id = randomUUID();
    await db.insert(boxAssignments).values({
      id,
      boxId,
      doctorId,
      startDateTime: startISO,
      endDateTime: endISO,
      presetType: presetType || null,
      isActive: true,
    });

    res.status(201).json({ id });
  } catch (error) {
    console.error('Create box assignment error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /my-assignment - Get doctor's current box assignment
router.get('/my-assignment', async (req, res) => {
  try {
    const { role, userId } = (req as AuthRequest).user!;

    if (role !== 'DOCTOR' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Seuls les médecins peuvent accéder à cette ressource',
      });
    }

    const db = getDb();
    const now = new Date().toISOString();

    const result = await db
      .select({
        id: boxAssignments.id,
        boxId: boxAssignments.boxId,
        boxName: boxes.name,
        boxType: boxes.boxType,
        startDateTime: boxAssignments.startDateTime,
        endDateTime: boxAssignments.endDateTime,
        presetType: boxAssignments.presetType,
      })
      .from(boxAssignments)
      .innerJoin(boxes, eq(boxAssignments.boxId, boxes.id))
      .where(
        and(
          eq(boxAssignments.doctorId, userId),
          eq(boxAssignments.isActive, true)
        )
      ) as DoctorAssignmentRow[];

    // Find current active assignment
    const currentAssignment = result.find(
      (a: DoctorAssignmentRow) => a.startDateTime <= now && a.endDateTime > now
    );

    res.json(currentAssignment || null);
  } catch (error) {
    console.error('Get my assignment error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /my-assignment - Doctor self-assignment (start NOW)
router.put('/my-assignment', async (req, res) => {
  try {
    const { role, userId } = (req as AuthRequest).user!;

    if (role !== 'DOCTOR' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Seuls les médecins peuvent changer leur assignation',
      });
    }

    const { boxId, presetType, endDateTime: customEndDateTime } = req.body;

    if (!boxId) {
      return res.status(400).json({ error: 'boxId requis' });
    }

    if (!presetType) {
      return res.status(400).json({ error: 'presetType requis' });
    }

    const db = getDb();
    const now = new Date();
    const startDateTime = now.toISOString();

    // Calculate end time based on preset
    let endDateTime: string;
    if (presetType === 'CUSTOM') {
      if (!customEndDateTime) {
        return res.status(400).json({
          error: 'endDateTime requis pour le type CUSTOM',
        });
      }
      endDateTime = new Date(customEndDateTime).toISOString();
    } else {
      // Calculate based on preset
      const presetConfigs: Record<string, { hours: number; nextDay: boolean }> = {
        GARDE_24H: { hours: 24, nextDay: false },
        JOUR_12H: { hours: 12, nextDay: false },
        NUIT_12H: { hours: 12, nextDay: false },
        MATIN_ETE: { hours: 6, nextDay: false },
      };

      const config = presetConfigs[presetType];
      if (!config) {
        return res.status(400).json({ error: 'Type de preset invalide' });
      }

      const endDate = new Date(now.getTime() + config.hours * 60 * 60 * 1000);
      endDateTime = endDate.toISOString();
    }

    // Validate end is after start
    if (new Date(endDateTime) <= now) {
      return res.status(400).json({
        error: 'La date de fin doit être dans le futur',
      });
    }

    // Check if box exists and is active
    const boxExists = await db
      .select()
      .from(boxes)
      .where(and(eq(boxes.id, boxId), eq(boxes.isActive, true)));

    if (boxExists.length === 0) {
      return res.status(400).json({ error: 'Box invalide ou inactive' });
    }

    // End any current active assignments for this doctor
    const currentAssignments = await db
      .select({
        id: boxAssignments.id,
        boxId: boxAssignments.boxId,
        doctorId: boxAssignments.doctorId,
        startDateTime: boxAssignments.startDateTime,
        endDateTime: boxAssignments.endDateTime,
      })
      .from(boxAssignments)
      .where(
        and(
          eq(boxAssignments.doctorId, userId),
          eq(boxAssignments.isActive, true)
        )
      ) as ActiveAssignmentRow[];

    const activeNow = currentAssignments.filter(
      (a: ActiveAssignmentRow) => a.startDateTime <= startDateTime && a.endDateTime > startDateTime
    );

    // Soft-delete (deactivate) current active assignments
    for (const assignment of activeNow) {
      await db
        .update(boxAssignments)
        .set({ isActive: false })
        .where(eq(boxAssignments.id, assignment.id));
    }

    // Check if this doctor is already assigned to this box (duplicate guard)
    const existingOnBox = await db
      .select({
        id: boxAssignments.id,
        startDateTime: boxAssignments.startDateTime,
        endDateTime: boxAssignments.endDateTime,
      })
      .from(boxAssignments)
      .where(
        and(
          eq(boxAssignments.boxId, boxId),
          eq(boxAssignments.doctorId, userId),
          eq(boxAssignments.isActive, true)
        )
      );

    const alreadyAssigned = existingOnBox.find((a: { startDateTime: string; endDateTime: string }) => {
      return a.startDateTime < endDateTime && startDateTime < a.endDateTime;
    });

    if (alreadyAssigned) {
      return res.status(409).json({
        error: 'Vous êtes déjà assigné à ce box',
      });
    }

    // Create new assignment starting NOW
    const id = randomUUID();
    await db.insert(boxAssignments).values({
      id,
      boxId,
      doctorId: userId,
      startDateTime,
      endDateTime,
      presetType,
      isActive: true,
    });

    // Fetch the created assignment with box details
    const created = await db
      .select({
        id: boxAssignments.id,
        boxId: boxAssignments.boxId,
        boxName: boxes.name,
        boxType: boxes.boxType,
        startDateTime: boxAssignments.startDateTime,
        endDateTime: boxAssignments.endDateTime,
        presetType: boxAssignments.presetType,
      })
      .from(boxAssignments)
      .innerJoin(boxes, eq(boxAssignments.boxId, boxes.id))
      .where(eq(boxAssignments.id, id));

    res.status(201).json(created[0]);
  } catch (error) {
    console.error('Doctor self-assignment error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /my-assignment - End doctor's current assignment
router.delete('/my-assignment', async (req, res) => {
  try {
    const { role, userId } = (req as AuthRequest).user!;

    if (role !== 'DOCTOR' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Seuls les médecins peuvent accéder à cette ressource',
      });
    }

    const db = getDb();

    // Find all active assignments for this doctor (regardless of time window)
    const activeAssignments = await db
      .select({
        id: boxAssignments.id,
      })
      .from(boxAssignments)
      .where(
        and(
          eq(boxAssignments.doctorId, userId),
          eq(boxAssignments.isActive, true)
        )
      );

    if (activeAssignments.length === 0) {
      // No active assignments - just clear client state, not an error
      return res.json({ message: 'Aucune assignation à terminer' });
    }

    // Deactivate all active assignments for this doctor
    for (const assignment of activeAssignments) {
      await db
        .update(boxAssignments)
        .set({ isActive: false })
        .where(eq(boxAssignments.id, assignment.id));
    }

    res.json({ message: 'Assignation terminée' });
  } catch (error) {
    console.error('End my assignment error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Remove assignment (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { role } = (req as AuthRequest).user!;
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const db = getDb();
    await db
      .update(boxAssignments)
      .set({ isActive: false })
      .where(eq(boxAssignments.id, req.params.id));

    res.json({ message: 'Affectation supprimée' });
  } catch (error) {
    console.error('Delete box assignment error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export { router as boxAssignmentsRouter };
